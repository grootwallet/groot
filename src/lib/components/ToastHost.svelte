<script lang="ts">
  import { Check, X, Radio } from '@lucide/svelte';
  import { toasts, dismissToast } from '$lib/stores/toasts';
  import { fly } from 'svelte/transition';
</script>

<div class="toast-region" aria-live="polite">
  {#each $toasts as item (item.id)}
    <div class="toast" transition:fly={{ x: 12, duration: 180 }}>
      <div class="toast-mark" class:success={item.tone === 'success'}>
        {#if item.tone === 'success'}<Check size={15} strokeWidth={2.5} />{:else}<Radio size={15} />{/if}
      </div>
      <div class="toast-copy"><strong>{item.title}</strong>{#if item.description}<span>{item.description}</span>{/if}{#if item.action}<button onclick={async () => { await item.action?.run(); dismissToast(item.id); }}>{item.action.label}</button>{/if}</div>
      <button class="toast-close" aria-label="Dismiss" onclick={() => dismissToast(item.id)}><X size={14} /></button>
    </div>
  {/each}
</div>
