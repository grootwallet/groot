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

  async function copy() {
    try {
      await copyText(value, 'identifier');
      copied = true;
      toast({
        title: translate($locale, '{label} copied', { label: translate($locale, label) }),
        tone: 'success'
      });
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
