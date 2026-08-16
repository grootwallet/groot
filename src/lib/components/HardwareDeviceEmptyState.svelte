<script lang="ts">
  import { AlertTriangle, RefreshCw } from '@lucide/svelte';
  import Button from './Button.svelte';

  let { title, description, onretry } = $props<{
    title: string;
    description: string;
    onretry: () => void | Promise<void>;
  }>();
</script>

<div class="hardware-device-empty" role="status">
  <span class="hardware-device-empty-icon"><AlertTriangle size={18} /></span>
  <span class="hardware-device-empty-copy">
    <strong>{title}</strong>
    <small>{description}</small>
  </span>
  <Button variant="secondary" size="small" onclick={onretry}
    ><RefreshCw size={14} />Scan again</Button
  >
</div>
