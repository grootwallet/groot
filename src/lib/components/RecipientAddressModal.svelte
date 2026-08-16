<script lang="ts">
  import Modal from './Modal.svelte';
  import ReadableAddress from './ReadableAddress.svelte';
  import { copyText } from '$lib/clipboard';
  import { toast } from '$lib/stores/toasts';

  let {
    address,
    label,
    open,
    title = 'Recipient address',
    description = 'Verify the complete destination before signing.',
    detail = 'Outgoing payment · permanent label',
    onclose
  } = $props<{
    address: string;
    label: string;
    open: boolean;
    title?: string;
    description?: string;
    detail?: string;
    onclose: () => void;
  }>();
  let copied = $state(false);

  async function copy() {
    try {
      await copyText(address, 'bitcoin-address');
      copied = true;
      toast({ title: 'Recipient address copied', tone: 'success' });
      setTimeout(() => (copied = false), 1_500);
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Select and copy the address manually.',
        tone: 'danger'
      });
    }
  }
</script>

<Modal {open} {title} {description} {onclose}>
  <div class="address-detail-view">
    <div class="address-detail-status">
      <span class="status-dot"></span><span><strong>{label}</strong><small>{detail}</small></span>
    </div>
    <ReadableAddress {address} {copied} oncopy={copy} />
    <p>
      The brighter first and last groups are the quickest comparison points. Spaces are visual only;
      copying uses the exact address.
    </p>
  </div>
</Modal>
