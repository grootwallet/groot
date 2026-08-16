<script lang="ts">
  import { Cpu } from '@lucide/svelte';

  let {
    title,
    detail,
    label = 'Hardware action in progress'
  }: {
    title: string;
    detail: string;
    label?: string;
  } = $props();
</script>

<div class="hardware-action-prompt" role="status" aria-live="polite" aria-label={label}>
  <span class="hardware-action-visual" aria-hidden="true"><Cpu size={21} /></span>
  <span class="hardware-action-copy">
    <strong>{title}</strong>
    <small>{detail}</small>
  </span>
  <span class="hardware-action-dots" aria-hidden="true"><i></i><i></i><i></i></span>
</div>
