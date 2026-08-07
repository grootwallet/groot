<script lang="ts">
  import TxDetailsModal from '$lib/components/TxDetailsModal.svelte';
  import TxList from '$lib/components/TxList.svelte';
  import type { Transaction } from '$lib/types';
  import { toast } from '$lib/stores/toasts';
  import { walletService } from '$lib/wallet';
  import { sortTransactionsNewestFirst } from '$lib/wallet/presentation';
  import { onMount } from 'svelte';
  import { Activity } from '@lucide/svelte';
  let selected = $state<Transaction | null>(null);
  let transactions = $state<Transaction[]>([]);
  let filter = $state<'all' | 'received' | 'sent'>('all');
  let multisig = $state(false);
  const visibleTransactions = $derived(sortTransactionsNewestFirst(filter === 'all' ? transactions : transactions.filter((transaction) => transaction.direction === filter)));
  onMount(async () => {
    try { const registry=await walletService.profiles();multisig=registry.wallets.find((wallet)=>wallet.id===registry.selectedWalletId)?.kind==='multisig';const snapshot=multisig?await walletService.multisigSnapshot():await walletService.snapshot();transactions=snapshot.transactions; }
    catch (cause) { toast({ title: 'Could not load transactions', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' }); }
  });
  onMount(() => walletService.subscribe((event) => {
    if (event.type === 'wallet_updated') { multisig = event.walletKind === 'multisig'; transactions = event.snapshot.transactions; }
  }));
</script>

<div class="page">
  <header class="page-header"><div><p class="eyebrow">HISTORY</p><h1>Activity</h1><p class="subtitle">Every transaction in this wallet.</p></div><div class="segmented"><button class:active={filter === 'all'} onclick={() => filter = 'all'}>All</button><button class:active={filter === 'received'} onclick={() => filter = 'received'}>Received</button><button class:active={filter === 'sent'} onclick={() => filter = 'sent'}>Sent</button></div></header>
  <section class="section-block">
    {#if visibleTransactions.length}
      <TxList items={visibleTransactions} onselect={(tx) => selected = tx} />
    {:else}
      <div class="empty-state activity-empty"><span class="empty-icon"><Activity size={24}/></span><h2>{filter === 'all' ? 'No transactions yet' : `No ${filter} transactions`}</h2><p>{filter === 'all' ? 'Payments you send and receive will appear here.' : `This wallet has no ${filter} transactions yet.`}</p></div>
    {/if}
  </section>
</div>

<TxDetailsModal transaction={selected} {multisig} onclose={() => selected = null} />
