<script lang="ts">
  import { ArrowDownLeft, ArrowUpRight, ChevronRight, Clock3 } from '@lucide/svelte';
  import { shortSats } from '$lib/data';
  import type { Transaction } from '$lib/types';
  import LocalTimestamp from './LocalTimestamp.svelte';
  import { formatConfirmationCount, locale, t } from '$lib/i18n';
  import { discreetMode } from '$lib/privacy';
  import { fly } from 'svelte/transition';
  import WalletSkeleton from './WalletSkeleton.svelte';
  let { items, loading = false, onselect = () => {} } = $props<{ items: Transaction[]; loading?: boolean; onselect?: (tx: Transaction) => void }>();
</script>

{#if loading}
  <WalletSkeleton variant="transactions" />
{:else}
<div class="tx-list">
  {#each items as tx, index (tx.id)}
    <button class="tx-row" class:pending={tx.status === 'pending'} onclick={() => onselect(tx)} in:fly={{ y: 5, duration: 180, delay: Math.min(index * 24, 96) }}>
      <span class="tx-icon" class:received={tx.direction === 'received'} class:pending={tx.status === 'pending'}>
        {#if tx.status === 'pending'}<Clock3 size={17}/>{:else if tx.direction === 'received'}<ArrowDownLeft size={17} />{:else}<ArrowUpRight size={17} />{/if}
      </span>
      <span class="tx-main"><strong>{tx.label}</strong><small><LocalTimestamp value={tx.date} /> · {tx.status === 'pending' ? t('unconfirmed', $locale) : formatConfirmationCount(tx.confirmations, $locale)}</small></span>
      <span class="tx-amount" class:positive={tx.direction === 'received' && tx.status !== 'pending'}><strong>{#if $discreetMode}•••••• sats{:else}{tx.direction === 'received' ? '+' : '−'}{shortSats(tx.amount)} sats{/if}</strong><small>{tx.kind === 'self_spend' ? 'Network fee' : tx.status === 'pending' ? t('awaitingConfirmation', $locale) : t('confirmed', $locale)}</small></span>
      <ChevronRight class="tx-chevron" size={16} />
    </button>
  {/each}
</div>
{/if}
