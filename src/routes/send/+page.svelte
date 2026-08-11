<script lang="ts">
  import { AlertTriangle, ArrowRight, Check, CircleDot, Cpu, Download, FileUp, Gauge, LockKeyhole, QrCode, RefreshCw, ScanLine, X } from '@lucide/svelte';
  import { onDestroy, onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import HardwareActionPrompt from '$lib/components/HardwareActionPrompt.svelte';
  import TransactionReviewDetails from '$lib/components/TransactionReviewDetails.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import AnimatedUrQr from '$lib/components/AnimatedUrQr.svelte';
  import UrQrScanner from '$lib/components/UrQrScanner.svelte';
  import RecipientAddressModal from '$lib/components/RecipientAddressModal.svelte';
  import SendProgress from '$lib/components/SendProgress.svelte';
  import SignerSummary from '$lib/components/SignerSummary.svelte';
  import { readTransferFile } from '$lib/transfer';
  import { shortSats } from '$lib/data';
  import { toast } from '$lib/stores/toasts';
  import { feeRate as asFeeRate, sats, walletService, type CoinSelection, type ExternalSignerWallet, type FeeEstimates, type HardwareDevice, type MultisigProposal, type PaymentProposal } from '$lib/wallet';
  import type { Utxo } from '$lib/types';
  import { defaultConfig, networkName } from '$lib/config';
  import { addressPrefixForNetwork, hasAddressPrefixForNetwork } from '$lib/wallet/policy';
  import { compactAddress } from '$lib/address-display';
  import { addressForHardwareDisplay } from '$lib/wallet/hardware-display';
  import { latestActiveProposal } from '$lib/wallet/proposal-resume';
  import { fly } from 'svelte/transition';

  let step = $state(1);
  let draftStep = $state<1 | 2>(1);
  let address = $state('');
  let label = $state('');
  let amount = $state('');
  let speed = $state('medium');
  let customFee = $state('');
  let passphrase = $state('');
  let credentialError = $state('');
  let broadcasting = $state(false);
  let savingPsbt = $state(false);
  let preparing = $state(false);
  let available = $state(0);
  let estimates = $state<FeeEstimates | null>(null);
  let proposal = $state<PaymentProposal | null>(null);
  let txid = $state('');
  let sentAmount = $state(0);
  let balanceSyncPending = $state(false);
  let accelerationMethod = $state<'rbf' | 'cpfp' | null>(null);
  let coins = $state<Utxo[]>([]);
  let selectedCoins = $state<string[]>([]);
  let showCoins = $state(false);
  let externalWallet = $state<ExternalSignerWallet | null>(null);
  let signerSummaryReady = $state(false);
  let externalSigner = $state(false), externalProposal = $state<MultisigProposal|null>(null), deviceOpen = $state(false), addressOpen = $state(false), changeAddressOpen = $state(false), hardwareAddressOpen = $state(false), hardwareChangeAddressOpen = $state(false), importOpen = $state(false), qrOpen = $state(false), qrScanOpen = $state(false), cancelOpen = $state(false), cancelError = $state(''), devices = $state<HardwareDevice[]>([]), deviceError = $state(''), imported = $state(''), urFrames = $state<string[]>([]), scannedFrames = $state<string[]>([]);
  let importError = $state('');
  let hardwareAction = $state<'scan' | 'sign'>('scan');
  const selection = $derived<CoinSelection>(selectedCoins.length ? { mode: 'manual', outpoints: selectedCoins } : { mode: 'auto' });
  const fees = $derived({ slow: Number(estimates?.economy ?? 1), medium: Number(estimates?.standard ?? 2), fast: Number(estimates?.priority ?? 5) });
  const selectedFeeRate = $derived(speed === 'custom' ? Number(customFee || 0) : fees[speed as keyof typeof fees]);
  const fee = $derived(Number(proposal?.fee ?? Math.max(0, Math.round(selectedFeeRate * 141))));
  const amountSats = $derived(Number(amount || 0));
  const addressValid = $derived(hasAddressPrefixForNetwork(address, defaultConfig.network));
  const valid = $derived(addressValid && label.trim().length > 0 && label.trim().length <= 48 && Number.isSafeInteger(amountSats) && amountSats > 0 && amountSats + fee <= available && selectedFeeRate > 0);
  const intentValid = $derived(addressValid && label.trim().length > 0 && label.trim().length <= 48);
  const progressStep = $derived<1 | 2 | 3>(step === 1 ? draftStep : 3);
  const signerItems = $derived(externalSigner && externalWallet ? [{ label: externalWallet.signer.label, fingerprint: externalWallet.signer.fingerprint, detail: externalWallet.signer.deviceType ?? 'External hardware signer' }] : [{ label: 'Groot app', detail: 'Software signer · This device', software: true }]);
  const ledgerSigner = $derived(Boolean(externalWallet?.signer.deviceType?.toLowerCase().includes('ledger')));
  const hardwareRecipient = $derived(addressForHardwareDisplay(proposal?.recipient ?? '', proposal?.recipientTestnetAlias, ledgerSigner ? 'ledger' : 'other'));
  const hardwareChangeAddress = $derived(addressForHardwareDisplay(proposal?.changeAddresses[0] ?? '', proposal?.changeTestnetAliases[0], ledgerSigner ? 'ledger' : 'other'));

  onMount(async () => {
    try {
      const [snapshot, feeData, registry] = await Promise.all([walletService.snapshot(), walletService.estimateFees(), walletService.profiles()]);
      externalSigner = registry.wallets.find((profile) => profile.id === registry.selectedWalletId)?.kind === 'watch_only';
      try { externalWallet = await walletService.externalSignerWallet(); externalSigner = true; } catch { /* selected wallet is not externally signed */ }
      signerSummaryReady = true;
      coins = snapshot.utxos;
      const requested = new URL(window.location.href).searchParams.get('coins')?.split(',').filter(Boolean) ?? [];
      selectedCoins = requested.filter((outpoint) => snapshot.utxos.some((coin) => coin.outpoint === outpoint && !coin.frozen));
      available = snapshot.utxos.filter((coin) => !coin.frozen && (!selectedCoins.length || selectedCoins.includes(coin.outpoint))).reduce((total, coin) => total + coin.amount, 0);
      estimates = feeData;
      const url = new URL(window.location.href);
      const acceleration = url.searchParams.get('accelerate');
      const accelerationTxid = url.searchParams.get('txid');
      if (accelerationTxid && (acceleration === 'rbf' || acceleration === 'cpfp')) {
        accelerationMethod = acceleration;
        proposal = await walletService.prepareAcceleration(accelerationTxid, acceleration, asFeeRate(Number(feeData.priority)));
        address = proposal.recipient; label = proposal.label; amount = String(proposal.amount); speed = 'fast';
        if (externalSigner) externalProposal = (await walletService.externalSignerProposals()).find((item) => item.proposalId === proposal?.proposalId) ?? null;
        step = 2;
      } else if (externalSigner) {
        const activeProposal = latestActiveProposal(await walletService.externalSignerProposals());
        if (activeProposal) {
          externalProposal = activeProposal;
          proposal = activeProposal;
          address = activeProposal.recipient;
          label = activeProposal.label;
          amount = String(activeProposal.amount);
          step = activeProposal.canFinalize ? 3 : 2;
        }
      }
    } catch (cause) {
      signerSummaryReady = true;
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
      proposal = await walletService.preparePayment(address, label, sats(amountSats), asFeeRate(selectedFeeRate), selection);
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
        ? await walletService.broadcastExternalSignerProposal(proposal.proposalId, externalProposal?.psbt ?? '', passphrase)
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
  async function scanHardware(){deviceOpen=true;hardwareAction='scan';broadcasting=true;deviceError='';try{devices=await walletService.listHardwareDevices();}catch(cause){devices=[];deviceError=cause instanceof Error?cause.message:'Could not find hardware.';}finally{broadcasting=false;}}
  async function signHardware(device:HardwareDevice){if(!proposal||!externalProposal)return;hardwareAction='sign';broadcasting=true;deviceError='';try{externalProposal=await walletService.signExternalWithHardware(proposal.proposalId,device.id,externalProposal.psbt);deviceOpen=false;toast({title:'Hardware signature added',tone:'success'});}catch(cause){deviceError=cause instanceof Error?cause.message:'Hardware signing failed.';}finally{broadcasting=false;}}
  async function importSigned(){if(!proposal||!externalProposal||!imported.trim())return;broadcasting=true;credentialError='';importError='';try{externalProposal=await walletService.importExternalSignerProposal(proposal.proposalId,externalProposal.psbt,imported);imported='';importOpen=false;toast({title:'Signed PSBT validated',tone:'success'});}catch(cause){importError=cause instanceof Error?cause.message:'Signed PSBT was rejected.';credentialError=importError;toast({title:'Signed PSBT rejected',description:importError,tone:'danger'});}finally{broadcasting=false;}}
  async function loadSignedFile(event:Event){const input=event.currentTarget as HTMLInputElement;const file=input.files?.[0];input.value='';if(!file)return;importError='';credentialError='';try{imported=await readTransferFile(file);}catch(cause){importError=cause instanceof Error?cause.message:'Could not read PSBT.';credentialError=importError;toast({title:'Could not read PSBT',description:importError,tone:'danger'});}}
  async function showPsbtQr(){if(!externalProposal)return;broadcasting=true;credentialError='';try{urFrames=await walletService.encodePsbtUr(externalProposal.psbt);qrOpen=true;}catch(cause){credentialError=cause instanceof Error?cause.message:'Could not encode the PSBT QR.';}finally{broadcasting=false;}}
  async function saveExternalPsbt(){if(!externalProposal||savingPsbt)return;savingPsbt=true;credentialError='';try{const saved=await walletService.savePsbt(`groot-${externalProposal.proposalId}.psbt`,externalProposal.psbt);if(saved.saved)toast({title:'PSBT saved',description:'The unsigned transaction was saved to the selected file.',tone:'success',action:saved.revealToken&&saved.revealLabel?{label:saved.revealLabel,run:async()=>{try{await walletService.revealSavedFile(saved.revealToken!);}catch(cause){toast({title:'Could not show saved PSBT',description:cause instanceof Error?cause.message:undefined,tone:'danger'});}}}:undefined});}catch(cause){credentialError=cause instanceof Error?cause.message:'Could not save the PSBT.';toast({title:'Could not save PSBT',description:credentialError,tone:'danger'});}finally{savingPsbt=false;}}
  async function confirmCancelExternalProposal(){if(!proposal||!externalProposal||broadcasting)return;broadcasting=true;cancelError='';try{await walletService.cancelExternalSignerProposal(proposal.proposalId);proposal=null;externalProposal=null;address='';label='';amount='';passphrase='';step=1;draftStep=1;cancelOpen=false;toast({title:'Payment canceled',description:'The transaction and any collected signatures were discarded.'});}catch(cause){cancelError=cause instanceof Error?cause.message:'The payment could not be canceled.';}finally{broadcasting=false;}}
  async function receiveUrFrame(frame:string){if(scannedFrames.includes(frame))return;scannedFrames=[...scannedFrames,frame];try{imported=await walletService.decodePsbtUr(scannedFrames);qrScanOpen=false;await importSigned();}catch(cause){const message=cause instanceof Error?cause.message:'';if(!message.includes('Keep scanning'))credentialError=message||'The QR frame was rejected.';}}
</script>

<div class="page narrow-page send-page">
  <header class="page-header"><div><p class="eyebrow">SEND</p><h1>Send bitcoin</h1><p class="subtitle">{step === 1 && draftStep === 1 ? 'Name the payment and choose its recipient.' : step === 1 ? 'Choose the amount, coins, and network fee.' : step === 2 ? 'Review everything carefully.' : step === 3 ? 'Unlock, sign, and broadcast.' : accelerationMethod === 'cpfp' ? 'Fee acceleration broadcast.' : accelerationMethod === 'rbf' ? 'Replacement broadcast.' : 'Payment sent.'}</p></div></header>
  {#if step < 4}<SendProgress current={progressStep} />{/if}
  {#if step < 4 && signerSummaryReady}<SignerSummary signers={signerItems} signedFingerprints={externalProposal?.signedFingerprints ?? []} collecting={externalSigner && Boolean(proposal)} />{/if}

  {#if step === 1 && draftStep === 1}
    <form class="form-card send-stage-card" onsubmit={(event) => { event.preventDefault(); if (intentValid) draftStep = 2; }} in:fly={{ x: 8, duration: 180 }}>
      <div class="send-stage-heading"><span>STEP 1</span><h2>What is this payment for?</h2><p>This permanent label helps you recognize the transaction later.</p></div>
      <label class="field"><span>Payment label</span><input aria-label="Payment label" bind:value={label} placeholder="e.g. Hardware purchase, Pay Alex, Test transaction" maxlength="48" /><small>Required · cannot be changed · {label.length}/48</small></label>
      <label class="field"><span>Bitcoin address</span><input aria-label="Bitcoin address" bind:value={address} placeholder="{addressPrefixForNetwork(defaultConfig.network)}q…" />{#if address && !addressValid}<em>Enter a valid {networkName(defaultConfig.network)} address</em>{/if}</label>
      <Button type="submit" disabled={!intentValid} size="large" class="full">Continue to amount<ArrowRight size={17} /></Button>
    </form>
  {:else if step === 1}
    <form class="form-card send-stage-card" onsubmit={(event) => { event.preventDefault(); prepare(); }} in:fly={{ x: 8, duration: 180 }}>
      <div class="send-stage-heading"><span>STEP 2</span><h2>Fund the payment</h2><p>Set the amount, then keep automatic selection or choose specific coins.</p></div>
      <label class="field"><span>Amount</span><div class="amount-input"><input aria-label="Amount" bind:value={amount} inputmode="numeric" placeholder="0" /><b>sats</b><button type="button" onclick={() => amount = String(Math.max(0, available - 1000))}>Max</button></div><small>Available: {shortSats(available)} sats</small></label>
      <div class="coin-control-field"><span>Coin selection</span><button type="button" class="coin-mode" class:open={showCoins} aria-expanded={showCoins} onclick={() => showCoins = !showCoins}><CircleDot size={16}/><span><strong>{selectedCoins.length ? `Manual · ${selectedCoins.length} coin${selectedCoins.length === 1 ? '' : 's'}` : 'Automatic selection'}</strong><small>{selectedCoins.length ? `${shortSats(available)} sats available` : 'Frozen coins stay untouched'}</small></span><b>{showCoins ? 'Done' : 'Choose'}</b></button>
        {#if showCoins}<div class="send-coin-picker">{#each coins as coin}<label class:frozen={coin.frozen}><input type="checkbox" checked={selectedCoins.includes(coin.outpoint)} disabled={coin.frozen} onchange={(event) => toggleCoin(coin.outpoint, event.currentTarget.checked)}/><span><strong>{coin.label}</strong><small>{shortSats(coin.amount)} sats{coin.frozen ? ' · Frozen' : ''}</small></span></label>{/each}<button type="button" onclick={useAutomatic}>Use automatic selection</button></div>{/if}
      </div>
      <div class="field"><span>Network fee</span><div class="fee-options">
        {#each [{id:'slow',name:'Economy',rate:fees.slow},{id:'medium',name:'Standard',rate:fees.medium},{id:'fast',name:'Priority',rate:fees.fast}] as option}
          <button type="button" class:active={speed === option.id} onclick={() => speed = option.id}><span><strong>{option.name}</strong><small>Next block</small></span><b>{option.rate} sat/vB</b></button>
        {/each}
        <button type="button" class:active={speed === 'custom'} onclick={() => speed = 'custom'}><span><strong>Custom</strong><small>Set rate</small></span>{#if speed === 'custom'}<input aria-label="Custom fee rate" bind:value={customFee} onclick={(event) => event.stopPropagation()} inputmode="decimal" placeholder="0" />{:else}<Gauge size={17} />{/if}</button>
      </div><small>Fee estimates: {estimates?.source ?? 'loading…'} · Estimated fee {shortSats(fee)} sats</small></div>
      <div class="split-actions"><Button variant="secondary" size="large" onclick={() => draftStep = 1}>Back</Button><Button type="submit" disabled={!valid} loading={preparing} loadingLabel="Preparing payment…" size="large">Review payment<ArrowRight size={17} /></Button></div>
    </form>
  {:else if step === 2 && proposal}
    <section class="form-card">
      <div class="review-amount"><span>You send</span><strong>{shortSats(proposal.amount)} <small>sats</small></strong></div>
      <dl class="details-list"><div><dt>To</dt><dd><button class="address-review-trigger mono" aria-label="View complete recipient address" onclick={() => addressOpen = true}>{compactAddress(proposal.recipient)}</button></dd></div><div><dt>Label</dt><dd>{proposal.label}</dd></div><div><dt>Network</dt><dd>{proposal.network}</dd></div><div><dt>Network fee</dt><dd>{shortSats(proposal.fee)} sats</dd></div><div class="total"><dt>Total</dt><dd>{shortSats(proposal.total)} sats</dd></div></dl>
      <TransactionReviewDetails {proposal} onChangeAddress={() => changeAddressOpen = true}/>
      <div class="warning-box">Bitcoin transactions cannot be reversed. Verify the address and amount before signing.</div>
      <div class="split-actions">{#if externalSigner}<Button variant="danger-outline" size="large" onclick={() => {cancelError='';cancelOpen=true;}}>Cancel payment</Button>{:else}<Button variant="secondary" size="large" onclick={() => { proposal = null; step = 1; draftStep = 2; }}>Back</Button>{/if}<Button size="large" onclick={() => step = 3}>Continue to sign<ArrowRight size={17} /></Button></div>
    </section>
  {:else if step === 3 && proposal && externalSigner}
    <section class="form-card sign-card">
      {#if externalProposal?.canFinalize}
        <span class="sign-icon success"><Check size={25}/></span><h2>Review signed transaction</h2><p>The hardware signature is verified. Review the transaction once more before broadcasting.</p>
        <section class="signed-transaction-review" aria-label="Signed transaction review">
          <dl class="details-list"><div><dt>To</dt><dd><button class="address-review-trigger mono" aria-label="View complete recipient address" onclick={() => addressOpen = true}>{compactAddress(proposal.recipient)}</button></dd></div><div><dt>Label</dt><dd>{proposal.label}</dd></div><div><dt>Amount</dt><dd>{shortSats(proposal.amount)} sats</dd></div><div><dt>Network</dt><dd>{proposal.network}</dd></div><div><dt>Network fee</dt><dd>{shortSats(proposal.fee)} sats</dd></div><div class="total"><dt>Total</dt><dd>{shortSats(proposal.total)} sats</dd></div></dl>
          <TransactionReviewDetails {proposal} onChangeAddress={() => changeAddressOpen = true}/>
        </section>
        <div class="ready-panel"><Check size={18}/><div><strong>Signature verified</strong><small>Enter this wallet’s Groot app PIN to broadcast this exact signed transaction.</small></div></div><PasswordField label="App PIN" bind:value={passphrase} oninput={() => credentialError=''} autocomplete="current-password" error={credentialError}/><Button size="large" class="full" disabled={!passphrase} loading={broadcasting} loadingLabel="Broadcasting…" onclick={broadcast}>Finalize & broadcast</Button>
      {:else}
        <span class="sign-icon"><Cpu size={25}/></span><h2>Sign on your hardware</h2><p>Verify the address, amount, and fee on the signer. Groot never receives its private key or hardware passphrase.</p>
        <div class="psbt-actions"><Button variant="secondary" onclick={scanHardware}><Cpu size={16}/>Sign with cable</Button><Button variant="secondary" onclick={showPsbtQr}><QrCode size={16}/>Show unsigned QR</Button><Button variant="secondary" onclick={() => {scannedFrames=[];qrScanOpen=true;}}><ScanLine size={16}/>Scan signed QR</Button><Button variant="secondary" onclick={() => {importError='';credentialError='';importOpen=true;}}><FileUp size={16}/>Import signed PSBT</Button><Button variant="secondary" loading={savingPsbt} loadingLabel="Saving PSBT…" onclick={saveExternalPsbt}><Download size={16}/>Save unsigned PSBT</Button></div>
        {#if credentialError}<p class="form-error">{credentialError}</p>{/if}
      {/if}
      <Button variant="ghost" size="large" class="full sign-back-action" onclick={() => step=2}>Back to review</Button>
      <Button variant="ghost-danger" size="large" class="full proposal-cancel-action" disabled={broadcasting} onclick={() => {cancelError='';cancelOpen=true;}}><X size={15}/>Cancel payment</Button>
    </section>
  {:else if step === 3 && proposal}
    <form class="form-card sign-card" onsubmit={(event) => { event.preventDefault(); broadcast(); }}>
      <span class="sign-icon"><LockKeyhole size={25} /></span><h2>Authorize payment</h2><p>Enter your wallet passphrase to unlock the signing keys. It never leaves this device.</p>
      <PasswordField label="Wallet passphrase" bind:value={passphrase} oninput={() => credentialError = ''} placeholder="Enter wallet passphrase" autocomplete="current-password" error={credentialError} hint="The BIP39 passphrase kept with this software wallet’s recovery words." />
      <Button type="submit" size="large" class="full" disabled={!passphrase} loading={broadcasting} loadingLabel="Signing & broadcasting…">Sign & broadcast {shortSats(proposal.amount)} sats</Button>
      <Button variant="ghost" size="large" class="full sign-back-action" onclick={() => step = 2}>Back to review</Button>
    </form>
  {:else}
    <section class="empty-state success-state"><span class="empty-icon success"><Check size={25} /></span><h2>{accelerationMethod === 'cpfp' ? 'Fee acceleration broadcast' : accelerationMethod === 'rbf' ? 'Replacement broadcast' : 'Payment sent'}</h2><p>{#if accelerationMethod === 'cpfp'}A fee-only child transaction with a {shortSats(Number(proposal?.fee ?? 0))}-sat network fee was broadcast.{:else if accelerationMethod === 'rbf'}The {shortSats(sentAmount)}-sat payment was rebroadcast with a higher fee.{:else}{shortSats(sentAmount)} sats was broadcast to the Bitcoin network.{/if}{#if balanceSyncPending} Balance refresh is pending; sync when the node is available.{/if}</p><div class="txid-box"><span>Transaction ID</span><code>{txid}</code></div><Button onclick={() => { step = 1; address=''; label=''; amount=''; passphrase=''; proposal=null; txid=''; sentAmount=0; balanceSyncPending=false; accelerationMethod=null; }}>Make another payment</Button><a href="/activity">View transaction</a></section>
  {/if}
</div>

<Modal open={deviceOpen} title="Sign with hardware" description="Use the same passphrase-protected hardware wallet whose fingerprint you imported." onclose={() => deviceOpen=false}>{#if proposal}<section class="hardware-review" aria-label="Authoritative transaction details"><strong>Transaction to verify</strong><dl class="hardware-review-primary"><div><dt>Recipient</dt><dd><button type="button" class="compact-address-button" onclick={()=>hardwareAddressOpen=true}>{compactAddress(hardwareRecipient)}</button></dd></div><div><dt>Label</dt><dd>{proposal.label}</dd></div><div><dt>Amount</dt><dd>{shortSats(proposal.amount)} sats</dd></div><div><dt>Network</dt><dd>{proposal.network}</dd></div><div><dt>Network fee</dt><dd>{shortSats(proposal.fee)} sats</dd></div><div><dt>Total</dt><dd>{shortSats(proposal.total)} sats</dd></div></dl>{#if ledgerSigner && proposal.recipientTestnetAlias}<p class="verification-network-note">Ledger Bitcoin Test shows the Regtest output with a <code>tb1</code> prefix. Rust supplied this alias only after proving it decodes to the identical Bitcoin output script.</p>{/if}<TransactionReviewDetails {proposal} compact changeAddressOverride={hardwareChangeAddress} onChangeAddress={() => hardwareChangeAddressOpen = true}/></section>{/if}{#if broadcasting}<HardwareActionPrompt title={hardwareAction === 'sign' ? 'Check your hardware device' : 'Looking for hardware devices'} detail={hardwareAction === 'sign' ? 'Review the recipient, amount, fee, and change, then approve the transaction on the device.' : 'Keep the signer connected and unlocked. Follow any instructions shown on the device.'} label={hardwareAction === 'sign' ? 'Waiting for hardware signature' : 'Hardware device scan in progress'}/>{:else if !devices.length}<div class="device-scan"><strong>No device found</strong><span>Unlock the signer, quit its companion app, and scan again.</span><Button variant="secondary" onclick={scanHardware}>Scan again</Button></div>{:else}<div class="source-list">{#each devices as device}<button onclick={() => signHardware(device)}><Cpu size={18}/><span><strong>{device.label}</strong><small>{device.fingerprint ?? device.message}</small></span></button>{/each}<button class="hardware-rescan" onclick={scanHardware}><RefreshCw size={16}/><span><strong>Rescan devices</strong><small>Refresh after connecting or unlocking another signer.</small></span></button></div>{/if}{#if deviceError}<div class="hardware-inline-error" role="alert"><AlertTriangle size={18}/><span><strong>Hardware signing failed</strong><small>{deviceError}</small></span><Button variant="secondary" size="small" onclick={scanHardware}>Rescan</Button></div>{/if}</Modal>
<Modal open={importOpen} title="Import signed PSBT" description="Only a valid signature from this wallet’s exact fingerprint is accepted." onclose={() => {if(!broadcasting)importOpen=false;}}><label class="file-action"><FileUp size={16}/>Choose signed PSBT<input aria-label="Choose signed PSBT file" type="file" accept=".psbt,text/plain" onchange={loadSignedFile}/></label><label class="field"><span>Signed PSBT</span><textarea rows="6" bind:value={imported} oninput={() => {importError='';credentialError='';}} placeholder="cHNidP8…"></textarea></label>{#if importError}<div class="hardware-inline-error" role="alert"><AlertTriangle size={18}/><span><strong>Signed PSBT rejected</strong><small>{importError}</small></span></div>{/if}<div class="modal-footer"><Button variant="secondary" disabled={broadcasting} onclick={() => importOpen=false}>Cancel</Button><Button disabled={!imported.trim()} loading={broadcasting} loadingLabel="Validating…" onclick={importSigned}>Validate signature</Button></div></Modal>
<Modal open={qrOpen} title="Unsigned PSBT" description="Scan with an offline signer. No private key data is encoded." onclose={() => qrOpen=false}><AnimatedUrQr frames={urFrames}/></Modal>
<Modal open={qrScanOpen} title="Scan signed PSBT" description="Groot accepts only crypto-psbt UR frames and verifies the exact proposal before importing." onclose={() => qrScanOpen=false}><UrQrScanner onframe={receiveUrFrame}/></Modal>
<Modal open={cancelOpen} title="Cancel this payment?" description="Review what will be discarded before continuing." onclose={() => {if(!broadcasting){cancelOpen=false;cancelError='';}}}>{#if proposal && externalProposal}<div class="warning-box"><strong>This cannot be undone.</strong> You will need to prepare and sign this payment again.</div><dl class="details-list cancel-proposal-details"><div><dt>Payment</dt><dd>{proposal.label}</dd></div><div><dt>Amount</dt><dd>{shortSats(proposal.amount)} sats</dd></div><div><dt>Signatures lost</dt><dd>{externalProposal.signed} of {externalProposal.required} collected</dd></div></dl>{#if cancelError}<p class="form-error" role="alert">{cancelError}</p>{/if}<div class="modal-footer"><Button variant="secondary" disabled={broadcasting} onclick={() => {cancelOpen=false;cancelError='';}}>Keep payment</Button><Button variant="danger" loading={broadcasting} loadingLabel="Canceling payment…" onclick={confirmCancelExternalProposal}>Cancel payment</Button></div>{/if}</Modal>
<RecipientAddressModal open={addressOpen} address={proposal?.recipient ?? ''} label={proposal?.label ?? ''} onclose={() => addressOpen = false}/>
<RecipientAddressModal open={changeAddressOpen} address={proposal?.changeAddresses[0] ?? ''} label="Wallet change" title="Change address" description="This output was verified by the Rust wallet as controlled by this wallet." detail="Internal wallet output · not the recipient" onclose={() => changeAddressOpen = false}/>
<RecipientAddressModal open={hardwareAddressOpen} address={hardwareRecipient} label={proposal?.label ?? ''} title="Address shown on hardware" description="Compare this exact encoding with the hardware device." onclose={() => hardwareAddressOpen = false}/>
<RecipientAddressModal open={hardwareChangeAddressOpen} address={hardwareChangeAddress} label="Wallet change" title="Change shown on hardware" description="Compare this exact wallet-controlled output with the hardware device." detail="Internal wallet output · not the recipient" onclose={() => hardwareChangeAddressOpen = false}/>
