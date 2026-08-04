<script lang="ts">
  import { ArrowDownToLine, ArrowUpFromLine, Eye, EyeOff, RefreshCw } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import TxList from '$lib/components/TxList.svelte';
  import TxDetailsModal from '$lib/components/TxDetailsModal.svelte';
  import { btc, shortSats } from '$lib/data';
  import { toast } from '$lib/stores/toasts';
  import { walletService, WalletError, type WalletSnapshot } from '$lib/wallet';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { Transaction } from '$lib/types';
  let hidden = $state(false);
  let syncing = $state(false);
  let snapshot = $state<WalletSnapshot | null>(null);
  let selected = $state<Transaction | null>(null);
  onMount(async () => {
    try {
      if (!await walletService.exists()) { await goto('/welcome'); return; }
      snapshot = await walletService.snapshot();
    } catch (cause) {
      if (cause instanceof WalletError && cause.code === 'wallet_locked') { await goto('/unlock'); return; }
      toast({ title: 'Could not open wallet', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' });
    }
  });
  const sync = async () => {
    syncing = true;
    try { snapshot = await walletService.sync(); toast({ title: 'Wallet is up to date', description: 'Balance and transactions refreshed.', tone: 'success' }); }
    catch (cause) { toast({ title: 'Sync failed', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' }); }
    finally { syncing = false; }
  };
</script>

<div class="page dashboard-page">
  <header class="page-header"><div><p class="eyebrow">MY WALLET</p><h1>Overview</h1></div><button class="sync-button" onclick={sync}><RefreshCw size={15} class={syncing ? 'spin' : ''} />{syncing ? 'Syncing' : 'Updated now'}</button></header>
  <section class="balance-card">
    <div class="balance-top"><span>Total balance</span><button class="ghost-icon" aria-label="Toggle balance visibility" onclick={() => hidden = !hidden}>{#if hidden}<Eye size={17} />{:else}<EyeOff size={17} />{/if}</button></div>
    <div class="balance-value">{hidden ? '••••••••' : shortSats(snapshot?.balance.total ?? 0)} <small>sats</small></div>
    <div class="balance-fiat">{hidden ? '••••••' : `₿ ${btc(snapshot?.balance.total ?? 0)}`}</div>
    <div class="pending-line"><i></i>{shortSats(snapshot?.balance.trustedPending ?? 0)} sats pending</div>
  </section>
  <div class="primary-actions desktop-only">
    <a class="button secondary large" href="/receive"><ArrowDownToLine size={18} />Receive</a>
    <a class="button default large" href="/send"><ArrowUpFromLine size={18} />Send</a>
  </div>
  <section class="section-block">
    <div class="section-heading"><div><h2>Recent activity</h2><p>Your latest wallet transactions</p></div><a href="/activity">View all</a></div>
    <TxList items={(snapshot?.transactions ?? []).slice(0, 3)} onselect={(transaction) => selected = transaction} />
  </section>
</div>

<TxDetailsModal transaction={selected} onclose={() => selected = null} />
