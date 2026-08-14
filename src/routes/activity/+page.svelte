<script lang="ts">
  import TxDetailsModal from '$lib/components/TxDetailsModal.svelte';
  import TxList from '$lib/components/TxList.svelte';
  import type { Transaction } from '$lib/types';
  import { toast } from '$lib/stores/toasts';
  import { walletService } from '$lib/wallet';
  import { sortTransactionsNewestFirst } from '$lib/wallet/presentation';
  import { onMount } from 'svelte';
  import { Activity } from '@lucide/svelte';
  import LoadFailure from '$lib/components/LoadFailure.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { useWalletShellContext } from '$lib/wallet/shell-context';
  const walletShell = useWalletShellContext();
  let selected = $state<Transaction | null>(null);
  let transactions = $state<Transaction[]>([]);
  let filter = $state<'all' | 'received' | 'sent'>('all');
  let multisig = $state(false);
  let loading = $state(true);
  let loadError = $state('');
  const visibleTransactions = $derived(sortTransactionsNewestFirst(filter === 'all' ? transactions : transactions.filter((transaction) => transaction.direction === filter)));
  onMount(load);
  async function load() {
    loading = true;
    loadError = '';
    try {
      const shellWallets = walletShell.profiles();
      const shellSelectedWalletId = walletShell.selectedWalletId();
      const registry = shellWallets.length && shellSelectedWalletId
        ? { wallets: shellWallets, selectedWalletId: shellSelectedWalletId }
        : await walletService.profiles();
      multisig = registry.wallets.find((wallet)=>wallet.id===registry.selectedWalletId)?.kind==='multisig';
      const snapshot=multisig?await walletService.multisigSnapshot():await walletService.snapshot();
      transactions=snapshot.transactions;
    }
    catch (cause) { loadError = cause instanceof Error ? cause.message : 'Transaction history could not be read.'; toast({ title: 'Could not load transactions', description: loadError, tone: 'danger' }); }
    finally { loading = false; }
  }
  onMount(() => walletService.subscribe((event) => {
    if (event.type === 'wallet_updated' && event.walletId === walletShell.selectedWalletId()) {
      multisig = event.walletKind === 'multisig'; transactions = event.snapshot.transactions; loadError = ''; loading = false;
    }
  }));
</script>

<div class="page">
  <header class="page-header"><div><p class="eyebrow">HISTORY</p><h1>Activity</h1></div><div class="segmented"><button class:active={filter === 'all'} onclick={() => filter = 'all'}>All</button><button class:active={filter === 'received'} onclick={() => filter = 'received'}>Received</button><button class:active={filter === 'sent'} onclick={() => filter = 'sent'}>Sent</button></div></header>
  <section class="section-block">
    {#if loading}
      <TxList items={[]} {loading} />
    {:else if loadError}
      <LoadFailure title="Transactions are unavailable" description={loadError} onretry={load} />
    {:else if visibleTransactions.length}
      <TxList items={visibleTransactions} onselect={(tx) => selected = tx} />
    {:else}
      <EmptyState title={filter === 'all' ? 'No transactions yet' : `No ${filter} transactions`} description={filter === 'all' ? 'Payments you send and receive will appear here.' : `This wallet has no ${filter} transactions yet.`}>
        {#snippet icon()}<Activity size={24}/>{/snippet}
      </EmptyState>
    {/if}
  </section>
</div>

<TxDetailsModal transaction={selected} {multisig} onclose={() => selected = null} />
