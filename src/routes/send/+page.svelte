<script lang="ts">
  import { ArrowRight, Check, CircleDot, Cpu, Download, FileUp, Gauge, LockKeyhole, QrCode, ScanLine } from '@lucide/svelte';
  import { onDestroy, onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import AnimatedUrQr from '$lib/components/AnimatedUrQr.svelte';
  import UrQrScanner from '$lib/components/UrQrScanner.svelte';
  import { downloadText, readTransferFile } from '$lib/transfer';
  import { shortSats } from '$lib/data';
  import { toast } from '$lib/stores/toasts';
  import { feeRate as asFeeRate, sats, walletService, type CoinSelection, type FeeEstimates, type HardwareDevice, type MultisigProposal, type PaymentProposal } from '$lib/wallet';
  import type { Utxo } from '$lib/types';
  import { defaultConfig, networkName } from '$lib/config';
  import { addressPrefixForNetwork, hasAddressPrefixForNetwork } from '$lib/wallet/policy';

  let step = $state(1);
  let address = $state('');
  let amount = $state('');
  let speed = $state('medium');
  let customFee = $state('');
  let passphrase = $state('');
  let credentialError = $state('');
  let broadcasting = $state(false);
  let preparing = $state(false);
  let available = $state(0);
  let estimates = $state<FeeEstimates | null>(null);
  let proposal = $state<PaymentProposal | null>(null);
  let txid = $state('');
  let sentAmount = $state(0);
  let balanceSyncPending = $state(false);
  let coins = $state<Utxo[]>([]);
  let selectedCoins = $state<string[]>([]);
  let showCoins = $state(false);
  let externalSigner = $state(false), externalProposal = $state<MultisigProposal|null>(null), deviceOpen = $state(false), importOpen = $state(false), qrOpen = $state(false), qrScanOpen = $state(false), devices = $state<HardwareDevice[]>([]), imported = $state(''), urFrames = $state<string[]>([]), scannedFrames = $state<string[]>([]);
  const selection = $derived<CoinSelection>(selectedCoins.length ? { mode: 'manual', outpoints: selectedCoins } : { mode: 'auto' });
  const fees = $derived({ slow: Number(estimates?.economy ?? 1), medium: Number(estimates?.standard ?? 2), fast: Number(estimates?.priority ?? 5) });
  const selectedFeeRate = $derived(speed === 'custom' ? Number(customFee || 0) : fees[speed as keyof typeof fees]);
  const fee = $derived(Number(proposal?.fee ?? Math.max(0, Math.round(selectedFeeRate * 141))));
  const amountSats = $derived(Number(amount || 0));
  const addressValid = $derived(hasAddressPrefixForNetwork(address, defaultConfig.network));
  const valid = $derived(addressValid && Number.isSafeInteger(amountSats) && amountSats > 0 && amountSats + fee <= available && selectedFeeRate > 0);

  onMount(async () => {
    try {
      const [snapshot, feeData, registry] = await Promise.all([walletService.snapshot(), walletService.estimateFees(), walletService.profiles()]);
      externalSigner = registry.wallets.find((profile) => profile.id === registry.selectedWalletId)?.kind === 'watch_only';
      if (!externalSigner) {
        try { await walletService.externalSignerWallet(); externalSigner = true; } catch { /* selected wallet is not externally signed */ }
      }
      coins = snapshot.utxos;
      const requested = new URL(window.location.href).searchParams.get('coins')?.split(',').filter(Boolean) ?? [];
      selectedCoins = requested.filter((outpoint) => snapshot.utxos.some((coin) => coin.outpoint === outpoint && !coin.frozen));
      available = snapshot.utxos.filter((coin) => !coin.frozen && (!selectedCoins.length || selectedCoins.includes(coin.outpoint))).reduce((total, coin) => total + coin.amount, 0);
      estimates = feeData;
      const url = new URL(window.location.href);
      const acceleration = url.searchParams.get('accelerate');
      const accelerationTxid = url.searchParams.get('txid');
      if (accelerationTxid && (acceleration === 'rbf' || acceleration === 'cpfp')) {
        proposal = await walletService.prepareAcceleration(accelerationTxid, acceleration, asFeeRate(Number(feeData.priority)));
        address = proposal.recipient; amount = String(proposal.amount); speed = 'fast';
        if (externalSigner) externalProposal = (await walletService.externalSignerProposals()).find((item) => item.proposalId === proposal?.proposalId) ?? null;
        step = 2;
      }
    } catch (cause) {
      toast({ title: 'Could not load wallet', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' });
    }
  });

  onDestroy(() => {
    passphrase = '';
  });

  async function prepare() {
    if (!valid) return;
    preparing = true;
    try {
      proposal = await walletService.preparePayment(address, sats(amountSats), asFeeRate(selectedFeeRate), selection);
      if (externalSigner) externalProposal = (await walletService.externalSignerProposals()).find((item) => item.proposalId === proposal?.proposalId) ?? null;
      step = 2;
    } catch (cause) {
      toast({ title: 'Could not prepare payment', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' });
    } finally { preparing = false; }
  }

  function useAutomatic() {
    selectedCoins = [];
    showCoins = false;
    available = coins.filter((coin) => !coin.frozen).reduce((total, coin) => total + coin.amount, 0);
  }
  function toggleCoin(outpoint: string, checked: boolean) {
    selectedCoins = checked ? [...selectedCoins, outpoint] : selectedCoins.filter((item) => item !== outpoint);
    available = coins.filter((coin) => !coin.frozen && selectedCoins.includes(coin.outpoint)).reduce((total, coin) => total + coin.amount, 0);
  }

  async function broadcast() {
    if (!passphrase || !proposal) return;
    credentialError = '';
    broadcasting = true;
    try {
      const result = externalSigner
        ? await walletService.broadcastExternalSignerProposal(proposal.proposalId, passphrase)
        : await walletService.signAndBroadcast(proposal.proposalId, passphrase);
      txid = result.txid;
      sentAmount = Number(proposal.amount);
      balanceSyncPending = result.syncPending;
      available = result.snapshot.balance.total;
      passphrase = '';
      step = 4;
    } catch (cause) {
      credentialError = cause instanceof Error ? cause.message : 'Could not sign or broadcast.';
      passphrase = '';
    } finally { broadcasting = false; }
  }
  async function scanHardware(){deviceOpen=true;broadcasting=true;credentialError='';try{devices=await walletService.listHardwareDevices();}catch(cause){devices=[];credentialError=cause instanceof Error?cause.message:'Could not find hardware.';}finally{broadcasting=false;}}
  async function signHardware(device:HardwareDevice){if(!proposal)return;broadcasting=true;credentialError='';try{externalProposal=await walletService.signExternalWithHardware(proposal.proposalId,device.id);deviceOpen=false;toast({title:'Hardware signature added',tone:'success'});}catch(cause){credentialError=cause instanceof Error?cause.message:'Hardware signing failed.';}finally{broadcasting=false;}}
  async function importSigned(){if(!proposal||!imported.trim())return;broadcasting=true;credentialError='';try{externalProposal=await walletService.importExternalSignerProposal(proposal.proposalId,imported);imported='';importOpen=false;toast({title:'Signed PSBT validated',tone:'success'});}catch(cause){credentialError=cause instanceof Error?cause.message:'Signed PSBT was rejected.';}finally{broadcasting=false;}}
  async function loadSignedFile(event:Event){const input=event.currentTarget as HTMLInputElement;const file=input.files?.[0];input.value='';if(!file)return;try{imported=await readTransferFile(file);}catch(cause){credentialError=cause instanceof Error?cause.message:'Could not read PSBT.';}}
  async function showPsbtQr(){if(!externalProposal)return;broadcasting=true;credentialError='';try{urFrames=await walletService.encodePsbtUr(externalProposal.psbt);qrOpen=true;}catch(cause){credentialError=cause instanceof Error?cause.message:'Could not encode the PSBT QR.';}finally{broadcasting=false;}}
  async function receiveUrFrame(frame:string){if(scannedFrames.includes(frame))return;scannedFrames=[...scannedFrames,frame];try{imported=await walletService.decodePsbtUr(scannedFrames);qrScanOpen=false;await importSigned();}catch(cause){const message=cause instanceof Error?cause.message:'';if(!message.includes('Keep scanning'))credentialError=message||'The QR frame was rejected.';}}
</script>

<div class="page narrow-page send-page">
  <header class="page-header"><div><p class="eyebrow">SEND</p><h1>Send bitcoin</h1><p class="subtitle">{step === 1 ? 'Enter payment details.' : step === 2 ? 'Review everything carefully.' : step === 3 ? 'Unlock, sign, and broadcast.' : 'Payment sent.'}</p></div></header>
  <div class="stepper"><span class:active={step >= 1}>1</span><i class:active={step >= 2}></i><span class:active={step >= 2}>2</span><i class:active={step >= 3}></i><span class:active={step >= 3}>3</span></div>

  {#if step === 1}
    <form class="form-card" onsubmit={(event) => { event.preventDefault(); prepare(); }}>
      <div class="coin-control-field"><span>Coin selection</span><button type="button" class="coin-mode" onclick={() => showCoins = !showCoins}><CircleDot size={16}/><span><strong>{selectedCoins.length ? `Manual · ${selectedCoins.length} coin${selectedCoins.length === 1 ? '' : 's'}` : 'Automatic selection'}</strong><small>{selectedCoins.length ? `${shortSats(available)} sats available` : 'Frozen coins stay untouched'}</small></span><b>{showCoins ? 'Done' : 'Choose'}</b></button>
        {#if showCoins}<div class="send-coin-picker">{#each coins as coin}<label class:frozen={coin.frozen}><input type="checkbox" checked={selectedCoins.includes(coin.outpoint)} disabled={coin.frozen} onchange={(event) => toggleCoin(coin.outpoint, event.currentTarget.checked)}/><span><strong>{coin.label}</strong><small>{shortSats(coin.amount)} sats{coin.frozen ? ' · Frozen' : ''}</small></span></label>{/each}<button type="button" onclick={useAutomatic}>Use automatic selection</button></div>{/if}
      </div>
      <label class="field"><span>Bitcoin address</span><input bind:value={address} placeholder="{addressPrefixForNetwork(defaultConfig.network)}q…" />{#if address && !addressValid}<em>Enter a valid {networkName(defaultConfig.network)} address</em>{/if}</label>
      <label class="field"><span>Amount</span><div class="amount-input"><input bind:value={amount} inputmode="numeric" placeholder="0" /><b>sats</b><button type="button" onclick={() => amount = String(Math.max(0, available - 1000))}>Max</button></div><small>Available: {shortSats(available)} sats</small></label>
      <div class="field"><span>Network fee</span><div class="fee-options">
        {#each [{id:'slow',name:'Economy',rate:fees.slow},{id:'medium',name:'Standard',rate:fees.medium},{id:'fast',name:'Priority',rate:fees.fast}] as option}
          <button type="button" class:active={speed === option.id} onclick={() => speed = option.id}><span><strong>{option.name}</strong><small>Next block</small></span><b>{option.rate} sat/vB</b></button>
        {/each}
        <button type="button" class:active={speed === 'custom'} onclick={() => speed = 'custom'}><span><strong>Custom</strong><small>Set rate</small></span>{#if speed === 'custom'}<input aria-label="Custom fee rate" bind:value={customFee} onclick={(event) => event.stopPropagation()} inputmode="decimal" placeholder="0" />{:else}<Gauge size={17} />{/if}</button>
      </div><small>Fee estimates: {estimates?.source ?? 'loading…'} · Estimated fee {shortSats(fee)} sats</small></div>
      <Button type="submit" disabled={!valid} loading={preparing} loadingLabel="Preparing payment…" size="large" class="full">Review payment<ArrowRight size={17} /></Button>
    </form>
  {:else if step === 2 && proposal}
    <section class="form-card">
      <div class="review-amount"><span>You send</span><strong>{shortSats(proposal.amount)} <small>sats</small></strong></div>
      <dl class="details-list"><div><dt>To</dt><dd class="mono">{proposal.recipient}</dd></div><div><dt>Coins</dt><dd>{proposal.selectedOutpoints.length ? `${proposal.selectedOutpoints.length} selected` : 'Automatic selection'}</dd></div><div><dt>Fee rate</dt><dd>{proposal.feeRate} sat/vB</dd></div><div><dt>Network fee</dt><dd>{shortSats(proposal.fee)} sats</dd></div><div class="total"><dt>Total</dt><dd>{shortSats(proposal.total)} sats</dd></div></dl>
      <div class="warning-box">Bitcoin transactions cannot be reversed. Verify the address and amount before signing.</div>
      <div class="split-actions"><Button variant="secondary" size="large" onclick={() => { proposal = null; step = 1; }}>Back</Button><Button size="large" onclick={() => step = 3}>Continue to sign<ArrowRight size={17} /></Button></div>
    </section>
  {:else if step === 3 && proposal && externalSigner}
    <section class="form-card sign-card">
      <span class="sign-icon"><Cpu size={25}/></span><h2>Sign on your hardware</h2><p>Verify the address, amount, and fee on the signer. Satchel never receives its private key or hardware passphrase.</p>
      <div class="psbt-actions"><Button variant="secondary" onclick={scanHardware}><Cpu size={16}/>Sign with cable</Button><Button variant="secondary" onclick={showPsbtQr}><QrCode size={16}/>Show unsigned QR</Button><Button variant="secondary" onclick={() => {scannedFrames=[];qrScanOpen=true;}}><ScanLine size={16}/>Scan signed QR</Button><Button variant="secondary" onclick={() => importOpen=true}><FileUp size={16}/>Import signed PSBT</Button><Button variant="secondary" onclick={() => externalProposal&&downloadText(`satchel-${externalProposal.proposalId}.psbt`,externalProposal.psbt)}><Download size={16}/>Save unsigned PSBT</Button></div>
      {#if externalProposal?.canFinalize}<div class="ready-panel"><Check size={18}/><div><strong>Signature verified</strong><small>Enter this wallet’s Satchel app PIN to broadcast.</small></div></div><PasswordField label="App PIN" bind:value={passphrase} oninput={() => credentialError=''} autocomplete="current-password" error={credentialError}/><Button size="large" class="full" disabled={!passphrase} loading={broadcasting} loadingLabel="Broadcasting…" onclick={broadcast}>Finalize & broadcast</Button>{:else if credentialError}<p class="form-error">{credentialError}</p>{/if}
      <Button variant="ghost" class="full" onclick={() => step=2}>Back to review</Button>
    </section>
  {:else if step === 3 && proposal}
    <form class="form-card sign-card" onsubmit={(event) => { event.preventDefault(); broadcast(); }}>
      <span class="sign-icon"><LockKeyhole size={25} /></span><h2>Authorize payment</h2><p>Enter your wallet passphrase to unlock the signing keys. It never leaves this device.</p>
      <PasswordField label="Wallet passphrase" bind:value={passphrase} oninput={() => credentialError = ''} placeholder="Enter wallet passphrase" autocomplete="current-password" error={credentialError} hint="The BIP39 passphrase kept with this software wallet’s recovery words." />
      <Button type="submit" size="large" class="full" disabled={!passphrase} loading={broadcasting} loadingLabel="Signing & broadcasting…">Sign & broadcast {shortSats(proposal.amount)} sats</Button>
      <Button variant="ghost" class="full" onclick={() => step = 2}>Back to review</Button>
    </form>
  {:else}
    <section class="empty-state success-state"><span class="empty-icon success"><Check size={25} /></span><h2>Payment sent</h2><p>{shortSats(sentAmount)} sats was broadcast to the Bitcoin network.{#if balanceSyncPending} Balance refresh is pending; sync when the node is available.{/if}</p><div class="txid-box"><span>Transaction ID</span><code>{txid}</code></div><Button onclick={() => { step = 1; address=''; amount=''; passphrase=''; proposal=null; txid=''; sentAmount=0; balanceSyncPending=false; }}>Make another payment</Button><a href="/activity">View transaction</a></section>
  {/if}
</div>

<Modal open={deviceOpen} title="Sign with hardware" description="Use the same passphrase-protected hardware wallet whose fingerprint you imported." onclose={() => deviceOpen=false}>{#if broadcasting}<div class="device-scan"><Cpu size={20}/><span>Scanning…</span></div>{:else if !devices.length}<div class="device-scan"><strong>No device found</strong><span>Unlock the signer, quit its companion app, and scan again.</span><Button variant="secondary" onclick={scanHardware}>Scan again</Button></div>{:else}<div class="source-list">{#each devices as device}<button onclick={() => signHardware(device)}><Cpu size={18}/><span><strong>{device.label}</strong><small>{device.fingerprint ?? device.message}</small></span></button>{/each}</div>{/if}</Modal>
<Modal open={importOpen} title="Import signed PSBT" description="Only a valid signature from this wallet’s exact fingerprint is accepted." onclose={() => importOpen=false}><label class="file-action"><FileUp size={16}/>Choose signed PSBT<input aria-label="Choose signed PSBT file" type="file" accept=".psbt,text/plain" onchange={loadSignedFile}/></label><label class="field"><span>Signed PSBT</span><textarea rows="6" bind:value={imported} placeholder="cHNidP8…"></textarea></label><div class="modal-footer"><Button variant="secondary" onclick={() => importOpen=false}>Cancel</Button><Button disabled={!imported.trim()} loading={broadcasting} loadingLabel="Validating…" onclick={importSigned}>Validate signature</Button></div></Modal>
<Modal open={qrOpen} title="Unsigned PSBT" description="Scan with an offline signer. No private key data is encoded." onclose={() => qrOpen=false}><AnimatedUrQr frames={urFrames}/></Modal>
<Modal open={qrScanOpen} title="Scan signed PSBT" description="Satchel accepts only crypto-psbt UR frames and verifies the exact proposal before importing." onclose={() => qrScanOpen=false}><UrQrScanner onframe={receiveUrFrame}/></Modal>
