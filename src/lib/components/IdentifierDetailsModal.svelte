<script lang="ts">
  import Modal from './Modal.svelte';
  import ReadableIdentifier from './ReadableIdentifier.svelte';
  import { copyText } from '$lib/clipboard';
  import { toast } from '$lib/stores/toasts';
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';

  let { value, open, title, description, label, onclose } = $props<{
    value: string;
    open: boolean;
    title: string;
    description: string;
    label: string;
    onclose: () => void;
  }>();
  let copied = $state(false);

  function usesInlineSuccessFeedback() {
    return typeof window !== 'undefined' && matchMedia('(max-width: 760px)').matches;
  }

  async function copy() {
    try {
      await copyText(value, 'identifier');
      copied = true;
      if (!usesInlineSuccessFeedback()) {
        toast({
          title: translate($locale, '{label} copied', { label: translate($locale, label) }),
          tone: 'success'
        });
      }
      setTimeout(() => (copied = false), 1_500);
    } catch {
      toast({
        title: 'Copy failed',
        description: translate($locale, 'Select and copy the {label} manually.', {
          label: translate($locale, label).toLocaleLowerCase($locale)
        }),
        tone: 'danger'
      });
    }
  }
</script>

<Modal {open} {title} {description} {onclose}>
  <div class="identifier-detail-view">
    <ReadableIdentifier {value} {label} {copied} oncopy={copy} />
  </div>
</Modal>

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.identifier-detail-view):where(.identifier-detail-view) {
    padding: 2px 0;
  }
  :global(.identifier-detail-view):where(.identifier-detail-view) :global(.readable-address-block) {
    width: 100%;
  }
  :global(.identifier-detail-view):where(.identifier-detail-view) :global(.readable-address) {
    min-height: 84px;
    padding-block: 17px;
  }
  :global(.identifier-detail-view):where(.identifier-detail-view)
    :global(.readable-address-groups) {
    gap: 7px 11px;
    font-size: clamp(14px, 2vw, 16px);
    line-height: 1.55;
  }

  @media (max-width: 760px) {
    :global(.identifier-detail-view):where(.identifier-detail-view) :global(.readable-address) {
      min-height: 112px;
      padding-block: 18px;
    }
    :global(.identifier-detail-view):where(.identifier-detail-view)
      :global(.readable-address-groups) {
      gap: 8px 12px;
      font-size: 15px;
      line-height: 1.6;
    }
  }
</style>
