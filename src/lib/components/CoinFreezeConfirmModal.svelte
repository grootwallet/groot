<script lang="ts">
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
  description={frozen
    ? 'This changes coin selection only. Your bitcoin stays in this wallet.'
    : 'This makes the coin available for payments again.'}
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
        Frozen coins are excluded from automatic and manual spending until you unfreeze them.
      {:else}
        Unfreezing does not spend this coin. It only makes it eligible for automatic selection and
        manual sends.
      {/if}
    </p>

    <div class="coin-freeze-actions">
      <Button variant="secondary" disabled={busy} onclick={close}>Cancel</Button>
      <Button
        loading={busy}
        loadingLabel={frozen ? 'Freezing…' : 'Unfreezing…'}
        onclick={onconfirm}
      >
        {#if frozen}<Snowflake size={16} />{:else}<Unlock size={16} />{/if}
        {actionLabel}
      </Button>
    </div>
  </div>
</Modal>
