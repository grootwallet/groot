<script lang="ts">
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
  <button class="button secondary small" type="button" onclick={onretry}><RefreshCw size={14} />Try again</button>
</div>
