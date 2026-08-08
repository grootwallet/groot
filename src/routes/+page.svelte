<script lang="ts">
  import { Activity, ArrowDownToLine, ArrowUpFromLine, CircleDot, Eye, EyeOff, RefreshCw, ShieldCheck } from '@lucide/svelte';
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
  import { discreetMode, setDiscreetMode } from '$lib/privacy';
  import MobileWalletSwitcher from '$lib/components/MobileWalletSwitcher.svelte';
  import OverflowMenuButton from '$lib/components/OverflowMenuButton.svelte';
  import WalletSkeleton from '$lib/components/WalletSkeleton.svelte';
  import LoadFailure from '$lib/components/LoadFailure.svelte';
  import { useWalletShellContext } from '$lib/wallet/shell-context';
  import { fly } from 'svelte/transition';
  const walletShell = useWalletShellContext();
  let syncing = $state(false);
  let snapshot = $state<WalletSnapshot | null>(null);
  let selected = $state<Transaction | null>(null);
  let multisig = $state(false);
  let moreOpen = $state(false);
  let moreMenu = $state<HTMLDivElement | null>(null);
  let moreTrigger = $state<HTMLButtonElement | null>(null);
  let loadError = $state('');
  const pendingSats = $derived(snapshot ? pendingBalance(snapshot.balance) : 0);
  const recentTransactions = $derived(sortTransactionsNewestFirst(snapshot?.transactions ?? []).slice(0, 3));
  onMount(loadSnapshot);
  async function loadSnapshot() {
    loadError = '';
    try {
      if (!await walletService.exists()) { await goto('/welcome'); return; }
      const registry = await walletService.profiles();
      multisig = registry.wallets.find((wallet) => wallet.id === registry.selectedWalletId)?.kind === 'multisig';
      snapshot = multisig ? await walletService.multisigSnapshot() : await walletService.snapshot();
    } catch (cause) {
      if (cause instanceof WalletError && cause.code === 'wallet_locked') { await goto('/unlock'); return; }
      loadError = cause instanceof Error ? cause.message : 'The wallet data could not be read.';
      toast({ title: 'Could not open wallet', description: loadError, tone: 'danger' });
    }
  }
  onMount(() => walletService.subscribe((event) => {
    if (event.type === 'wallet_updated') { multisig = event.walletKind === 'multisig'; snapshot = event.snapshot; loadError = ''; }
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
  {#if loadError && !snapshot}
    <LoadFailure title="Wallet data is unavailable" description={loadError} onretry={loadSnapshot} />
  {:else if snapshot}
  <section class="balance-card content-reveal">
    <div class="balance-top"><span>Total balance</span><button class="ghost-icon" aria-label={$discreetMode ? 'Show wallet amounts' : 'Hide wallet amounts'} aria-pressed={$discreetMode} onclick={() => setDiscreetMode(!$discreetMode)}>{#if $discreetMode}<Eye size={17} />{:else}<EyeOff size={17} />{/if}</button></div>
    <div class="balance-value">{$discreetMode ? '••••••••' : shortSats(snapshot?.balance.total ?? 0)} <small>sats</small></div>
    <div class="balance-fiat">{$discreetMode ? '••••••' : `₿ ${btc(snapshot?.balance.total ?? 0)}`}</div>
    <div class="pending-line"><i></i>{$discreetMode ? '••••••' : shortSats(pendingSats)} sats pending</div>
  </section>
  {:else}
    <WalletSkeleton variant="balance" />
  {/if}
  {#if !loadError}
  <div class="primary-actions">
    <MobileWalletSwitcher profiles={walletShell.profiles()} selectedWalletId={walletShell.selectedWalletId()} onselect={walletShell.selectWallet} />
    <div class="overview-more" bind:this={moreMenu}>
      <OverflowMenuButton bind:element={moreTrigger} label="More wallet actions" expanded={moreOpen} size="large" onclick={() => moreOpen = !moreOpen}/>
      {#if moreOpen}
        <div class="overview-more-menu" role="menu" aria-label="More wallet actions" transition:fly={{ y: 5, duration: 160 }}>
          <a href="/activity" role="menuitem" onclick={() => moreOpen = false}><Activity size={16} /><span><strong>Activity</strong><small>View all transactions</small></span></a>
          <a href="/coins" role="menuitem" onclick={() => moreOpen = false}><CircleDot size={16} /><span><strong>Coins</strong><small>Inspect and choose UTXOs</small></span></a>
          {#if multisig}<a href="/multisig" role="menuitem" onclick={() => moreOpen = false}><ShieldCheck size={16} /><span><strong>Policy</strong><small>Keys, backups, and rules</small></span></a>{/if}
        </div>
      {/if}
    </div>
    <a class="button secondary large overview-inline-primary" href={multisig ? '/multisig/receive' : '/receive'}><ArrowDownToLine size={18} />Receive</a>
    <a class="button default large overview-inline-primary" href={multisig ? '/multisig/send' : '/send'}><ArrowUpFromLine size={18} />Send</a>
  </div>
  <section class="section-block">
    <div class="section-heading"><div><h2>Recent activity</h2></div><a href="/activity">View all</a></div>
    <TxList items={recentTransactions} loading={!snapshot} onselect={(transaction) => selected = transaction} />
  </section>
  {/if}
</div>

<TxDetailsModal transaction={selected} {multisig} onclose={() => selected = null} />
