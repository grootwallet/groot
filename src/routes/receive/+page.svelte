<script lang="ts">
  import { Check, ChevronDown, ChevronRight, Copy, Cpu, Plus, QrCode, ShieldCheck, Trash2 } from '@lucide/svelte';
  import QRCode from 'qrcode';
  import { onDestroy, onMount, tick } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import FieldCounter from '$lib/components/FieldCounter.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import ReadableAddress from '$lib/components/ReadableAddress.svelte';
  import AddressDetailsModal from '$lib/components/AddressDetailsModal.svelte';
  import LocalTimestamp from '$lib/components/LocalTimestamp.svelte';
  import HardwareVerificationStatus from '$lib/components/HardwareVerificationStatus.svelte';
  import HardwareActionPrompt from '$lib/components/HardwareActionPrompt.svelte';
  import HardwareDeviceEmptyState from '$lib/components/HardwareDeviceEmptyState.svelte';
  import TrezorPinModal from '$lib/components/TrezorPinModal.svelte';
  import { compactAddress } from '$lib/address-display';
  import { testnetAddressDisplayName } from '$lib/wallet/hardware-display';
  import { walletService, WalletError, type HardwareDevice, type WalletErrorCode } from '$lib/wallet';
  import { useWalletShellContext } from '$lib/wallet/shell-context';
  import { awaitingPaymentAddresses } from '$lib/wallet/policy';
  import type { ReceiveAddress } from '$lib/types';
  import { copyText } from '$lib/clipboard';
  import { toast } from '$lib/stores/toasts';
  let label = $state('');
  let current = $state<ReceiveAddress | null>(null);
  let addresses = $state<ReceiveAddress[]>([]);
  let qrDataUrl = $state('');
  let busy = $state(false);
  let showGenerate = $state(false);
  let showDiscard = $state(false);
  let showQr = $state(false);
  let showDetails = $state(false);
  let copied = $state(false);
  let qrGeneration = 0;
  let discardTarget = $state<ReceiveAddress | null>(null);
  let detailAddress = $state<ReceiveAddress | null>(null);
  let receiveCard = $state<HTMLElement | null>(null);
  let savedSignerDeviceType = $state<string | null>(null);
  const walletShell=useWalletShellContext();
  let externalSigner=$derived(walletShell.profiles().find((profile)=>profile.id===walletShell.selectedWalletId())?.kind==='watch_only');
  let verifyOpen=$state(false),verifyBusy=$state(false),verifyError=$state(''),devices=$state<HardwareDevice[]>([]),verificationDevice=$state<HardwareDevice|null>(null);
  let pinOpen=$state(false),pinBusy=$state(false),pinChallenge=$state(''),pinPositions=$state(''),pinError=$state(''),pinErrorCode=$state<WalletErrorCode|''>(''),pinDevice=$state<HardwareDevice|null>(null);
  let verificationAction=$state<'scan'|'approve'>('scan');
  let verificationDeviceIdentity=$derived(`${savedSignerDeviceType ?? ''} ${verificationDevice?.label ?? ''} ${verificationDevice?.model ?? ''}`);
  let testnetVerificationDevice=$derived(current?.testnetAlias?testnetAddressDisplayName(verificationDeviceIdentity):null);
  let awaiting = $derived(awaitingPaymentAddresses(addresses));
  let history = $derived(addresses.filter((address) => address.status !== 'awaiting'));
  onMount(load);
  onMount(() => walletService.subscribe((event) => {
    if (event.type !== 'wallet_updated' || event.walletKind !== 'single_key' || event.walletId !== walletShell.selectedWalletId()) return;
    applyAddresses(event.snapshot.receiveAddresses);
  }));
  onDestroy(() => { pinPositions=''; pinChallenge=''; });
  $effect(() => {
    const address = current?.address;
    const generation = ++qrGeneration;
    qrDataUrl = '';
    if (address) QRCode.toDataURL(`bitcoin:${address}`, { width: 320, margin: 2, errorCorrectionLevel: 'M' })
      .then((value) => { if (generation === qrGeneration && current?.address === address) qrDataUrl = value; })
      .catch((cause) => { if (generation === qrGeneration) toast({ title: 'Could not generate QR code', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' }); });
  });
  async function load() {
    try {
      const snapshot=await walletService.snapshot(); applyAddresses(snapshot.receiveAddresses);
      const registry=await walletService.profiles();
      if(registry.wallets.find((profile)=>profile.id===registry.selectedWalletId)?.kind==='watch_only') savedSignerDeviceType=(await walletService.externalSignerWallet()).signer.deviceType;
    }
    catch (cause) { toast({ title: 'Could not load addresses', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' }); }
  }
  function applyAddresses(nextAddresses: ReceiveAddress[]) {
    addresses = nextAddresses;
    const nextAwaiting = awaitingPaymentAddresses(nextAddresses);
    current = nextAwaiting.find((address) => address.id === current?.id) ?? nextAwaiting[0] ?? null;
  }
  const generate = async () => {
    if (!label.trim()) return;
    busy = true;
    try {
      current = await walletService.createAddress(label);
      addresses = [current, ...addresses]; label = ''; showGenerate = false;
      await tick();
      receiveCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      try {
        await copyText(current.address, 'bitcoin-address');
        copied = true;
        setTimeout(() => copied = false, 1500);
        toast({ title: 'Address ready and copied', description: 'The permanent label is stored locally.', tone: 'success' });
      } catch {
        toast({ title: 'New address ready', description: 'Tap Copy address to copy it.', tone: 'success' });
      }
    } catch (cause) { toast({ title: 'Could not generate address', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' }); }
    finally { busy = false; }
  };
  const copy = async () => {
    if (!current) return;
    try { await copyText(current.address, 'bitcoin-address'); copied = true; toast({ title: 'Address copied', tone: 'success' }); setTimeout(() => copied = false, 1500); }
    catch { toast({ title: 'Copy failed', description: 'Select and copy the address manually.', tone: 'danger' }); }
  };
  const copyVerificationAddress = async () => {
    if (!current) return;
    const address = testnetVerificationDevice ? current.testnetAlias! : current.address;
    try { await copyText(address, 'bitcoin-address'); copied = true; toast({ title: 'Address copied', description: 'The exact comparison address is on your clipboard.', tone: 'success' }); setTimeout(() => copied = false, 1500); }
    catch { toast({ title: 'Copy failed', description: 'Select and copy the address manually.', tone: 'danger' }); }
  };
  const discard = async () => {
    if (!discardTarget) return;
    busy = true;
    try {
      const discardedId = discardTarget.id;
      await walletService.discardAddress(discardedId);
      addresses = addresses.map((address) => address.id === discardedId ? { ...address, status: 'discarded' } : address);
      if (current?.id === discardedId) current = awaitingPaymentAddresses(addresses)[0] ?? null;
      discardTarget = null; showDiscard = false; toast({ title: 'Address discarded', description: 'It will not be offered for payment again.' });
    } catch (cause) { toast({ title: 'Could not discard address', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' }); }
    finally { busy = false; }
  };
  const requestDiscard = (address: ReceiveAddress) => { discardTarget = address; showDiscard = true; };
  async function scanVerification(){if(!current)return;verifyOpen=true;verificationAction='scan';verifyBusy=true;verifyError='';verificationDevice=null;try{devices=await walletService.listHardwareDevices();}catch(cause){devices=[];verifyError=cause instanceof Error?cause.message:'Could not scan hardware.';}finally{verifyBusy=false;}}
  async function handleVerificationDevice(device:HardwareDevice){if(device.action==='prompt_pin'){await startHardwarePin(device);return;}if(device.action==='retry'){await scanVerification();return;}if(device.action==='none'){verifyError=device.message;return;}await verifyAddress(device);}
  async function startHardwarePin(device:HardwareDevice){const retrying=pinOpen;verifyBusy=true;pinBusy=retrying;verifyError='';pinError='';pinErrorCode='';pinPositions='';try{pinChallenge=await walletService.promptHardwarePin(device.id);pinDevice=device;verifyOpen=false;pinOpen=true;}catch(cause){const message=cause instanceof Error?cause.message:'Could not start the PIN matrix.';if(retrying){pinErrorCode=cause instanceof WalletError?cause.code:'internal_error';pinError=message;}else verifyError=message;}finally{verifyBusy=false;pinBusy=false;}}
  async function submitHardwarePin(){if(!pinChallenge||!pinPositions||pinBusy)return;pinBusy=true;pinError='';pinErrorCode='';let positions=pinPositions;pinPositions='';try{await walletService.sendHardwarePin(pinChallenge,positions);pinChallenge='';pinOpen=false;pinDevice=null;toast({title:'Hardware wallet unlocked',description:'Scanning again so you can verify the unchanged address.',tone:'success'});await scanVerification();}catch(cause){pinChallenge='';pinErrorCode=cause instanceof WalletError?cause.code:'internal_error';pinError=cause instanceof Error?cause.message:'Trezor did not accept that matrix entry.';}finally{positions='';pinBusy=false;}}
  async function verifyAddress(device:HardwareDevice){if(!current)return;verificationDevice=device;verificationAction='approve';verifyBusy=true;verifyError='';try{const verified=await walletService.verifyExternalAddress(device.id,current.id);addresses=addresses.map((address)=>address.id===verified.id?verified:address);current=verified;verifyOpen=false;toast({title:'Address verified',description:'The verification time was saved with this address.',tone:'success'});}catch(cause){verifyError=cause instanceof Error?cause.message:'The device could not verify this address.';}finally{verifyBusy=false;}}
</script>

<div class="page narrow-page receive-page">
  <header class="page-header"><div><p class="eyebrow">RECEIVE</p><h1>Receive bitcoin</h1><p class="subtitle">Create a labeled address for one payment.</p></div></header>
  {#if current}
    <section class="receive-card" bind:this={receiveCard}>
      <button class="qr-placeholder qr-button" aria-label="Enlarge QR code" onclick={() => showQr = true}>{#if qrDataUrl}<img src={qrDataUrl} alt="QR code for {current.address}" />{:else}<QrCode size={154} strokeWidth={1.2} /><span>Generating QR…</span>{/if}</button>
      <div class="address-label"><span>{current.label}</span>{#if externalSigner}{#if current.hardwareVerifiedAt}<HardwareVerificationStatus/>{:else}<small>Not verified</small>{/if}{:else}<small>Awaiting payment</small>{/if}</div>
      <button class="address-box" onclick={copy}><code>{current.address}</code>{#if copied}<Check size={17} />{:else}<Copy size={17} />{/if}</button>
      <div class="receive-actions"><Button variant="secondary" onclick={copy}><Copy size={16} />Copy address</Button>{#if externalSigner}<Button variant="secondary" onclick={scanVerification}>{#if current.hardwareVerifiedAt}<ShieldCheck size={16}/>{:else}<Cpu size={16}/>{/if}{current.hardwareVerifiedAt?'Verify again':'Verify on device'}</Button>{/if}<Button variant="ghost-danger" onclick={() => requestDiscard(current!)}><Trash2 size={16} />Discard</Button></div>
      <button class="insight-toggle" onclick={() => showDetails = !showDetails} aria-expanded={showDetails}>{showDetails ? 'Hide' : 'Show'} address details <ChevronDown size={14} class={showDetails ? 'rotated' : ''}/></button>
      {#if showDetails}<dl class="optional-details"><div><dt>Derivation</dt><dd><code>{current.derivationPath}</code></dd></div><div><dt>Type</dt><dd>Native SegWit · BIP84</dd></div>{#if current.hardwareVerifiedAt}<div><dt>Hardware verified</dt><dd><LocalTimestamp value={current.hardwareVerifiedAt}/></dd></div>{/if}{#if current.hardwareVerifiedBy}<div><dt>Signer fingerprint</dt><dd><code>{current.hardwareVerifiedBy}</code></dd></div>{/if}</dl>{/if}
      {#if externalSigner && !current.hardwareVerifiedAt}<p class="privacy-note">Verify on the saved hardware signer before sharing this address.</p>{:else if !externalSigner}<p class="privacy-note">Only an unused address awaiting payment can be discarded. Used addresses remain in your history.</p>{/if}
    </section>
  {:else}
    <section class="empty-state"><span class="empty-icon"><QrCode size={24} /></span><h2>No address awaiting payment</h2><p>Generate a new address and give it a permanent label.</p><Button onclick={() => showGenerate = true}><Plus size={17} />New address</Button></section>
  {/if}
  <div class="section-heading compact"><div><h2>Awaiting payment</h2><p>{awaiting.length} active {awaiting.length === 1 ? 'address' : 'addresses'}</p></div><Button variant="secondary" size="small" onclick={() => showGenerate = true} ariaLabel="New receive address"><Plus size={15} />New</Button></div>
  <div class="awaiting-addresses">
    {#each awaiting as address}
      <article class:active={current?.id === address.id}>
        <button class="awaiting-select" aria-label="View {address.label}" onclick={() => { current = address; showDetails = false; }}><span class="status-dot"></span><span><strong>{address.label}</strong><small>{compactAddress(address.address)}</small></span><span class="right-meta">Awaiting<small>{address.created}</small></span></button>
        <button class="awaiting-discard" aria-label="Discard {address.label}" onclick={() => requestDiscard(address)}><Trash2 size={15}/></button>
      </article>
    {:else}
      <p class="list-empty">No active payment requests.</p>
    {/each}
  </div>
  <div class="section-heading compact"><div><h2>Address history</h2><p>Used and discarded addresses remain monitored.</p></div></div>
  <div class="address-history">
    {#each history as address}
      <button class="address-history-row" aria-label="View details for {address.label}" onclick={() => detailAddress = address}><span class="status-dot" class:used={address.status === 'used'}></span><span><strong>{address.label}</strong><small>{compactAddress(address.address)}</small></span><span class="right-meta">{address.status}<small>{address.created}</small></span><ChevronRight size={15}/></button>
    {:else}<p class="list-empty">No past addresses yet.</p>
    {/each}
  </div>
</div>

<Modal open={showGenerate} title="New receive address" description="Labels cannot be changed." onclose={() => showGenerate = false}>
  <form onsubmit={(e) => { e.preventDefault(); generate(); }}>
    <label class="field"><span>Permanent label</span><input bind:value={label} placeholder="e.g. Invoice #105" maxlength="48" /><FieldCounter value={label} max={48}/></label>
    <div class="modal-footer"><Button variant="secondary" onclick={() => showGenerate = false}>Cancel</Button><Button type="submit" disabled={!label.trim()} loading={busy} loadingLabel="Generating address…">Generate address</Button></div>
  </form>
</Modal>
<AddressDetailsModal address={detailAddress} open={Boolean(detailAddress)} onclose={() => detailAddress = null}/>
<Modal open={showQr} title={current?.label ?? 'Receive bitcoin'} description="Scan to pay this exact address." onclose={() => showQr = false}>
  {#if current && qrDataUrl}<div class="large-qr"><img src={qrDataUrl} alt="Large QR code for {current.address}"/><ReadableAddress address={current.address} {copied} oncopy={copy}/></div>{/if}
</Modal>
<Modal open={showDiscard} title="Discard {discardTarget?.label ?? 'this address'}?" description="It will be retired and never shown for payment again." onclose={() => { showDiscard = false; discardTarget = null; }}>
  <div class="warning-box">Discarded addresses remain monitored.</div>
  <div class="modal-footer"><Button variant="secondary" onclick={() => { showDiscard = false; discardTarget = null; }}>Keep address</Button><Button variant="danger" loading={busy} loadingLabel="Discarding…" onclick={discard}>Discard address</Button></div>
</Modal>
<Modal open={verifyOpen} preserveTop title="Verify receive address" description={testnetVerificationDevice ? `${testnetVerificationDevice} displays the Regtest output with a testnet prefix. Compare the exact address below.` : "Compare the exact address below with the complete address on your signer's trusted display."} onclose={()=>{if(!verifyBusy)verifyOpen=false;}}>
  {#if current}
    <section class="verification-address" aria-label="Address to compare">
      <span>{testnetVerificationDevice ? `Address shown on ${testnetVerificationDevice}` : 'Address to compare'}</span>
      <ReadableAddress address={testnetVerificationDevice ? current.testnetAlias! : current.address} {copied} oncopy={copyVerificationAddress}/>
      <details class="verification-details"><summary><span>Address details</span><ChevronDown size={14}/></summary>{#if testnetVerificationDevice}<p class="verification-network-note">{testnetVerificationDevice} shows <code>tb1</code> on Regtest while Groot normally uses <code>bcrt1</code>. The prefix and six-character checksum differ; Rust verified that both decode to the identical Bitcoin output script.</p>{/if}<dl class="verification-derivation"><div><dt>Derivation</dt><dd><code>{current.derivationPath}</code></dd></div><div><dt>Address index</dt><dd><code>{current.id}</code></dd></div></dl></details>
    </section>
  {/if}
  {#if verifyBusy}
    <HardwareActionPrompt title={verificationAction === 'approve' ? 'Check your hardware device' : 'Looking for your saved signer'} detail={verificationAction === 'approve' ? 'Compare the complete address above, then approve it on the device.' : 'Keep the signer connected and unlocked while Groot matches its saved identity.'} label={verificationAction === 'approve' ? 'Waiting for hardware approval' : 'Hardware device scan in progress'}/>
  {:else}
    {#if devices.length}
      <div class="source-list hardware-device-list">{#each devices as device}<button disabled={device.action==='none'} onclick={()=>handleVerificationDevice(device)}><Cpu size={18}/><span><strong>{device.label}</strong><small>{device.fingerprint??device.message}</small><em class:ready={device.status==='ready'||device.status==='detected'} class:attention={device.action==='prompt_pin'||device.action==='confirm_empty_passphrase'}>{device.action==='prompt_pin'?'Unlock':device.action==='confirm_empty_passphrase'?'Standard wallet':device.action==='retry'?'Scan again':device.status==='ready'||device.status==='detected'?'Ready':'Unavailable'}</em></span>{#if device.action!=='none'}<ChevronRight size={15}/>{/if}</button>{/each}</div>
      <Button class="verification-rescan" variant="secondary" onclick={scanVerification}>Scan again</Button>
    {:else}
      <HardwareDeviceEmptyState title="Saved signer not found" description="Connect and unlock this wallet’s hardware signer, then scan again." onretry={scanVerification}/>
    {/if}
  {/if}
  {#if verifyError}<p class="form-error" role="alert">{verifyError}</p>{/if}
</Modal>
<TrezorPinModal
  open={pinOpen}
  busy={pinBusy}
  challengeReady={Boolean(pinChallenge)}
  positions={pinPositions}
  device={pinDevice}
  errorCode={pinErrorCode}
  error={pinError}
  onappend={(position)=>pinPositions+=position}
  ondelete={()=>pinPositions=pinPositions.slice(0,-1)}
  onclear={()=>pinPositions=''}
  onsubmit={submitHardwarePin}
  onretry={()=>{if(pinDevice)startHardwarePin(pinDevice);}}
  onclose={()=>{pinOpen=false;pinPositions='';pinChallenge='';pinDevice=null;pinError='';pinErrorCode='';verifyOpen=true;}}
/>
