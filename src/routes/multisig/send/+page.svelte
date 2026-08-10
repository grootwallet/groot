<script lang="ts">
  import { AlertTriangle, Check, CircleDot, Copy, Cpu, Download, FileUp, LockKeyhole, QrCode, RefreshCw, ScanLine, X } from '@lucide/svelte';
  import { onDestroy, onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import HardwareActionPrompt from '$lib/components/HardwareActionPrompt.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import AnimatedUrQr from '$lib/components/AnimatedUrQr.svelte';
  import UrQrScanner from '$lib/components/UrQrScanner.svelte';
  import RecipientAddressModal from '$lib/components/RecipientAddressModal.svelte';
  import SendProgress from '$lib/components/SendProgress.svelte';
  import SignerSummary from '$lib/components/SignerSummary.svelte';
  import { copyText } from '$lib/clipboard';
  import { shortSats } from '$lib/data';
  import { toast } from '$lib/stores/toasts';
  import { coldcardPolicyFilename, downloadText, readTransferFile } from '$lib/transfer';
  import { feeRate, sats, walletService, type CoinSelection, type FeeEstimates, type HardwareDevice, type MultisigProposal, type MultisigWallet } from '$lib/wallet';
  import type { Utxo } from '$lib/types';
  import { defaultConfig, networkName } from '$lib/config';
  import { addressPrefixForNetwork, hasAddressPrefixForNetwork } from '$lib/wallet/policy';
  import { compactAddress } from '$lib/address-display';
  import { fly } from 'svelte/transition';
  let wallet = $state<MultisigWallet|null>(null), proposal=$state<MultisigProposal|null>(null), estimates=$state<FeeEstimates|null>(null);
  let address=$state(''), label=$state(''), amount=$state(''), selectedRate=$state(2), pin=$state(''), imported=$state(''), txid=$state(''), error=$state(''), deviceError=$state(''), cancelError=$state('');
  let busy=$state(false), savingPsbt=$state(false), deviceOpen=$state(false), addressOpen=$state(false), changeAddressOpen=$state(false), importOpen=$state(false), qrOpen=$state(false), qrScanOpen=$state(false), cancelOpen=$state(false), exitOpen=$state(false), devices=$state<HardwareDevice[]>([]), urFrames=$state<string[]>([]), scannedFrames=$state<string[]>([]);
  let hardwareAction=$state<'scan'|'sign'>('scan');
  let coins=$state<Utxo[]>([]), selectedCoins=$state<string[]>([]), showCoins=$state(false), available=$state(0);
  let draftStep=$state<1|2>(1);
  const selection=$derived<CoinSelection>(selectedCoins.length?{mode:'manual',outpoints:selectedCoins}:{mode:'auto'});
  const hasColdcardSigner=$derived(wallet?.cosigners.some((signer)=>signer.deviceType?.toLowerCase()==='coldcard'||signer.label.toLowerCase().includes('coldcard'))??false);
  const amountSats=$derived(Number(amount||0)), estimatedFee=$derived(Math.ceil(selectedRate*220)), addressValid=$derived(hasAddressPrefixForNetwork(address,defaultConfig.network)), valid=$derived(addressValid&&label.trim().length>0&&label.trim().length<=48&&Number.isSafeInteger(amountSats)&&amountSats>0&&amountSats+estimatedFee<=available&&selectedRate>0);
  const intentValid=$derived(addressValid&&label.trim().length>0&&label.trim().length<=48);
  const progressStep=$derived<1|2|3>(proposal?3:draftStep);
  const signerItems=$derived((wallet?.cosigners??[]).map((signer)=>({label:signer.label,fingerprint:signer.fingerprint,detail:signer.deviceType??`${signer.source} signer`})));
  onDestroy(()=>{pin='';imported='';});
  onMount(async()=>{try{const snapshot=await walletService.multisigSnapshot();wallet=await walletService.multisigWallet();estimates=await walletService.estimateFees();selectedRate=Number(estimates.standard);coins=snapshot.utxos;const url=new URL(window.location.href),requested=url.searchParams.get('coins')?.split(',').filter(Boolean)??[],method=url.searchParams.get('accelerate'),txid=url.searchParams.get('txid');selectedCoins=requested.filter((outpoint)=>coins.some((coin)=>coin.outpoint===outpoint&&!coin.frozen));updateAvailable();if(txid&&(method==='rbf'||method==='cpfp'))proposal=await walletService.prepareMultisigAcceleration(txid,method,feeRate(Number(estimates.priority)));else proposal=(await walletService.multisigProposals())[0]??null;}catch(cause){error=cause instanceof Error?cause.message:'Could not load wallet.';}});
  function submitIntentOnEnter(event: KeyboardEvent){if(event.key!=='Enter')return;event.preventDefault();if(intentValid)draftStep=2;}
  async function prepare(){if(!valid)return;busy=true;error='';try{proposal=await walletService.prepareMultisigPayment(address,label,sats(amountSats),feeRate(selectedRate),selection);}catch(cause){error=cause instanceof Error?cause.message:'Could not prepare payment.';}finally{busy=false;}}
  function updateAvailable(){available=coins.filter((coin)=>!coin.frozen&&(!selectedCoins.length||selectedCoins.includes(coin.outpoint))).reduce((total,coin)=>total+coin.amount,0);}
  function toggleCoin(outpoint:string,checked:boolean){selectedCoins=checked?[...selectedCoins,outpoint]:selectedCoins.filter((item)=>item!==outpoint);updateAvailable();}
  function useAutomatic(){selectedCoins=[];showCoins=false;updateAvailable();}
  async function scan(){deviceOpen=true;hardwareAction='scan';busy=true;deviceError='';try{devices=await walletService.listHardwareDevices();}catch(cause){devices=[];deviceError=cause instanceof Error?cause.message:'Could not find hardware.';}finally{busy=false;}}
  async function sign(device:HardwareDevice){if(!proposal)return;hardwareAction='sign';busy=true;deviceError='';try{proposal=await walletService.signMultisigWithHardware(proposal.proposalId,device.id,proposal.psbt);deviceOpen=false;toast({title:'Signature added',description:`${proposal.signed} of ${proposal.required} signatures`,tone:'success'});}catch(cause){deviceError=cause instanceof Error?cause.message:'Device signing failed.';}finally{busy=false;}}
  async function importPsbt(){if(!proposal||!imported.trim())return;busy=true;try{proposal=await walletService.importMultisigProposal(proposal.proposalId,proposal.psbt,imported);imported='';importOpen=false;toast({title:'Signed PSBT merged',description:`${proposal.signed} of ${proposal.required} signatures`,tone:'success'});}catch(cause){error=cause instanceof Error?cause.message:'PSBT import failed.';}finally{busy=false;}}
  async function broadcast(){if(!proposal||!pin)return;busy=true;error='';try{const result=await walletService.broadcastMultisigProposal(proposal.proposalId,proposal.psbt,pin);txid=result.txid;toast({title:'Vault transaction broadcast',description:result.syncPending?'Accepted by the node. Balance refresh is pending.':`Balance ${shortSats(result.snapshot.balance.total)} sats`,tone:'success'});}catch(cause){error=cause instanceof Error?cause.message:'Broadcast failed.';}finally{pin='';busy=false;}}
  async function confirmCancel(){if(!proposal||busy)return;busy=true;cancelError='';try{await walletService.cancelMultisigProposal(proposal.proposalId);proposal=null;address='';label='';amount='';pin='';draftStep=1;cancelOpen=false;toast({title:'Proposal canceled',description:'The unsigned transaction and any collected signatures were discarded.'});}catch(cause){cancelError=cause instanceof Error?cause.message:'The proposal could not be canceled.';}finally{busy=false;}}
  async function copyPsbt(){if(!proposal)return;await copyText(proposal.psbt);toast({title:'PSBT copied',tone:'success'});}
  async function saveProposalPsbt(){if(!proposal||savingPsbt)return;savingPsbt=true;error='';try{const saved=await walletService.savePsbt(`satchel-${proposal.proposalId}.psbt`,proposal.psbt);if(saved)toast({title:'PSBT saved',description:'The unsigned transaction was saved to the selected file.',tone:'success'});}catch(cause){error=cause instanceof Error?cause.message:'Could not save the PSBT.';toast({title:'Could not save PSBT',description:error,tone:'danger'});}finally{savingPsbt=false;}}
  async function loadPsbtFile(event:Event){const input=event.currentTarget as HTMLInputElement;const file=input.files?.[0];input.value='';if(!file)return;try{imported=await readTransferFile(file);toast({title:'Signed PSBT file loaded',tone:'success'});}catch(cause){error=cause instanceof Error?cause.message:'Could not read PSBT file.';}}
  async function showPsbtQr(){if(!proposal)return;busy=true;error='';try{urFrames=await walletService.encodePsbtUr(proposal.psbt);qrOpen=true;}catch(cause){error=cause instanceof Error?cause.message:'Could not encode the PSBT QR.';}finally{busy=false;}}
  function saveColdcardPolicy(){if(!wallet)return;downloadText(coldcardPolicyFilename(wallet.name),`# Satchel multisig policy for COLDCARD\n# Import from Settings > Multisig Wallets > Import\n${wallet.externalDescriptor}\n`);toast({title:'Coldcard policy saved',description:'Import and verify it on the Coldcard before signing.',tone:'success'});}
  async function receiveUrFrame(frame:string){if(scannedFrames.includes(frame))return;scannedFrames=[...scannedFrames,frame];try{imported=await walletService.decodePsbtUr(scannedFrames);qrScanOpen=false;await importPsbt();}catch(cause){const message=cause instanceof Error?cause.message:'';if(!message.includes('Keep scanning'))error=message||'The QR frame was rejected.';}}
</script>

<div class="page narrow-page send-page" class:signing-page={Boolean(proposal)}>
<header class="page-header"><div><p class="eyebrow">SEND</p><h1>Send bitcoin</h1><p class="subtitle">{!proposal&&draftStep===1?'Name the payment and choose its recipient.':!proposal?'Choose the amount, coins, and network fee.':`Review once, then collect ${wallet?.threshold??'the required'} signatures.`}</p></div>{#if proposal}<Button variant="secondary" ariaLabel="Back to overview" onclick={()=>exitOpen=true}>Back</Button>{:else}<Button variant="secondary" ariaLabel="Back to overview" href="/">Back</Button>{/if}</header>
{#if !txid}<SendProgress current={progressStep}/>{#if wallet&&!proposal}<SignerSummary signers={signerItems} required={wallet.threshold} signedFingerprints={[]} collecting={false}/>{/if}{/if}
{#if txid}<section class="empty-state success-state"><span class="empty-icon success"><Check size={25}/></span><h2>Transaction broadcast</h2><p>The signed transaction was accepted by regtest.</p><div class="txid-box"><span>Transaction ID</span><code>{txid}</code></div><Button href="/multisig">Return to vault</Button></section>
{:else if !proposal&&draftStep===1}
<form class="form-card send-stage-card" onsubmit={(e)=>{e.preventDefault();if(intentValid)draftStep=2;}} in:fly={{x:8,duration:180}}>
  <div class="send-stage-heading"><span>STEP 1</span><h2>What is this payment for?</h2><p>This permanent label helps every signer recognize the transaction.</p></div>
  <label class="field"><span>Payment label</span><input aria-label="Payment label" bind:value={label} onkeydown={submitIntentOnEnter} placeholder="e.g. Hardware purchase, Pay Alex, Test transaction" maxlength="48"/><small>Required · cannot be changed · {label.length}/48</small></label>
  <label class="field"><span>Bitcoin address</span><input aria-label="Bitcoin address" bind:value={address} onkeydown={submitIntentOnEnter} placeholder="{addressPrefixForNetwork(defaultConfig.network)}q…"/>{#if address&&!addressValid}<em>Enter a valid {networkName(defaultConfig.network)} address</em>{/if}</label>
  <Button type="submit" size="large" class="full" disabled={!intentValid}>Continue to amount</Button>
</form>
{:else if !proposal}
<form class="form-card send-stage-card" onsubmit={(e)=>{e.preventDefault();prepare();}} in:fly={{x:8,duration:180}}>
  <div class="send-stage-heading"><span>STEP 2</span><h2>Fund the payment</h2><p>Set the amount, then keep automatic selection or choose specific coins.</p></div>
  <label class="field"><span>Amount</span><div class="amount-input"><input aria-label="Amount" bind:value={amount} inputmode="numeric" placeholder="0"/><b>sats</b><button type="button" onclick={()=>amount=String(Math.max(0,available-estimatedFee))}>Max</button></div><small>Available: {shortSats(available)} sats</small></label>
  <div class="coin-control-field"><span>Coin selection</span><button type="button" class="coin-mode" class:open={showCoins} aria-expanded={showCoins} onclick={()=>showCoins=!showCoins}><CircleDot size={16}/><span><strong>{selectedCoins.length?`Manual · ${selectedCoins.length} coin${selectedCoins.length===1?'':'s'}`:'Automatic selection'}</strong><small>{selectedCoins.length?`${shortSats(available)} sats available`:'Frozen coins stay untouched'}</small></span><b>{showCoins?'Done':'Choose'}</b></button>{#if showCoins}<div class="send-coin-picker">{#each coins as coin}<label class:frozen={coin.frozen}><input type="checkbox" checked={selectedCoins.includes(coin.outpoint)} disabled={coin.frozen} onchange={(event)=>toggleCoin(coin.outpoint,event.currentTarget.checked)}/><span><strong>{coin.label}</strong><small>{shortSats(coin.amount)} sats{coin.frozen?' · Frozen':''}</small></span></label>{/each}<button type="button" onclick={useAutomatic}>Use automatic selection</button></div>{/if}</div>
  <label class="field"><span>Fee rate</span><div class="amount-input"><input aria-label="Fee rate" bind:value={selectedRate} inputmode="decimal"/><b>sat/vB</b></div><small>{estimates?.source??'Loading fee estimates…'}</small></label>
  {#if error}<p class="form-error">{error}</p>{/if}
  <div class="split-actions"><Button variant="secondary" size="large" onclick={()=>draftStep=1}>Back</Button><Button type="submit" size="large" disabled={!valid} loading={busy} loadingLabel="Preparing payment…">Review payment</Button></div>
</form>
{:else}<div class="multisig-signing-layout"><section class="form-card">
  <div class="review-amount"><span>You send</span><strong>{shortSats(Number(proposal.amount))} <small>sats</small></strong></div>
  <dl class="details-list proposal-review-primary">
    <div><dt>To</dt><dd><button class="address-review-trigger mono" aria-label="View complete recipient address" onclick={()=>addressOpen=true}>{compactAddress(proposal.recipient)}</button></dd></div>
    <div><dt>Label</dt><dd>{proposal.label}</dd></div>
    <div><dt>Network fee</dt><dd>{shortSats(Number(proposal.fee))} sats</dd></div>
  </dl>
  <details class="proposal-review-details">
    <summary>View transaction details</summary>
    <dl class="details-list">
      <div><dt>Change</dt><dd>{shortSats(Number(proposal.change))} sats</dd></div>
      {#if proposal.changeAddresses[0]}<div><dt>Change address</dt><dd><button class="address-review-trigger mono" aria-label="View complete change address" onclick={()=>changeAddressOpen=true}>{compactAddress(proposal.changeAddresses[0])}</button></dd></div>{/if}
      <div><dt>Transaction</dt><dd>{proposal.selectedOutpoints.length} input{proposal.selectedOutpoints.length===1?'':'s'} · {proposal.outputCount} output{proposal.outputCount===1?'':'s'}</dd></div>
      <div><dt>Network</dt><dd>{proposal.network}</dd></div>
      <div><dt>Input value</dt><dd>{shortSats(proposal.inputs.reduce((sum,input)=>sum+Number(input.amount),0))} sats</dd></div>
      <div><dt>Locktime / RBF</dt><dd>{proposal.locktime} · {proposal.rbf?'Enabled':'Disabled'}</dd></div>
      <div><dt>Fee rate</dt><dd>{proposal.feeRate} sat/vB</dd></div>
      <div><dt>Total debit</dt><dd>{shortSats(Number(proposal.total))} sats</dd></div>
      <div><dt>Wallet policy</dt><dd>{wallet?.threshold} of {wallet?.cosigners.length}</dd></div>
    </dl>
    <details class="proposal-review-inputs"><summary>Inspect input outpoints and sequences</summary><dl class="details-list">{#each proposal.inputs as input}<div><dt><code>{input.outpoint}</code></dt><dd>{shortSats(input.amount)} sats · sequence {input.sequence}</dd></div>{/each}</dl></details>
  </details>
<div class="psbt-actions"><Button variant="secondary" onclick={scan}><Cpu size={16}/>Sign with device</Button><Button variant="secondary" onclick={showPsbtQr}><QrCode size={16}/>Show unsigned QR</Button><Button variant="secondary" onclick={()=>{scannedFrames=[];qrScanOpen=true;}}><ScanLine size={16}/>Scan signed QR</Button><Button variant="secondary" onclick={()=>importOpen=true}><FileUp size={16}/>Import signed PSBT</Button><Button variant="secondary" onclick={copyPsbt}><Copy size={16}/>Copy PSBT</Button><Button variant="secondary" loading={savingPsbt} loadingLabel="Saving PSBT…" onclick={saveProposalPsbt}><Download size={16}/>Save PSBT</Button></div>
{#if proposal.canFinalize}<div class="ready-panel"><LockKeyhole size={18}/><div><strong>Ready to finalize</strong><small>Enter the coordinator app PIN. Hardware signatures are already inside the PSBT.</small></div></div><PasswordField label="App PIN" inputLabel="App PIN" bind:value={pin} autocomplete="current-password"/><Button size="large" class="full" disabled={!pin} loading={busy} loadingLabel="Finalizing & broadcasting…" onclick={broadcast}>Finalize & broadcast</Button>{/if}{#if error}<p class="form-error">{error}</p>{/if}<Button variant="ghost-danger" class="full proposal-cancel-action" disabled={busy} onclick={()=>{cancelError='';cancelOpen=true;}}><X size={15}/>Cancel proposal</Button></section>{#if wallet}<aside class="signer-side-panel"><SignerSummary signers={signerItems} required={wallet.threshold} signedFingerprints={proposal.signedFingerprints} collecting/></aside>{/if}</div>{/if}</div>

<Modal open={deviceOpen} title="Sign with hardware" description="Compare every value below with the device before approving." onclose={()=>deviceOpen=false}>
  {#if proposal}
    <section class="hardware-review" aria-label="Authoritative transaction details">
      <strong>Transaction to verify</strong>
      <dl class="hardware-review-primary">
        <div><dt>Recipient</dt><dd><button type="button" class="compact-address-button" onclick={()=>addressOpen=true}>{compactAddress(proposal.recipient)}</button></dd></div>
        <div><dt>Amount</dt><dd>{shortSats(Number(proposal.amount))} sats</dd></div>
        <div><dt>Network fee</dt><dd>{shortSats(Number(proposal.fee))} sats</dd></div>
      </dl>
      <details class="hardware-review-details">
        <summary>View transaction details</summary>
        <dl>
          <div><dt>Change</dt><dd>{shortSats(Number(proposal.change))} sats</dd></div>
          {#if proposal.changeAddresses[0]}<div><dt>Change address</dt><dd><button type="button" class="compact-address-button" onclick={()=>changeAddressOpen=true}>{compactAddress(proposal.changeAddresses[0])}</button></dd></div>{/if}
          <div><dt>Transaction</dt><dd>{proposal.selectedOutpoints.length} input{proposal.selectedOutpoints.length===1?'':'s'} · {proposal.outputCount} output{proposal.outputCount===1?'':'s'}</dd></div>
          <div><dt>Network</dt><dd>{proposal.network}</dd></div>
          <div><dt>Input value</dt><dd>{shortSats(proposal.inputs.reduce((sum,input)=>sum+Number(input.amount),0))} sats</dd></div>
          <div><dt>Locktime / RBF</dt><dd>{proposal.locktime} · {proposal.rbf?'Enabled':'Disabled'}</dd></div>
          <div><dt>Wallet policy</dt><dd>{wallet?.threshold} of {wallet?.cosigners.length}</dd></div>
        </dl>
        <details class="proposal-review-inputs"><summary>Inspect input outpoints and sequences</summary><dl>{#each proposal.inputs as input}<div><dt><code>{input.outpoint}</code></dt><dd>{shortSats(input.amount)} sats · sequence {input.sequence}</dd></div>{/each}</dl></details>
      </details>
    </section>
  {/if}
  {#if busy}
    <HardwareActionPrompt title={hardwareAction === 'sign' ? 'Check your hardware device' : 'Looking for hardware devices'} detail={hardwareAction === 'sign' ? 'Review the recipient, amount, fee, change, and vault policy, then approve on the device.' : 'Keep each signer connected and unlocked. Follow any instructions shown on the device.'} label={hardwareAction === 'sign' ? 'Waiting for hardware signature' : 'Hardware device scan in progress'}/>
  {:else if devices.length===0}
    <div class="device-scan"><strong>No device found</strong><span>Connect an HWI-compatible device, or use signed PSBT import.</span><Button variant="secondary" onclick={scan}>Scan again</Button></div>
  {:else}
    <div class="source-list hardware-device-list">{#each devices as device}<button onclick={()=>sign(device)}><Cpu size={18}/><span><strong>{device.label}</strong><small>{device.fingerprint??'Fingerprint unavailable'}</small></span></button>{/each}<button class="hardware-rescan" onclick={scan}><RefreshCw size={16}/><span><strong>Rescan devices</strong><small>Refresh after connecting or unlocking another signer.</small></span></button></div>
  {/if}
  {#if hasColdcardSigner}<div class="hardware-policy-help"><strong>Coldcard must know this wallet policy</strong><span>If it reports an unknown multisig wallet, import this public descriptor from Settings → Multisig Wallets → Import.</span><Button variant="secondary" size="small" onclick={saveColdcardPolicy}><Download size={14}/>Save wallet policy</Button></div>{/if}
  {#if deviceError}<div class="hardware-inline-error" role="alert"><AlertTriangle size={18}/><span><strong>This device could not sign</strong><small>{deviceError}</small></span><Button variant="secondary" size="small" onclick={scan}>Rescan</Button></div>{/if}
</Modal>
<Modal open={importOpen} title="Import signed PSBT" description="Only signatures for this exact proposal are accepted." onclose={()=>importOpen=false}><label class="file-action"><FileUp size={16}/>Choose PSBT file<input aria-label="Choose signed PSBT file" type="file" accept=".psbt,text/plain" onchange={loadPsbtFile}/></label><label class="field"><span>Signed PSBT</span><textarea aria-label="Signed PSBT" rows="6" bind:value={imported} placeholder="cHNidP8…"></textarea></label><div class="modal-footer"><Button variant="secondary" onclick={()=>importOpen=false}>Cancel</Button><Button disabled={!imported.trim()} loading={busy} loadingLabel="Validating signatures…" onclick={importPsbt}>Validate & merge</Button></div></Modal>
<Modal open={qrOpen} title="Unsigned PSBT" description="Scan with an offline signer. No private data is encoded." onclose={()=>qrOpen=false}><AnimatedUrQr frames={urFrames}/></Modal>
<Modal open={qrScanOpen} title="Scan signed PSBT" description="Satchel accepts only crypto-psbt UR frames and verifies the exact proposal before merging." onclose={()=>qrScanOpen=false}><UrQrScanner onframe={receiveUrFrame}/></Modal>
<Modal open={cancelOpen} title="Cancel this proposal?" description="Review what will be discarded before continuing." onclose={()=>{if(!busy){cancelOpen=false;cancelError='';}}}>{#if proposal}<div class="warning-box"><strong>This cannot be undone.</strong> You will need to prepare and sign this payment again.</div><dl class="details-list cancel-proposal-details"><div><dt>Payment</dt><dd>{proposal.label}</dd></div><div><dt>Amount</dt><dd>{shortSats(Number(proposal.amount))} sats</dd></div><div><dt>Signatures lost</dt><dd>{proposal.signed} of {proposal.required} collected</dd></div></dl>{#if cancelError}<p class="form-error" role="alert">{cancelError}</p>{/if}<div class="modal-footer"><Button variant="secondary" disabled={busy} onclick={()=>{cancelOpen=false;cancelError='';}}>Keep proposal</Button><Button variant="danger" loading={busy} loadingLabel="Canceling proposal…" onclick={confirmCancel}>Cancel proposal</Button></div>{/if}</Modal>
<Modal open={exitOpen} title="Leave signing?" description="Confirm before returning to the overview." onclose={()=>exitOpen=false}>{#if proposal}<div class="ready-panel"><Check size={18}/><div><strong>Your proposal will stay saved.</strong><small>You can return to signing without rebuilding the transaction or losing collected signatures.</small></div></div><dl class="details-list cancel-proposal-details"><div><dt>Payment</dt><dd>{proposal.label}</dd></div><div><dt>Amount</dt><dd>{shortSats(Number(proposal.amount))} sats</dd></div><div><dt>Signatures saved</dt><dd>{proposal.signed} of {proposal.required} collected</dd></div></dl><div class="modal-footer"><Button variant="secondary" onclick={()=>exitOpen=false}>Keep signing</Button><Button href="/">Leave to overview</Button></div>{/if}</Modal>
<RecipientAddressModal open={addressOpen} address={proposal?.recipient??''} label={proposal?.label??''} onclose={()=>addressOpen=false}/>
<RecipientAddressModal open={changeAddressOpen} address={proposal?.changeAddresses[0]??''} label="Wallet change" title="Change address" description="Compare this wallet-controlled output with the hardware device." detail="Internal wallet output · not the recipient" onclose={()=>changeAddressOpen=false}/>
