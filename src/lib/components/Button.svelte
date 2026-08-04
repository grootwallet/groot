<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = {
    variant?: string;
    size?: string;
    type?: 'button' | 'submit' | 'reset';
    href?: string;
    disabled?: boolean;
    onclick?: (event: MouseEvent) => unknown;
    children?: Snippet;
    class?: string;
    ariaLabel?: string;
  };

  let { variant = 'default', size = 'default', type = 'button', href = undefined, disabled = false, onclick = undefined, children, class: className = '', ariaLabel = undefined }: Props = $props();
</script>

{#if href}
  <a {href} aria-label={ariaLabel} aria-disabled={disabled} {onclick} class="button {variant} {size} {className}">{@render children?.()}</a>
{:else}
  <button {type} {disabled} aria-label={ariaLabel} {onclick} class="button {variant} {size} {className}">{@render children?.()}</button>
{/if}
