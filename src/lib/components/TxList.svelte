<script lang="ts">
  import { ArrowDownLeft, ArrowUpRight, ChevronRight, Clock3 } from '@lucide/svelte';
  import { shortSats } from '$lib/data';
  import type { Transaction } from '$lib/types';
  import LocalTimestamp from './LocalTimestamp.svelte';
  import { formatConfirmationCount, locale, t } from '$lib/i18n';
  let { items, onselect = () => {} } = $props<{ items: Transaction[]; onselect?: (tx: Transaction) => void }>();
</script>

<div class="tx-list">
  {#each items as tx}
    <button class="tx-row" class:pending={tx.status === 'pending'} onclick={() => onselect(tx)}>
      <span class="tx-icon" class:received={tx.direction === 'received'} class:pending={tx.status === 'pending'}>
        {#if tx.status === 'pending'}<Clock3 size={17}/>{:else if tx.direction === 'received'}<ArrowDownLeft size={17} />{:else}<ArrowUpRight size={17} />{/if}
      </span>
      <span class="tx-main"><strong>{tx.label}</strong><small><LocalTimestamp value={tx.date} /> · {tx.status === 'pending' ? t('unconfirmed', $locale) : formatConfirmationCount(tx.confirmations, $locale)}</small></span>
      <span class="tx-amount" class:positive={tx.direction === 'received' && tx.status !== 'pending'}><strong>{tx.direction === 'received' ? '+' : '−'}{shortSats(tx.amount)} sats</strong><small>{tx.status === 'pending' ? t('awaitingConfirmation', $locale) : t('confirmed', $locale)}</small></span>
      <ChevronRight class="tx-chevron" size={16} />
    </button>
  {/each}
</div>
