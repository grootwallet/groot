<script lang="ts">
  import Modal from './Modal.svelte';
  import ReadableAddress from './ReadableAddress.svelte';
  import { copyText } from '$lib/clipboard';
  import { presentLocalTimestamp } from '$lib/date-time';
  import { toast } from '$lib/stores/toasts';
  import type { ReceiveAddress } from '$lib/types';

  let { address, open, walletType = 'Native SegWit', onclose } = $props<{
    address: ReceiveAddress | null;
    open: boolean;
    walletType?: string;
    onclose: () => void;
  }>();
  let copied = $state(false);
  let created = $derived(address ? presentLocalTimestamp(address.created) : null);

  async function copy() {
    if (!address) return;
    try {
      await copyText(address.address);
      copied = true;
      toast({ title: 'Address copied', tone: 'success' });
      setTimeout(() => copied = false, 1_500);
    } catch {
      toast({ title: 'Copy failed', description: 'Select and copy the address manually.', tone: 'danger' });
    }
  }
</script>

<Modal {open} title={address?.label ?? 'Address details'} description="Permanent receive record for this wallet." {onclose}>
  {#if address}
    <div class="address-detail-view">
      <div class="address-detail-status"><span class="status-dot" class:used={address.status === 'used'}></span><span><strong>{address.label}</strong><small>{address.status === 'awaiting' ? 'Awaiting payment' : address.status === 'used' ? 'Payment received' : 'Retired from presentation'}</small></span></div>
      <ReadableAddress address={address.address} {copied} oncopy={copy}/>
      <dl><div><dt>Status</dt><dd>{address.status}</dd></div><div><dt>Created</dt><dd class="address-created-time">{#if created?.dateTime}<time datetime={created.dateTime} title={created.detail}>{created.display}</time>{:else}<span title={created?.detail}>{created?.display}</span>{/if}</dd></div><div><dt>Derivation path</dt><dd><code>{address.derivationPath}</code></dd></div><div><dt>Address type</dt><dd>{walletType}</dd></div></dl>
      <p>The label is permanent. Spaces above are visual only; copying always uses the exact address.</p>
    </div>
  {/if}
</Modal>
