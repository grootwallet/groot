<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { RefreshCw, WifiOff } from '@lucide/svelte';

  let { title, description, onretry } = $props<{
    title: string;
    description: string;
    onretry: () => void | Promise<void>;
  }>();
</script>

<div class="load-failure" role="alert">
  <span><WifiOff size={19} /></span>
  <div><strong>{title}</strong><small>{description}</small></div>
  <button class="button secondary small" type="button" onclick={onretry}
    ><RefreshCw size={14} />{translate($locale, 'Try again')}</button
  >
</div>
