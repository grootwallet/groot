<script lang="ts">
  import WarningNotice from '$lib/components/WarningNotice.svelte';
  import Button from '$lib/components/Button.svelte';
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { RefreshCw } from '@lucide/svelte';

  let { title, description, onretry } = $props<{
    title: string;
    description: string;
    onretry: () => void | Promise<void>;
  }>();
</script>

<WarningNotice
  tone="danger"
  icon
  role="alert"
  class="load-failure inline-action"
  {title}
  body={description}
>
  <Button variant="secondary" size="small" onclick={onretry}>
    <RefreshCw size={14} />{translate($locale, 'Try again')}
  </Button>
</WarningNotice>
