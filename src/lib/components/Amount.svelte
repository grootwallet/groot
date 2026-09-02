<script lang="ts">
  import { amountUnit, denomination, formatAmount, setDenomination } from '$lib/denomination';
  let {
    value,
    sign = '',
    hidden = false,
    unit = true,
    interactive = false
  } = $props<{
    value: number;
    sign?: string;
    hidden?: boolean;
    unit?: boolean;
    interactive?: boolean;
  }>();

  function toggleDenomination() {
    setDenomination($denomination === 'sats' ? 'btc' : 'sats');
  }
</script>

{#snippet formattedAmount()}
  <strong>{hidden ? '••••••' : `${sign}${formatAmount(value, $denomination)}`}</strong>
  {#if unit}<small>{amountUnit($denomination)}</small>{/if}
{/snippet}

{#if interactive && !hidden}
  <button class="formatted-amount interactive-amount" type="button" onclick={toggleDenomination}>
    {@render formattedAmount()}
  </button>
{:else}
  <span class="formatted-amount">{@render formattedAmount()}</span>
{/if}

<style>
  .formatted-amount {
    display: inline-flex;
    align-items: baseline;
    gap: 0;
    max-width: 100%;
  }

  .formatted-amount > small {
    margin-inline-start: 0.4em;
  }

  .interactive-amount {
    appearance: none;
    border: 0;
    border-radius: 0.35rem;
    background: transparent;
    color: inherit;
    font: inherit;
    padding: 0.1rem 0.2rem;
    margin: -0.1rem -0.2rem;
    cursor: pointer;
  }

  .interactive-amount:hover,
  .interactive-amount:focus-visible {
    background: color-mix(in srgb, currentColor 9%, transparent);
    outline: none;
  }

  .interactive-amount:focus-visible {
    box-shadow: 0 0 0 2px var(--focus);
  }
</style>
