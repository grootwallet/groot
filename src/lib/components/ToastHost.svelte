<script lang="ts">
  import { Check, X, Radio, TriangleAlert } from '@lucide/svelte';
  import { toasts, dismissToast } from '$lib/stores/toasts';
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { fly } from 'svelte/transition';
</script>

<div class="toast-region" aria-live="polite">
  {#each $toasts as item (item.id)}
    <div
      class="toast"
      class:warning={item.tone === 'warning'}
      class:danger={item.tone === 'danger'}
      transition:fly={{ x: 12, duration: 180 }}
    >
      <div
        class="toast-mark"
        class:success={item.tone === 'success'}
        class:warning={item.tone === 'warning'}
        class:danger={item.tone === 'danger'}
      >
        {#if item.tone === 'success'}<Check
            size={15}
            strokeWidth={2.5}
          />{:else if item.tone === 'warning' || item.tone === 'danger'}<TriangleAlert
            size={15}
            strokeWidth={2.25}
          />{:else}<Radio size={15} />{/if}
      </div>
      <div class="toast-copy">
        <strong>{translate($locale, item.title)}</strong>{#if item.description}<span
            >{translate($locale, item.description)}</span
          >{/if}{#if item.action}<button
            onclick={async () => {
              await item.action?.run();
              dismissToast(item.id);
            }}>{translate($locale, item.action.label)}</button
          >{/if}
      </div>
      <button
        class="toast-close"
        aria-label={translate($locale, 'Dismiss')}
        onclick={() => dismissToast(item.id)}><X size={14} /></button
      >
    </div>
  {/each}
</div>
