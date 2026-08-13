<script lang="ts">
  import { Activity, ArrowDownToLine, ArrowUpFromLine, ChevronRight, CircleDot, Clock3, Eye, EyeOff, FileKey, RefreshCw, ShieldCheck } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import TxList from '$lib/components/TxList.svelte';
  import TxDetailsModal from '$lib/components/TxDetailsModal.svelte';
  import { btc, shortSats } from '$lib/data';
  import { toast } from '$lib/stores/toasts';
  import { walletService, WalletError, type MultisigProposal, type MultisigWallet, type WalletProfile, type WalletSnapshot, type WalletSyncSource, type WalletSyncStatus } from '$lib/wallet';
  import { latestActiveProposal } from '$lib/wallet/proposal-resume';
  import { pendingBalance, sortTransactionsNewestFirst } from '$lib/wallet/presentation';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { Transaction } from '$lib/types';
  import { discreetMode, setDiscreetMode } from '$lib/privacy';
  import MobileWalletSwitcher from '$lib/components/MobileWalletSwitcher.svelte';
  import OverflowMenuButton from '$lib/components/OverflowMenuButton.svelte';
  import WalletSkeleton from '$lib/components/WalletSkeleton.svelte';
  import LoadFailure from '$lib/components/LoadFailure.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import MultisigDescriptorsModal from '$lib/components/MultisigDescriptorsModal.svelte';
  import { useWalletShellContext } from '$lib/wallet/shell-context';
  import { fly } from 'svelte/transition';
  const walletShell = useWalletShellContext();
  let syncing = $state(false);
  let snapshot = $state<WalletSnapshot | null>(null);
  let multisigWallet = $state<MultisigWallet | null>(null);
  let activeProposal = $state<MultisigProposal | null>(null);
  let selected = $state<Transaction | null>(null);
  let multisig = $state(false);
  let moreOpen = $state(false);
  let moreMenu = $state<HTMLDivElement | null>(null);
  let moreTrigger = $state<HTMLButtonElement | null>(null);
  let showDescriptors = $state(false);
  let loadError = $state('');
  let selectedProfile = $state<WalletProfile | null>(null);
  let verifyOpen = $state(false);
  let verifyCredential = $state('');
  let verifyError = $state('');
  let verifying = $state(false);
  let initialDataLoading = $state(true);
  let syncSource = $state<WalletSyncSource | null>(null);
  let syncStatus = $state<WalletSyncStatus | null>(null);
  let syncPollToken = 0;
  const pendingSats = $derived(snapshot ? pendingBalance(snapshot.balance) : 0);
  const recentTransactions = $derived(sortTransactionsNewestFirst(snapshot?.transactions ?? []).slice(0, 3));
  const proposalHref = $derived(multisig ? '/multisig/send' : '/send');
  const proposalTitle = $derived(activeProposal?.canFinalize ? 'Payment ready to broadcast' : 'Signing in progress');
  const proposalProgress = $derived(activeProposal ? `${activeProposal.signed} of ${activeProposal.required} signatures collected` : '');
  const proposalLabel = $derived(activeProposal ? ($discreetMode ? 'Label hidden' : activeProposal.label) : '');
  onMount(loadSnapshot);
  async function loadSnapshot() {
    loadError = '';
    initialDataLoading = true;
    try {
      if (!await walletService.exists()) { await goto('/welcome'); return; }
      const registry = await walletService.profiles();
      syncSource = await walletService.syncSource();
      selectedProfile = registry.wallets.find((wallet) => wallet.id === registry.selectedWalletId) ?? null;
      multisig = selectedProfile?.kind === 'multisig';
      if (multisig) {
        const [nextSnapshot, nextWallet, proposals] = await Promise.all([walletService.multisigSnapshot(), walletService.multisigWallet(), walletService.multisigProposals()]);
        snapshot = nextSnapshot;
        multisigWallet = nextWallet;
        activeProposal = latestActiveProposal(proposals);
      } else {
        multisigWallet = null;
        const [nextSnapshot, proposals] = await Promise.all([
          walletService.snapshot(),
          selectedProfile?.kind === 'watch_only' ? walletService.externalSignerProposals() : Promise.resolve([])
        ]);
        snapshot = nextSnapshot;
        activeProposal = latestActiveProposal(proposals);
      }
      initialDataLoading = false;
      if (syncSource.type === 'compact_filters') void sync(false);
    } catch (cause) {
      if (cause instanceof WalletError && cause.code === 'wallet_locked') { await goto('/unlock'); return; }
      loadError = cause instanceof Error ? cause.message : 'The wallet data could not be read.';
      initialDataLoading = false;
      toast({ title: 'Could not open wallet', description: loadError, tone: 'danger' });
    }
  }
  onMount(() => walletService.subscribe((event) => {
    if (event.type === 'wallet_updated' && event.walletId === walletShell.selectedWalletId()) {
      multisig = event.walletKind === 'multisig'; snapshot = event.snapshot; loadError = ''; initialDataLoading = false;
    }
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
  async function refreshSyncStatus() {
    try { syncStatus = await walletService.syncStatus(); } catch { /* The sync result remains authoritative. */ }
  }
  async function pollSyncStatus(token: number) {
    while (syncing && token === syncPollToken) {
      await refreshSyncStatus();
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  const sync = async (showToast = true) => {
    if (syncing) return;
    syncing = true;
    const token = ++syncPollToken;
    void pollSyncStatus(token);
    try {
      const [nextSnapshot] = await Promise.all([
        multisig ? walletService.syncMultisig() : walletService.sync(),
        new Promise((resolve) => setTimeout(resolve, 1_200))
      ]);
      snapshot = nextSnapshot;
      if (showToast) toast({ title: 'Wallet is up to date', description: 'Balance and transactions refreshed.', tone: 'success' });
    }
    catch (cause) {
      if (showToast) toast({ title: 'Sync failed', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' });
    }
    finally {
      await refreshSyncStatus();
      syncing = false;
    }
  };
  async function verifyBackup() {
    verifying = true;
    verifyError = '';
    try {
      const verified = await walletService.verifyBackup(verifyCredential);
      verifyCredential = '';
      verifyOpen = false;
      if (!verified) {
        toast({ title: 'Backup still unverified', description: 'You can return to verification whenever you are ready.' });
        return;
      }
      if (selectedProfile) selectedProfile = { ...selectedProfile, backupVerified: true };
      toast({ title: 'Recovery backup verified', description: 'Your written words matched this wallet.', tone: 'success' });
    } catch (cause) {
      verifyError = cause instanceof Error ? cause.message : 'Could not verify this recovery backup.';
    } finally {
      verifyCredential = '';
      verifying = false;
    }
  }
</script>

<div class="page dashboard-page">
  <header class="page-header"><div><p class="eyebrow">WALLET</p><h1>Overview</h1></div><button class="sync-button" disabled={syncing} onclick={() => sync(true)}><RefreshCw size={15} class={syncing ? 'spin' : ''} />{syncing && syncStatus?.progressPercent !== null && syncStatus?.progressPercent !== undefined ? `${syncStatus.progressPercent}%` : syncing ? 'Syncing' : 'Updated now'}</button></header>
  {#if syncSource?.type === 'compact_filters' && syncStatus && (syncing || syncStatus.state === 'failed')}
    <section class:failed={syncStatus.state === 'failed'} class="compact-filter-progress" aria-live="polite">
      <div><strong>{syncStatus.state === 'connecting' ? 'Connecting to filter peers' : syncStatus.state === 'checking_matches' ? 'Checking matching blocks' : syncStatus.state === 'applying' ? 'Saving verified wallet state' : syncStatus.state === 'failed' ? 'Compact-filter sync stopped' : 'Downloading and checking compact filters'}</strong><small>{syncStatus.state === 'failed' ? `Balance remains verified through block ${syncStatus.lastVerifiedHeight}. Retry when your connection is available.` : syncStatus.chainHeight !== null ? `Network height ${syncStatus.chainHeight.toLocaleString()} · verified wallet state stays unchanged until completion` : syncStatus.connectedPeers !== null && syncStatus.requiredPeers !== null ? `${syncStatus.connectedPeers} of ${syncStatus.requiredPeers} required peers connected` : 'Verified wallet state stays unchanged until the scan completes.'}</small></div>
      {#if syncStatus.progressPercent !== null && syncStatus.state !== 'failed'}<progress max="100" value={syncStatus.progressPercent} aria-label="Compact-filter download progress">{syncStatus.progressPercent}%</progress>{/if}
    </section>
  {/if}
  {#if selectedProfile?.kind === 'single_key' && !selectedProfile.backupVerified}
    <section class="backup-verification-banner" aria-label="Recovery backup status"><ShieldCheck size={18}/><span><strong>Recovery backup not verified</strong><small>Confirm your written words so you know this wallet can be recovered.</small></span><Button size="small" variant="secondary" onclick={() => { verifyError=''; verifyOpen=true; }}>Verify now</Button></section>
  {/if}
  {#if loadError && !snapshot}
    <LoadFailure title="Wallet data is unavailable" description={loadError} onretry={loadSnapshot} />
  {:else if snapshot && !initialDataLoading}
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
  {#if activeProposal}
    <a class="active-proposal-callout" class:ready={activeProposal.canFinalize} href={proposalHref} aria-label={`Resume payment, ${proposalLabel}, ${proposalProgress}`}>
      <span class="active-proposal-icon"><Clock3 size={17}/></span>
      <span class="active-proposal-copy"><strong>{proposalTitle}</strong><small>{proposalLabel} · {proposalProgress}</small></span>
      <span class="active-proposal-action">Resume <ChevronRight size={15}/></span>
    </a>
  {/if}
  <div class="primary-actions">
    <MobileWalletSwitcher profiles={walletShell.profiles()} selectedWalletId={walletShell.selectedWalletId()} onselect={walletShell.selectWallet} />
    <div class="overview-more" bind:this={moreMenu}>
      <OverflowMenuButton bind:element={moreTrigger} label="More wallet actions" expanded={moreOpen} size="large" onclick={() => moreOpen = !moreOpen}/>
      {#if moreOpen}
        <div class="overview-more-menu" role="menu" aria-label="More wallet actions" transition:fly={{ y: 5, duration: 160 }}>
          <a href="/activity" role="menuitem" onclick={() => moreOpen = false}><Activity size={16} /><span><strong>Activity</strong><small>View all transactions</small></span></a>
          <a href="/coins" role="menuitem" onclick={() => moreOpen = false}><CircleDot size={16} /><span><strong>Coins</strong><small>Inspect and choose UTXOs</small></span></a>
          {#if multisig}
            <a href="/multisig" role="menuitem" onclick={() => moreOpen = false}><ShieldCheck size={16} /><span><strong>Policy</strong><small>Keys, backups, and rules</small></span></a>
            <button role="menuitem" onclick={() => { moreOpen = false; showDescriptors = true; }}><Eye size={16}/><span><strong>Show descriptors</strong><small>Inspect receive and change logic</small></span></button>
            <a href="/multisig/backup" role="menuitem" onclick={() => moreOpen = false}><FileKey size={16}/><span><strong>Export & verify</strong><small>Save a public wallet backup</small></span></a>
          {/if}
        </div>
      {/if}
    </div>
    <a class="button secondary large overview-inline-primary" href={multisig ? '/multisig/receive' : '/receive'}><ArrowDownToLine size={18} />Receive</a>
    <a class="button default large overview-inline-primary" href={multisig ? '/multisig/send' : '/send'}><ArrowUpFromLine size={18} />Send</a>
  </div>
  <section class="section-block">
    <div class="section-heading"><div><h2>Recent activity</h2></div><a href="/activity">View all</a></div>
    {#if initialDataLoading}
      <TxList items={[]} loading />
    {:else if recentTransactions.length}
      <TxList items={recentTransactions} onselect={(transaction) => selected = transaction} />
    {:else}
      <EmptyState compact title="No transactions yet" description="Received and sent transactions will appear here.">
        {#snippet icon()}<Activity size={22}/>{/snippet}
      </EmptyState>
    {/if}
  </section>
  {/if}
</div>

<TxDetailsModal transaction={selected} {multisig} onclose={() => selected = null} />
<MultisigDescriptorsModal open={showDescriptors} wallet={multisigWallet} onclose={() => showDescriptors=false}/>
<Modal open={verifyOpen} title="Verify recovery backup" description="Use your written 24 words to complete a private native challenge. Groot will not reveal them again." onclose={() => { verifyOpen=false; verifyCredential=''; verifyError=''; }}>
  <div class="warning-box"><strong>Have the written backup in front of you.</strong> Verification confirms its exact word order without sending the words into the webview.</div>
  <PasswordField label="Wallet passphrase" bind:value={verifyCredential} autocomplete="current-password" hint="Required to decrypt the recovery words only inside trusted Rust code."/>
  {#if verifyError}<p class="form-error" role="alert">{verifyError.replace('passphrase / PIN', 'wallet passphrase')}</p>{/if}
  <div class="modal-footer"><Button variant="secondary" onclick={() => { verifyOpen=false; verifyCredential=''; verifyError=''; }}>Cancel</Button><Button disabled={!verifyCredential} loading={verifying} loadingLabel="Opening verification…" onclick={verifyBackup}>Continue</Button></div>
</Modal>
