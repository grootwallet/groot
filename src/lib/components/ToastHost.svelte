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

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.toast-region):where(.toast-region) {
    position: fixed;
    z-index: 200;
    right: 20px;
    bottom: 20px;
    width: min(360px, calc(100% - 40px));
    max-width: calc(100% - 40px);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  :global(.toast-mark):where(.toast-mark) {
    width: 27px;
    height: 27px;
    border-radius: var(--radius-control);
    background: var(--surface-icon);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  :global(.toast-mark.success):where(.toast-mark) {
    background: color-mix(in srgb, var(--success) 12%, transparent);
    color: var(--success);
  }
  :global(.toast-mark.warning):where(.toast-mark) {
    color: var(--warning-text);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  :global(.toast-mark.danger):where(.toast-mark) {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 10%, transparent);
  }
  :global(.toast-copy):where(.toast-copy) {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  :global(.toast-copy):where(.toast-copy) :global(strong) {
    font-size: var(--font-size-meta);
    overflow-wrap: anywhere;
  }
  :global(.toast-copy):where(.toast-copy) :global(span) {
    overflow-wrap: anywhere;
    word-break: break-word;
    font-size: var(--font-size-meta);
    color: var(--muted);
  }
  :global(.toast-copy):where(.toast-copy) :global(button) {
    width: fit-content;
    max-width: 100%;
    margin-top: 3px;
    padding: 0;
    border: 0;
    color: var(--link);
    background: transparent;
    font-size: var(--font-size-meta);
    font-weight: 650;
    overflow-wrap: anywhere;
    text-align: left;
    cursor: pointer;
  }
  :global(.toast-copy):where(.toast-copy) :global(button:hover) {
    text-decoration: underline;
  }
  :global(.toast-copy):where(.toast-copy) :global(button:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: 3px;
  }
  :global(.toast-close):where(.toast-close) {
    border: 0;
    background: none;
    color: var(--muted);
    padding: 3px;
  }

  @media (max-width: 760px) {
    :global(.toast-region):where(.toast-region) {
      left: max(12px, env(safe-area-inset-left));
      right: max(12px, env(safe-area-inset-right));
      bottom: calc(142px + env(safe-area-inset-bottom));
      width: auto;
      max-width: 360px;
      margin-left: auto;
    }
  }
</style>
