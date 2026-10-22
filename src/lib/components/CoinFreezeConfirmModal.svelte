<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { Snowflake, Unlock } from '@lucide/svelte';
  import Button from './Button.svelte';
  import Modal from './Modal.svelte';
  import { shortSats } from '$lib/data';
  import Amount from './Amount.svelte';
  import type { Utxo } from '$lib/types';

  type Props = {
    coins: Utxo[];
    frozen: boolean;
    busy?: boolean;
    onclose: () => void;
    onconfirm: () => void;
  };

  let { coins, frozen, busy = false, onclose, onconfirm }: Props = $props();
  let count = $derived(coins.length);
  let total = $derived(coins.reduce((sum, coin) => sum + coin.amount, 0));
  let subject = $derived(
    count === 1 ? (coins[0]?.label ?? 'this coin') : `${count} selected coins`
  );
  let title = $derived(`${frozen ? 'Freeze' : 'Unfreeze'} ${subject}?`);
  let actionLabel = $derived(`${frozen ? 'Freeze' : 'Unfreeze'} ${count === 1 ? 'coin' : 'coins'}`);

  function close() {
    if (!busy) onclose();
  }
</script>

<Modal
  open={count > 0}
  {title}
  description={translate(
    $locale,
    frozen
      ? 'This changes coin selection only. Your bitcoin stays in this wallet.'
      : 'This makes the coin available for payments again.'
  )}
  onclose={close}
>
  <div class="coin-freeze-confirmation">
    <div class="coin-freeze-summary">
      <span class:frozen
        >{#if frozen}<Snowflake size={18} />{:else}<Unlock size={18} />{/if}</span
      >
      <div>
        <strong>{subject}</strong>
        <small><Amount value={total} /></small>
      </div>
    </div>

    <p>
      {#if frozen}
        {translate(
          $locale,
          'Frozen coins are excluded from automatic and manual spending until you unfreeze them.'
        )}
      {:else}
        {translate(
          $locale,
          'Unfreezing does not spend this coin. It only makes it eligible for automatic selection and\n        manual sends.'
        )}
      {/if}
    </p>

    <div class="coin-freeze-actions">
      <Button variant="secondary" disabled={busy} onclick={close}
        >{translate($locale, 'Cancel')}</Button
      >
      <Button
        loading={busy}
        loadingLabel={translate($locale, frozen ? 'Freezing…' : 'Unfreezing…')}
        onclick={onconfirm}
      >
        {#if frozen}<Snowflake size={16} />{:else}<Unlock size={16} />{/if}
        {actionLabel}
      </Button>
    </div>
  </div>
</Modal>

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.coin-freeze-confirmation):where(.coin-freeze-confirmation) {
    display: grid;
    gap: 14px;
  }
  :global(.coin-freeze-summary):where(.coin-freeze-summary) {
    min-width: 0;
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr);
    align-items: center;
    gap: 11px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-control);
  }
  :global(.coin-freeze-summary):where(.coin-freeze-summary) > :global(span) {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-control);
    color: var(--success);
    background: color-mix(in srgb, var(--success) 8%, transparent);
  }
  :global(.coin-freeze-summary):where(.coin-freeze-summary) > :global(span.frozen) {
    color: var(--link);
    background: color-mix(in srgb, var(--link) 10%, transparent);
  }
  :global(.coin-freeze-summary):where(.coin-freeze-summary) > :global(div) {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  :global(.coin-freeze-summary):where(.coin-freeze-summary) :global(strong) {
    overflow: hidden;
    color: var(--text);
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.coin-freeze-summary):where(.coin-freeze-summary) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.coin-freeze-confirmation):where(.coin-freeze-confirmation) > :global(p) {
    margin: 0;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.55;
  }
  :global(.coin-freeze-actions):where(.coin-freeze-actions) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding-top: 2px;
  }
</style>
