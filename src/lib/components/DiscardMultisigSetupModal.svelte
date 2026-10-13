<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import Button from './Button.svelte';
  import Modal from './Modal.svelte';
  import WarningNotice from './WarningNotice.svelte';

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
  title={translate($locale, 'Discard multisig setup?')}
  description={translate($locale, 'Remove this unfinished public wallet setup from Groot.')}
  onclose={() => {
    if (!busy) onclose();
  }}
>
  <WarningNotice
    tone="danger"
    title={translate($locale, 'You will need to add the signers again.')}
    body={translate($locale, 'No wallet, signer seed, or bitcoin is deleted.')}
  />
  {#if error}<p class="inline-error" role="alert">{error}</p>{/if}
  <div class="modal-footer">
    <Button variant="secondary" disabled={busy} onclick={onclose}
      >{translate($locale, 'Keep setup')}</Button
    ><Button
      variant="danger"
      loading={busy}
      loadingLabel={translate($locale, 'Discarding…')}
      onclick={onconfirm}>{translate($locale, 'Discard setup')}</Button
    >
  </div>
</Modal>
