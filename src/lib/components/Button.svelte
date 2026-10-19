<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = {
    variant?: 'default' | 'secondary' | 'ghost' | 'ghost-danger' | 'danger' | 'danger-outline';
    size?: 'default' | 'small' | 'large' | 'sm';
    type?: 'button' | 'submit' | 'reset';
    href?: string;
    disabled?: boolean;
    loading?: boolean;
    loadingLabel?: string;
    onclick?: (event: MouseEvent) => unknown;
    children?: Snippet;
    class?: string;
    ariaLabel?: string;
  };

  let {
    variant = 'default',
    size = 'default',
    type = 'button',
    href = undefined,
    disabled = false,
    loading = false,
    loadingLabel = 'Working…',
    onclick = undefined,
    children,
    class: className = '',
    ariaLabel = undefined
  }: Props = $props();
  let unavailable = $derived(disabled || loading);

  function handleLinkClick(event: MouseEvent) {
    if (unavailable) {
      event.preventDefault();
      return;
    }
    onclick?.(event);
  }
</script>

{#if href}
  <a
    {href}
    aria-label={ariaLabel}
    aria-disabled={unavailable}
    aria-busy={loading}
    onclick={handleLinkClick}
    class="button {variant} {size === 'default' ? '' : size} {className}"
  >
    {#if loading}<span class="button-loading-indicator" aria-hidden="true"></span><span
        >{loadingLabel}</span
      >{:else}{@render children?.()}{/if}
  </a>
{:else}
  <button
    {type}
    disabled={unavailable}
    aria-label={ariaLabel}
    aria-busy={loading}
    {onclick}
    class="button {variant} {size === 'default' ? '' : size} {className}"
  >
    {#if loading}<span class="button-loading-indicator" aria-hidden="true"></span><span
        >{loadingLabel}</span
      >{:else}{@render children?.()}{/if}
  </button>
{/if}

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.button-loading-indicator):where(.button-loading-indicator) {
    position: relative;
    display: block;
    flex: 0 0 16px;
    width: 16px;
    height: 16px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: groot-spinner-rotation 1s linear infinite;
  }
</style>
