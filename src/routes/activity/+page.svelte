<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate, localizedError } from '$lib/i18n-catalog';
  import TxDetailsModal from '$lib/components/TxDetailsModal.svelte';
  import TxList from '$lib/components/TxList.svelte';
  import type { Transaction } from '$lib/types';
  import { toast } from '$lib/stores/toasts';
  import { walletService } from '$lib/wallet';
  import { sortTransactions, type TransactionSortOrder } from '$lib/wallet/presentation';
  import { onMount } from 'svelte';
  import { Activity } from '@lucide/svelte';
  import LoadFailure from '$lib/components/LoadFailure.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { useWalletShellContext } from '$lib/wallet/shell-context';
  const walletShell = useWalletShellContext();
  let selected = $state<Transaction | null>(null);
  let transactions = $state<Transaction[]>([]);
  let filter = $state<'all' | 'received' | 'sent'>('all');
  let query = $state('');
  let sortOrder = $state<TransactionSortOrder>('newest');
  let multisig = $state(false);
  let loading = $state(true);
  let loadError = $state('');
  const visibleTransactions = $derived(
    sortTransactions(
      transactions.filter((transaction) => {
        if (filter !== 'all' && transaction.direction !== filter) return false;
        const needle = query.trim().toLocaleLowerCase();
        if (!needle) return true;
        return [
          transaction.label,
          transaction.intentLabel?.text,
          ...transaction.provenance.labels.map((label) => label.text)
        ]
          .filter(Boolean)
          .some((value) => value?.toLocaleLowerCase().includes(needle));
      }),
      sortOrder
    )
  );
  onMount(load);
  async function load() {
    loading = true;
    loadError = '';
    try {
      const shellWallets = walletShell.profiles();
      const shellSelectedWalletId = walletShell.selectedWalletId();
      const registry =
        shellWallets.length && shellSelectedWalletId
          ? { wallets: shellWallets, selectedWalletId: shellSelectedWalletId }
          : await walletService.profiles();
      multisig =
        registry.wallets.find((wallet) => wallet.id === registry.selectedWalletId)?.kind ===
        'multisig';
      const snapshot = multisig
        ? await walletService.multisigSnapshot()
        : await walletService.snapshot();
      transactions = snapshot.transactions;
    } catch (cause) {
      loadError = localizedError(cause, $locale, 'Transaction history could not be read.');
      toast({ title: 'Could not load transactions', description: loadError, tone: 'danger' });
    } finally {
      loading = false;
    }
  }
  onMount(() =>
    walletService.subscribe((event) => {
      if (event.type === 'wallet_updated' && event.walletId === walletShell.selectedWalletId()) {
        multisig = event.walletKind === 'multisig';
        transactions = event.snapshot.transactions;
        loadError = '';
        loading = false;
      }
    })
  );
</script>

<div class="page">
  <header class="page-header">
    <div>
      <p class="eyebrow">{translate($locale, 'HISTORY')}</p>
      <h1>{translate($locale, 'Activity')}</h1>
    </div>
    <div class="segmented">
      <button class:active={filter === 'all'} onclick={() => (filter = 'all')}
        >{translate($locale, 'All')}</button
      ><button class:active={filter === 'received'} onclick={() => (filter = 'received')}
        >{translate($locale, 'Received')}</button
      ><button class:active={filter === 'sent'} onclick={() => (filter = 'sent')}
        >{translate($locale, 'Sent')}</button
      >
    </div>
  </header>
  <section class="activity-controls" aria-label={translate($locale, 'Search and sort activity')}>
    <label
      ><span>{translate($locale, 'Search')}</span><input
        bind:value={query}
        placeholder={translate($locale, 'Search labels')}
      /></label
    >
    <label
      ><span>{translate($locale, 'Sort')}</span><select bind:value={sortOrder}>
        <option value="newest">{translate($locale, 'Latest first')}</option><option value="oldest"
          >{translate($locale, 'Earliest first')}</option
        >
        <option value="largest">{translate($locale, 'Biggest amount')}</option><option
          value="smallest">{translate($locale, 'Smallest amount')}</option
        >
      </select></label
    >
  </section>
  <section class="section-block">
    {#if loading}
      <TxList items={[]} {loading} />
    {:else if loadError}
      <LoadFailure
        title={translate($locale, 'Transactions are unavailable')}
        description={loadError}
        onretry={load}
      />
    {:else if visibleTransactions.length}
      <TxList items={visibleTransactions} onselect={(tx) => (selected = tx)} />
    {:else}
      <EmptyState
        title={query.trim()
          ? translate($locale, 'No matching transactions')
          : filter === 'all'
            ? translate($locale, 'No transactions yet')
            : translate(
                $locale,
                filter === 'received' ? 'No received transactions' : 'No sent transactions'
              )}
        description={query.trim()
          ? translate($locale, 'Try a different label or filter.')
          : filter === 'all'
            ? translate($locale, 'Payments you send and receive will appear here.')
            : translate(
                $locale,
                filter === 'received'
                  ? 'This wallet has no received transactions yet.'
                  : 'This wallet has no sent transactions yet.'
              )}
      >
        {#snippet icon()}<Activity size={24} />{/snippet}
      </EmptyState>
    {/if}
  </section>
</div>

<TxDetailsModal transaction={selected} {multisig} onclose={() => (selected = null)} />
