<script lang="ts">
  import { X } from '@lucide/svelte';
  let { open, title, description = '', onclose, children } = $props();
</script>

{#if open}
  <div class="modal-layer" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
    <div class="modal" role="dialog" aria-modal="true" aria-label={title}>
      <header class="modal-header">
        <div><h2>{title}</h2>{#if description}<p>{description}</p>{/if}</div>
        <button class="icon-button" aria-label="Close" onclick={onclose}><X size={18} /></button>
      </header>
      <div class="modal-body">{@render children?.()}</div>
    </div>
  </div>
{/if}
