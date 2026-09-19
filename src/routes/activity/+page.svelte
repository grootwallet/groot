<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate, localizedError } from '$lib/i18n-catalog';
  import TxDetailsModal from '$lib/components/TxDetailsModal.svelte';
  import TxList from '$lib/components/TxList.svelte';
  import type { Transaction } from '$lib/types';
  import { toast } from '$lib/stores/toasts';
  import { walletService, WalletError, walletErrorCode } from '$lib/wallet';
  import { transactionForSelection, type TransactionSortOrder } from '$lib/wallet/presentation';
  import Button from '$lib/components/Button.svelte';
  import { onMount } from 'svelte';
  import { Activity, RefreshCw } from '@lucide/svelte';
  import LoadFailure from '$lib/components/LoadFailure.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { useWalletShellContext } from '$lib/wallet/shell-context';
  import { goto } from '$app/navigation';
  import { isWalletSyncActive } from '$lib/wallet/live-sync';
  const walletShell = useWalletShellContext();
  let selectedTransactionId = $state<string | null>(null);
  let transactions = $state<Transaction[]>([]);
  let selected = $derived(transactionForSelection(transactions, selectedTransactionId));
  let filter = $state<'all' | 'received' | 'sent'>('all');
  let query = $state('');
  let sortOrder = $state<TransactionSortOrder>('newest');
  let multisig = $state(false);
  let loading = $state(true);
  let syncing = $state(false);
  let syncError = $state('');
  let loadError = $state('');
  let walletId = '';
  let mounted = $state(false);
  let generation = 0;
  let cursor = $state<import('$lib/wallet/contracts').ActivityCursor | null>(null);
  let loadingMore = $state(false);
  let pageError = $state('');
  let restartRequired = $state(false);
  let syncWatchToken = 0;
  onMount(() => {
    let disposed = false;
    void walletService
      .profiles()
      .then((registry) => {
        if (disposed) return;
        walletId = registry.selectedWalletId ?? '';
        multisig = registry.wallets.find((profile) => profile.id === walletId)?.kind === 'multisig';
        mounted = true;
        void observeActiveSync();
      })
      .catch((cause) => {
        if (disposed) return;
        loading = false;
        loadError = localizedError(cause, $locale, 'Transaction history could not be read.');
      });
    const unsubscribe = walletService.subscribe((event) => {
      if (mounted && event.type === 'wallet_updated' && event.walletId === walletId) void load();
    });
    return () => {
      disposed = true;
      ++generation;
      ++syncWatchToken;
      unsubscribe();
    };
  });
  $effect(() => {
    const selection = { filter, query, sortOrder };
    if (!mounted) return;
    ++generation;
    selectedTransactionId = null;
    cursor = null;
    loading = true;
    const timer = setTimeout(() => void load(), selection.query.trim() ? 180 : 0);
    return () => clearTimeout(timer);
  });
  async function load(more = false) {
    const requestGeneration = ++generation;
    if (more) loadingMore = true;
    else {
      loading = true;
      cursor = null;
    }
    loadError = '';
    pageError = '';
    restartRequired = false;
    try {
      if (!walletId) {
        const registry = await walletService.profiles();
        if (requestGeneration !== generation) return;
        walletId = registry.selectedWalletId ?? '';
        multisig = registry.wallets.find((profile) => profile.id === walletId)?.kind === 'multisig';
      }
      const page = await walletService.activity({
        walletId,
        filter,
        query,
        sort: sortOrder,
        limit: 50,
        cursor: more ? cursor : null
      });
      if (requestGeneration !== generation || walletId !== walletShell.selectedWalletId()) return;
      transactions = more ? [...transactions, ...page.transactions] : page.transactions;
      cursor = page.nextCursor;
    } catch (cause) {
      if (requestGeneration !== generation) return;
      if (cause instanceof WalletError && cause.code === 'wallet_locked') {
        await goto('/unlock');
        return;
      }
      const message = localizedError(cause, $locale, 'Transaction history could not be read.');
      if (more) {
        pageError = message;
        restartRequired = cause instanceof WalletError && cause.code === 'history_changed';
      } else loadError = message;
      toast({ title: 'Could not load transactions', description: message, tone: 'danger' });
    } finally {
      if (requestGeneration === generation) {
        loading = false;
        loadingMore = false;
      }
    }
  }
  async function observeActiveSync(refreshWhenDone = true) {
    const initial = await walletService.syncStatus().catch(() => null);
    if (!isWalletSyncActive(initial)) return false;
    const token = ++syncWatchToken;
    syncing = true;
    syncError = '';
    try {
      while (token === syncWatchToken) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const status = await walletService.syncStatus().catch(() => null);
        if (token !== syncWatchToken) return true;
        if (isWalletSyncActive(status)) continue;
        if (status?.state === 'failed') {
          syncError = localizedError(
            new WalletError(
              walletErrorCode(status.failureCode),
              'The active wallet refresh did not complete.'
            ),
            $locale,
            'Could not refresh activity.'
          );
        } else if (refreshWhenDone && status?.state === 'completed') await load();
        return true;
      }
    } finally {
      if (token === syncWatchToken) syncing = false;
    }
    return true;
  }
  async function syncNow() {
    if (syncing || loading) return;
    syncing = true;
    syncError = '';
    try {
      await walletShell.pauseAutomaticSync();
      if (await observeActiveSync()) return;
      syncing = true;
      if (multisig) await walletService.syncMultisig();
      else await walletService.sync();
      // The subscription also refreshes Activity on wallet_updated; do not
      // schedule a second read of the same snapshot here.
      toast({
        title: 'Wallet is up to date',
        description: 'Transactions refreshed.',
        tone: 'success'
      });
    } catch (cause) {
      if (cause instanceof WalletError && cause.code === 'sync_cancelled') return;
      if (cause instanceof WalletError && cause.code === 'sync_in_progress') {
        await observeActiveSync();
        return;
      }
      if (cause instanceof WalletError && cause.code === 'wallet_locked') {
        await goto('/unlock');
        return;
      }
      syncError = localizedError(cause, $locale, 'Could not refresh activity.');
      toast({ title: 'Sync failed', description: syncError, tone: 'danger' });
    } finally {
      syncing = false;
      walletShell.resumeAutomaticSync();
    }
  }
