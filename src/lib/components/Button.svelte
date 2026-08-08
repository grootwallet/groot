<script lang="ts">
  import { LoaderCircle } from '@lucide/svelte';
  import type { Snippet } from 'svelte';

  type Props = {
    variant?: string;
    size?: string;
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

  let { variant = 'default', size = 'default', type = 'button', href = undefined, disabled = false, loading = false, loadingLabel = 'Working…', onclick = undefined, children, class: className = '', ariaLabel = undefined }: Props = $props();
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
  <a {href} aria-label={ariaLabel} aria-disabled={unavailable} aria-busy={loading} onclick={handleLinkClick} class="button {variant} {size === 'default' ? '' : size} {className}">
    {#if loading}<LoaderCircle class="spin" size={16}/><span>{loadingLabel}</span>{:else}{@render children?.()}{/if}
  </a>
{:else}
  <button {type} disabled={unavailable} aria-label={ariaLabel} aria-busy={loading} {onclick} class="button {variant} {size === 'default' ? '' : size} {className}">
    {#if loading}<LoaderCircle class="spin" size={16}/><span>{loadingLabel}</span>{:else}{@render children?.()}{/if}
  </button>
{/if}
