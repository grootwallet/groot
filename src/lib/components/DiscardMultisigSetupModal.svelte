<script lang="ts">
  import Button from './Button.svelte';
  import Modal from './Modal.svelte';

  let {
    open,
    busy = false,
    error = '',
    onclose,
    onconfirm
  }: {
    open: boolean;
    busy?: boolean;
    error?: string;
    onclose: () => void;
    onconfirm: () => void | Promise<void>;
  } = $props();
</script>

<Modal
  {open}
  title="Discard multisig setup?"
  description="Remove this unfinished public wallet setup from Groot."
  onclose={() => {
    if (!busy) onclose();
  }}
>
  <div class="warning-box danger">
    <strong>You will need to add the signers again.</strong><span
      >No wallet, signer seed, or bitcoin is deleted.</span
    >
  </div>
  {#if error}<p class="inline-error" role="alert">{error}</p>{/if}
  <div class="modal-footer">
    <Button variant="secondary" disabled={busy} onclick={onclose}>Keep setup</Button><Button
      variant="danger"
      loading={busy}
      loadingLabel="Discarding…"
      onclick={onconfirm}>Discard setup</Button
    >
  </div>
</Modal>