</script>

<div class="page activity-page">
  <header class="page-header">
    <div>
      <p class="eyebrow">{translate($locale, 'HISTORY')}</p>
      <h1>{translate($locale, 'Activity')}</h1>
    </div>
    <div class="page-header-actions activity-header-actions">
      <button class="sync-button" disabled={syncing || loading} onclick={syncNow}
        ><RefreshCw size={15} class={syncing ? 'spin' : ''} />{translate(
          $locale,
          syncing ? 'Refreshing activity…' : 'Refresh activity'
        )}</button
      >
      <div class="segmented">
        <button class:active={filter === 'all'} onclick={() => (filter = 'all')}
          >{translate($locale, 'All')}</button
        ><button class:active={filter === 'received'} onclick={() => (filter = 'received')}
          >{translate($locale, 'Received')}</button
        ><button class:active={filter === 'sent'} onclick={() => (filter = 'sent')}
          >{translate($locale, 'Sent')}</button
        >
      </div>
    </div>
  </header>
  {#if syncError}<LoadFailure
      title={translate($locale, 'Sync failed')}
      description={syncError}
      onretry={syncNow}
    />{/if}
  <section class="activity-controls" aria-label={translate($locale, 'Search and sort activity')}>
    <label
      ><span>{translate($locale, 'Search')}</span><input
        bind:value={query}
        maxlength={128}
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
        onretry={() => load()}
      />
    {:else if transactions.length}
      <TxList items={transactions} onselect={(tx) => (selectedTransactionId = tx.id)} />
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
    {#if !loading && !loadError && pageError}
      <LoadFailure
        title={translate($locale, 'Transactions are unavailable')}
        description={pageError}
        onretry={() => load(!restartRequired)}
      />
    {:else if !loading && !loadError && cursor}
      <Button
        variant="secondary"
        loading={loadingMore}
        loadingLabel={translate($locale, 'Loading…')}
        onclick={() => load(true)}>{translate($locale, 'Load more')}</Button
      >
    {/if}
  </section>
</div>

<TxDetailsModal transaction={selected} {multisig} onclose={() => (selectedTransactionId = null)} />
