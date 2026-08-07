<script lang="ts">
  import { Info } from '@lucide/svelte';
  let { text, label = 'More information' } = $props<{ text: string; label?: string }>();
  let open = $state(false);
</script>

<span class="insight-tip" class:open>
  <button type="button" aria-label={label} aria-expanded={open} onclick={() => open = !open} onblur={() => open = false}>
    <Info size={14}/>
  </button>
  <span role="tooltip">{text}</span>
</span>
