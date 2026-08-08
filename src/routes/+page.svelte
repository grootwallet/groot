<script lang="ts">
  import { Activity, ArrowDownToLine, ArrowUpFromLine, CircleDot, Eye, EyeOff, MoreVertical, RefreshCw, ShieldCheck } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import TxList from '$lib/components/TxList.svelte';
  import TxDetailsModal from '$lib/components/TxDetailsModal.svelte';
  import { btc, shortSats } from '$lib/data';
  import { toast } from '$lib/stores/toasts';
  import { walletService, WalletError, type WalletSnapshot } from '$lib/wallet';
  import { pendingBalance, sortTransactionsNewestFirst } from '$lib/wallet/presentation';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { Transaction } from '$lib/types';
  let hidden = $state(false);
  let syncing = $state(false);
  let snapshot = $state<WalletSnapshot | null>(null);
  let selected = $state<Transaction | null>(null);
  let multisig = $state(false);
  let moreOpen = $state(false);
  let moreMenu: HTMLDivElement | null = null;
  let moreTrigger: HTMLButtonElement | null = null;
  const pendingSats = $derived(snapshot ? pendingBalance(snapshot.balance) : 0);
  const recentTransactions = $derived(sortTransactionsNewestFirst(snapshot?.transactions ?? []).slice(0, 3));
  onMount(async () => {
    try {
      if (!await walletService.exists()) { await goto('/welcome'); return; }
      const registry = await walletService.profiles();
      multisig = registry.wallets.find((wallet) => wallet.id === registry.selectedWalletId)?.kind === 'multisig';
      snapshot = multisig ? await walletService.multisigSnapshot() : await walletService.snapshot();
    } catch (cause) {
      if (cause instanceof WalletError && cause.code === 'wallet_locked') { await goto('/unlock'); return; }
      toast({ title: 'Could not open wallet', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' });
    }
  });
  onMount(() => walletService.subscribe((event) => {
    if (event.type === 'wallet_updated') { multisig = event.walletKind === 'multisig'; snapshot = event.snapshot; }
  }));
  onMount(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (moreOpen && event.target instanceof Node && !moreMenu?.contains(event.target)) moreOpen = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !moreOpen) return;
      moreOpen = false;
      requestAnimationFrame(() => moreTrigger?.focus());
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  });
  const sync = async () => {
    syncing = true;
    try {
      const [nextSnapshot] = await Promise.all([
        multisig ? walletService.syncMultisig() : walletService.sync(),
        new Promise((resolve) => setTimeout(resolve, 1_200))
      ]);
      snapshot = nextSnapshot;
      toast({ title: 'Wallet is up to date', description: 'Balance and transactions refreshed.', tone: 'success' });
    }
    catch (cause) { toast({ title: 'Sync failed', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' }); }
    finally { syncing = false; }
  };
</script>

<div class="page dashboard-page">
  <header class="page-header"><div><p class="eyebrow">WALLET</p><h1>Overview</h1></div><button class="sync-button" onclick={sync}><RefreshCw size={15} class={syncing ? 'spin' : ''} />{syncing ? 'Syncing' : 'Updated now'}</button></header>
  <section class="balance-card">
    <div class="balance-top"><span>Total balance</span><button class="ghost-icon" aria-label="Toggle balance visibility" onclick={() => hidden = !hidden}>{#if hidden}<Eye size={17} />{:else}<EyeOff size={17} />{/if}</button></div>
    <div class="balance-value">{hidden ? '••••••••' : shortSats(snapshot?.balance.total ?? 0)} <small>sats</small></div>
    <div class="balance-fiat">{hidden ? '••••••' : `₿ ${btc(snapshot?.balance.total ?? 0)}`}</div>
    <div class="pending-line"><i></i>{shortSats(pendingSats)} sats pending</div>
  </section>
  <div class="primary-actions">
    <a class="button secondary large overview-inline-primary" href={multisig ? '/multisig/receive' : '/receive'}><ArrowDownToLine size={18} />Receive</a>
    <a class="button default large overview-inline-primary" href={multisig ? '/multisig/send' : '/send'}><ArrowUpFromLine size={18} />Send</a>
    <div class="overview-more" bind:this={moreMenu}>
      <button bind:this={moreTrigger} class="button secondary large overview-more-trigger" aria-label="More wallet actions" aria-haspopup="menu" aria-expanded={moreOpen} onclick={() => moreOpen = !moreOpen}><MoreVertical size={26} strokeWidth={2.4} /></button>
      {#if moreOpen}
        <div class="overview-more-menu" role="menu" aria-label="More wallet actions">
          <a href="/activity" role="menuitem" onclick={() => moreOpen = false}><Activity size={16} /><span><strong>Activity</strong><small>View all transactions</small></span></a>
          <a href="/coins" role="menuitem" onclick={() => moreOpen = false}><CircleDot size={16} /><span><strong>Coins</strong><small>Inspect and choose UTXOs</small></span></a>
          {#if multisig}<a href="/multisig" role="menuitem" onclick={() => moreOpen = false}><ShieldCheck size={16} /><span><strong>Policy</strong><small>Keys, backups, and rules</small></span></a>{/if}
        </div>
      {/if}
    </div>
  </div>
  <section class="section-block">
    <div class="section-heading"><div><h2>Recent activity</h2></div><a href="/activity">View all</a></div>
    <TxList items={recentTransactions} onselect={(transaction) => selected = transaction} />
  </section>
</div>

<TxDetailsModal transaction={selected} {multisig} onclose={() => selected = null} />
