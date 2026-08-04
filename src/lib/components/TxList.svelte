<script lang="ts">
  import { ArrowDownLeft, ArrowUpRight, ChevronRight } from '@lucide/svelte';
  import { shortSats } from '$lib/data';
  import type { Transaction } from '$lib/types';
  let { items, onselect = () => {} } = $props<{ items: Transaction[]; onselect?: (tx: Transaction) => void }>();
</script>

<div class="tx-list">
  {#each items as tx}
    <button class="tx-row" onclick={() => onselect(tx)}>
      <span class="tx-icon" class:received={tx.direction === 'received'}>
        {#if tx.direction === 'received'}<ArrowDownLeft size={17} />{:else}<ArrowUpRight size={17} />{/if}
      </span>
      <span class="tx-main"><strong>{tx.label}</strong><small>{tx.date} · {tx.status === 'pending' ? 'Unconfirmed' : `${tx.confirmations} confirmations`}</small></span>
      <span class="tx-amount" class:positive={tx.direction === 'received'}><strong>{tx.direction === 'received' ? '+' : '−'}{shortSats(tx.amount)} sats</strong><small>{tx.status}</small></span>
      <ChevronRight class="tx-chevron" size={16} />
    </button>
  {/each}
</div>
