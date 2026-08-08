<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowUpDown, Check, ChevronDown } from '@lucide/svelte';
  import { locale, t, type MessageKey } from '$lib/i18n';
  import type { CoinSortOrder } from '$lib/wallet/presentation';

  let {
    value,
    onchange
  }: {
    value: CoinSortOrder;
    onchange: (value: CoinSortOrder) => void;
  } = $props();

  let open = $state(false);
  let root = $state<HTMLDivElement | null>(null);

  const options: ReadonlyArray<{ value: CoinSortOrder; label: MessageKey }> = [
    { value: 'newest', label: 'newestFirst' },
    { value: 'oldest', label: 'oldestFirst' },
    { value: 'largest', label: 'largestFirst' },
    { value: 'smallest', label: 'smallestFirst' },
    { value: 'label-asc', label: 'labelAscending' },
    { value: 'label-desc', label: 'labelDescending' }
  ];

  const currentLabel = $derived(
    t(options.find((option) => option.value === value)?.label ?? 'newestFirst', $locale)
  );

  function choose(next: CoinSortOrder) {
    onchange(next);
    open = false;
  }

  onMount(() => {
    const closeOutside = (event: PointerEvent) => {
      if (open && root && !root.contains(event.target as Node)) open = false;
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') open = false;
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  });
</script>

<div class="coin-sort" bind:this={root}>
  <button
    class="coin-sort-trigger"
    type="button"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={`${t('sortCoins', $locale)}: ${currentLabel}`}
    onclick={() => (open = !open)}
  >
    <ArrowUpDown size={15} />
    <span>{currentLabel}</span>
    <span class:rotated={open}><ChevronDown size={14} /></span>
  </button>

  {#if open}
    <div class="coin-sort-menu" role="menu" aria-label={t('sortCoins', $locale)}>
      {#each options as option}
        <button
          type="button"
          role="menuitemradio"
          aria-checked={value === option.value}
          class:active={value === option.value}
          onclick={() => choose(option.value)}
        >
          <span>{t(option.label, $locale)}</span>
          {#if value === option.value}<Check size={15} />{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .coin-sort {
    position: relative;
  }

  .coin-sort-trigger {
    display: inline-flex;
    min-height: 2.25rem;
    align-items: center;
    gap: 0.45rem;
    padding: 0.45rem 0.65rem;
    border: 1px solid var(--border);
    border-radius: 0.65rem;
    background: var(--panel);
    color: var(--text-soft);
    font: inherit;
    font-size: 0.82rem;
    font-weight: 650;
    cursor: pointer;
  }

  .coin-sort-trigger:hover,
  .coin-sort-trigger:focus-visible {
    background: var(--surface-hover);
    color: var(--text);
    outline: 0;
  }

  .coin-sort-trigger:focus-visible {
    box-shadow: 0 0 0 2px var(--fr-blue);
  }

  .coin-sort-trigger > span:last-child {
    display: flex;
    transition: transform 150ms ease;
  }

  .coin-sort-trigger > span:last-child.rotated {
    transform: rotate(180deg);
  }

  .coin-sort-menu {
    position: absolute;
    z-index: 30;
    top: calc(100% + 0.45rem);
    right: 0;
    min-width: 12rem;
    padding: 0.35rem;
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    background: var(--panel);
    box-shadow: 0 16px 35px rgb(0 0 0 / 16%);
  }

  .coin-sort-menu button {
    display: flex;
    width: 100%;
    min-height: 2.35rem;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.5rem 0.65rem;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--text-soft);
    font: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }

  .coin-sort-menu button:hover,
  .coin-sort-menu button:focus-visible {
    background: var(--surface-hover);
    color: var(--text);
    outline: 0;
  }

  .coin-sort-menu button.active {
    background: color-mix(in srgb, var(--fr-blue) 11%, var(--panel));
    color: var(--fr-blue);
  }

  @media (max-width: 560px) {
    .coin-sort-menu {
      right: auto;
      left: 0;
    }
  }
</style>
