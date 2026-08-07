<script lang="ts">
  import { Check, ChevronDown, ChevronRight, Copy, Plus, QrCode, Trash2 } from '@lucide/svelte';
  import QRCode from 'qrcode';
  import { onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import ReadableAddress from '$lib/components/ReadableAddress.svelte';
  import AddressDetailsModal from '$lib/components/AddressDetailsModal.svelte';
  import { compactAddress } from '$lib/address-display';
  import { walletService } from '$lib/wallet';
  import { awaitingPaymentAddresses } from '$lib/wallet/policy';
  import type { ReceiveAddress } from '$lib/types';
  import { copyText } from '$lib/clipboard';
  import { toast } from '$lib/stores/toasts';
  let label = $state(''); let current = $state<ReceiveAddress | null>(null); let addresses = $state<ReceiveAddress[]>([]);
  let qrDataUrl = $state(''); let busy = $state(false); let showGenerate = $state(false); let showDiscard = $state(false); let showQr = $state(false); let showDetails = $state(false); let copied = $state(false); let discardTarget = $state<ReceiveAddress | null>(null); let detailAddress = $state<ReceiveAddress | null>(null);
  let awaiting = $derived(awaitingPaymentAddresses(addresses)); let history = $derived(addresses.filter((address)=>address.status!=='awaiting'));
  onMount(() => {
    const unsubscribe = walletService.subscribe((event) => {
      if (event.type === 'wallet_updated' && event.walletKind === 'multisig') applyAddresses(event.snapshot.receiveAddresses);
    });
    void walletService.multisigSnapshot().then((state) => applyAddresses(state.receiveAddresses)).catch((cause) => {
      toast({title:'Could not load vault',description:cause instanceof Error ? cause.message : undefined,tone:'danger'});
    });
    return unsubscribe;
  });
  $effect(() => { const address = current?.address; qrDataUrl = ''; if (address) QRCode.toDataURL(`bitcoin:${address}`, {width:320,margin:2,errorCorrectionLevel:'M'}).then((value) => { if(current?.address===address) qrDataUrl = value; }); });
  async function generate() { if (!label.trim()) return; busy = true; try { current = await walletService.createMultisigAddress(label); addresses = [current,...addresses]; label=''; showGenerate=false; toast({title:'Vault address ready',description:'The permanent label is stored with the multisig wallet.',tone:'success'}); } catch(cause){toast({title:'Could not generate address',description:cause instanceof Error?cause.message:undefined,tone:'danger'});} finally{busy=false;} }
  async function copy(){if(!current)return;try{await copyText(current.address);copied=true;toast({title:'Address copied',tone:'success'});setTimeout(()=>copied=false,1500);}catch{toast({title:'Copy failed',tone:'danger'});}}
  async function discard(){if(!discardTarget)return;busy=true;try{const id=discardTarget.id;await walletService.discardMultisigAddress(id);addresses=addresses.map((item)=>item.id===id?{...item,status:'discarded'}:item);if(current?.id===id)current=awaitingPaymentAddresses(addresses)[0]??null;discardTarget=null;showDiscard=false;toast({title:'Address discarded'});}catch(cause){toast({title:'Could not discard address',description:cause instanceof Error?cause.message:undefined,tone:'danger'});}finally{busy=false;}}
  function applyAddresses(nextAddresses:ReceiveAddress[]){addresses=nextAddresses;const nextAwaiting=awaitingPaymentAddresses(nextAddresses);current=nextAwaiting.find((address)=>address.id===current?.id)??nextAwaiting[0]??null;}
  const requestDiscard=(address:ReceiveAddress)=>{discardTarget=address;showDiscard=true;};
</script>

<div class="page narrow-page receive-page">
  <header class="page-header"><div><p class="eyebrow">RECEIVE</p><h1>Receive bitcoin</h1><p class="subtitle">Create a labeled address for one payment.</p></div><Button variant="secondary" href="/">Back to overview</Button></header>
  {#if current}<section class="receive-card"><button class="qr-placeholder qr-button" aria-label="Enlarge QR code" onclick={()=>showQr=true}>{#if qrDataUrl}<img src={qrDataUrl} alt="QR code for {current.address}"/>{:else}<QrCode size={154}/>{/if}</button><div class="address-label"><span>{current.label}</span><small>Awaiting payment</small></div><button class="address-box" onclick={copy}><code>{current.address}</code>{#if copied}<Check size={17}/>{:else}<Copy size={17}/>{/if}</button><div class="receive-actions"><Button variant="secondary" onclick={copy}><Copy size={16}/>Copy address</Button><Button variant="ghost-danger" onclick={()=>requestDiscard(current!)}><Trash2 size={16}/>Discard</Button></div><button class="insight-toggle" onclick={()=>showDetails=!showDetails}>{showDetails?'Hide':'Show'} address details <ChevronDown size={14} class={showDetails?'rotated':''}/></button>{#if showDetails}<dl class="optional-details"><div><dt>Derivation</dt><dd><code>{current.derivationPath}</code></dd></div><div><dt>Type</dt><dd>Descriptor · Miniscript</dd></div></dl>{/if}<p class="privacy-note">Verify the address on a capable hardware device before receiving significant funds.</p></section>
  {:else}<section class="empty-state"><span class="empty-icon"><QrCode size={24}/></span><h2>No address awaiting payment</h2><p>Every receive address needs a permanent label.</p><Button onclick={()=>showGenerate=true}><Plus size={17}/>New address</Button></section>{/if}
  <div class="section-heading compact"><div><h2>Awaiting payment</h2><p>{awaiting.length} active {awaiting.length===1?'address':'addresses'}</p></div><Button variant="secondary" size="small" onclick={()=>showGenerate=true} ariaLabel="New vault address"><Plus size={15}/>New</Button></div>
  <div class="awaiting-addresses">{#each awaiting as address}<article class:active={current?.id===address.id}><button class="awaiting-select" aria-label="View {address.label}" onclick={()=>{current=address;showDetails=false;}}><span class="status-dot"></span><span><strong>{address.label}</strong><small>{compactAddress(address.address)}</small></span><span class="right-meta">Awaiting<small>{address.created}</small></span></button><button class="awaiting-discard" aria-label="Discard {address.label}" onclick={()=>requestDiscard(address)}><Trash2 size={15}/></button></article>{:else}<p class="list-empty">No active payment requests.</p>{/each}</div>
  <div class="section-heading compact"><div><h2>Address history</h2><p>Used and discarded addresses remain monitored.</p></div></div>
  <div class="address-history">{#each history as address}<button class="address-history-row" aria-label="View details for {address.label}" onclick={()=>detailAddress=address}><span class="status-dot" class:used={address.status==='used'}></span><span><strong>{address.label}</strong><small>{compactAddress(address.address)}</small></span><span class="right-meta">{address.status}<small>{address.created}</small></span><ChevronRight size={15}/></button>{:else}<p class="list-empty">No past addresses yet.</p>{/each}</div>
</div>

<Modal open={showGenerate} title="New vault address" description="The label is mandatory and cannot be edited later." onclose={()=>showGenerate=false}><form onsubmit={(e)=>{e.preventDefault();generate();}}><label class="field"><span>Permanent label</span><input bind:value={label} maxlength="48" placeholder="e.g. Treasury deposit"/></label><div class="modal-footer"><Button variant="secondary" onclick={()=>showGenerate=false}>Cancel</Button><Button type="submit" disabled={!label.trim()} loading={busy} loadingLabel="Generating address…">Generate address</Button></div></form></Modal>
<Modal open={showDiscard} title="Discard {discardTarget?.label??'this vault address'}?" description="It remains monitored but will never be offered again." onclose={()=>{showDiscard=false;discardTarget=null;}}><div class="modal-footer"><Button variant="secondary" onclick={()=>{showDiscard=false;discardTarget=null;}}>Keep address</Button><Button variant="danger" loading={busy} loadingLabel="Discarding…" onclick={discard}>Discard address</Button></div></Modal>
<Modal open={showQr} title={current?.label??'Vault address'} description="Scan to pay this exact descriptor address." onclose={()=>showQr=false}>{#if current&&qrDataUrl}<div class="large-qr"><img src={qrDataUrl} alt="Large QR code for {current.address}"/><ReadableAddress address={current.address} {copied} oncopy={copy}/></div>{/if}</Modal>
<AddressDetailsModal address={detailAddress} open={Boolean(detailAddress)} walletType="Descriptor · Native SegWit" onclose={()=>detailAddress=null}/>
