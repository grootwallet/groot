<script lang="ts">
  import { translate, localizedError } from '$lib/i18n-catalog';
  import {
    Activity,
    ArrowDownToLine,
    ArrowUpFromLine,
    ChevronRight,
    CircleDot,
    Clock3,
    Eye,
    EyeOff,
    FileKey,
    HeartPulse,
    RefreshCw,
    ShieldCheck
  } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import TxList from '$lib/components/TxList.svelte';
  import TxDetailsModal from '$lib/components/TxDetailsModal.svelte';
  import DeviceDetailsModal from '$lib/components/DeviceDetailsModal.svelte';
  import Amount from '$lib/components/Amount.svelte';
  import { amountUnit, denomination, formatAmount, setDenomination } from '$lib/denomination';
  import { formatInteger, locale } from '$lib/i18n';
  import { toast } from '$lib/stores/toasts';
  import {
    walletService,
    WalletError,
    type CosignerHealthCheck,
    type ExternalSignerWallet,
    type MultisigProposal,
    type MultisigWallet,
    type PaymentProposal,
    type RecoveryScanSettings,
    type RecoveryScanStatus,
    type WalletProfile,
    type WalletSnapshot,
    type WalletSyncSource,
    type WalletSyncStatus
  } from '$lib/wallet';
  import type { CosignerDraft } from '$lib/multisig/policy';
  import { matchingDeviceForHealthCheck } from '$lib/hardware/health-check';
  import {
    hardwareHealthChecks,
    hardwareHealthKey,
    recordHardwareHealthCheck,
    setHardwareHealthChecks
  } from '$lib/hardware/health-check-state';
  import { latestActiveProposal } from '$lib/wallet/proposal-resume';
  import type { PaymentDraft } from '$lib/wallet/payment-draft';
  import { pendingBalanceBreakdown, sortTransactionsNewestFirst } from '$lib/wallet/presentation';
  import { policyMaturitySummary } from '$lib/wallet/policy';
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { Transaction } from '$lib/types';
  import { discreetMode, setDiscreetMode } from '$lib/privacy';
  import MobileWalletSwitcher from '$lib/components/MobileWalletSwitcher.svelte';
  import OverflowMenuButton from '$lib/components/OverflowMenuButton.svelte';
  import WalletSkeleton from '$lib/components/WalletSkeleton.svelte';
  import LoadFailure from '$lib/components/LoadFailure.svelte';
  import PermanentLabelTags from '$lib/components/PermanentLabelTags.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import MultisigDescriptorsModal from '$lib/components/MultisigDescriptorsModal.svelte';
  import { useWalletShellContext } from '$lib/wallet/shell-context';
  import { fly } from 'svelte/transition';
  import { presentLocalTimestamp, syncAge } from '$lib/date-time';
  const walletShell = useWalletShellContext();
  let syncing = $state(false);
  let snapshot = $state<WalletSnapshot | null>(null);
  let multisigWallet = $state<MultisigWallet | null>(null);
  let hardwareSignerWallet = $state<ExternalSignerWallet | null>(null);
  let signerDetailsOpen = $state(false);
  let checkingSignerHealth = $state(false);
  let activeProposal = $state<MultisigProposal | PaymentProposal | null>(null);
  let activeDraft = $state<PaymentDraft | null>(null);
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
  let revealingBackup = $state(false);
  let initialDataLoading = $state(true);
  let syncSource = $state<WalletSyncSource | null>(null);
  let syncStatus = $state<WalletSyncStatus | null>(null);
  let syncPollToken = 0;
  let inheritedSyncObserved = false;
  let syncClock = $state(Date.now());
  let recoverySettings = $state<RecoveryScanSettings>({ birthdayHeight: 0, gapLimit: 20 });
  let recoveryStatus = $state<RecoveryScanStatus>({
    status: 'idle',
    birthdayHeight: 0,
    gapLimit: 20,
    currentHeight: 0,
    targetHeight: 0,
    processedBlocks: 0,
    totalBlocks: 0,
    startedAt: 0,
    updatedAt: 0
  });
  let recoveryPollToken = 0;
  let initialScanOpen = $state(false);
  let initialScanMode = $state<'new' | 'birthday' | 'full' | null>(null);
  let initialBirthdayHeight = $state(0);
  let initialGapLimit = $state(20);
  let initialScanCredential = $state('');
  let initialScanError = $state('');
  let initialScanStarting = $state(false);
  const recoveryScanIsActive = (status: RecoveryScanStatus) =>
    ['running', 'cancelling'].includes(status.status);
  let recoveryPercent = $derived(
    recoveryStatus.totalBlocks > 0
      ? Math.min(
          100,
          Math.round((recoveryStatus.processedBlocks / recoveryStatus.totalBlocks) * 100)
        )
      : 0
  );
  let initialHistoryRequired = $derived(
    syncSource?.type === 'bitcoin_core' && Boolean(snapshot) && !snapshot?.syncedAt
  );
  let savedRecoveryCanResume = $derived(
    initialHistoryRequired &&
      recoveryStatus.processedBlocks > 0 &&
      ['cancelled', 'interrupted', 'failed'].includes(recoveryStatus.status)
  );
  let scanCredentialLabel = $derived(
    selectedProfile?.kind === 'single_key'
      ? translate($locale, 'Wallet passphrase')
      : translate($locale, 'App PIN')
  );
  const syncStatusIsActive = (status: WalletSyncStatus | null) =>
    Boolean(
      status && ['connecting', 'syncing', 'checking_matches', 'applying'].includes(status.state)
    );
  let syncInProgress = $derived(syncing || syncStatusIsActive(syncStatus));
  let syncAgeValue = $derived(syncAge(snapshot?.syncedAt ?? null, syncClock));
  let syncButtonLabel = $derived.by(() => {
    if (initialHistoryRequired && !recoveryScanIsActive(recoveryStatus))
      return translate($locale, savedRecoveryCanResume ? 'Resume scan' : 'Choose scan');
    if (recoveryScanIsActive(recoveryStatus)) return `${recoveryPercent}%`;
    if (
      syncInProgress &&
      syncStatus?.progressPercent !== null &&
      syncStatus?.progressPercent !== undefined
    )
      return `${syncStatus.progressPercent}%`;
    if (syncInProgress) return translate($locale, 'Syncing');
    if (syncAgeValue.unit === 'never') return translate($locale, 'Never synced');
    if (syncAgeValue.unit === 'now') return translate($locale, 'Updated now');
    if (syncAgeValue.unit === 'minute')
      return translate($locale, 'Updated {count} min ago', { count: syncAgeValue.value });
    if (syncAgeValue.unit === 'hour')
      return translate($locale, 'Updated {count} h ago', { count: syncAgeValue.value });
    return translate($locale, 'Updated {count} d ago', { count: syncAgeValue.value });
  });
  let syncButtonTitle = $derived(
    snapshot?.syncedAt
      ? presentLocalTimestamp(snapshot.syncedAt).detail
      : translate($locale, 'This wallet has not completed a sync yet.')
  );
  let hardwareSignerDetails = $derived.by<CosignerDraft | null>(() =>
    hardwareSignerWallet
      ? {
          id: `external-${hardwareSignerWallet.signer.fingerprint.toLowerCase()}`,
          ...hardwareSignerWallet.signer,
          source: hardwareSignerWallet.signer.source
        }
      : null
  );
  let signerHealth = $derived(
    hardwareSignerWallet
      ? ($hardwareHealthChecks[hardwareHealthKey(hardwareSignerWallet.signer.fingerprint)] ?? null)
      : null
  );
  const pendingBreakdown = $derived(
    snapshot ? pendingBalanceBreakdown(snapshot) : { incoming: 0, change: 0, outgoing: 0 }
  );
  const maturitySummary = $derived(
    snapshot ? policyMaturitySummary(snapshot.utxos, snapshot.chainTip) : null
  );
  const pendingDescription = $derived(
    [
      pendingBreakdown.incoming
        ? translate($locale, '{amount} {unit} awaiting confirmation', {
            amount: formatAmount(pendingBreakdown.incoming, $denomination),
            unit: amountUnit($denomination)
          })
        : '',
      pendingBreakdown.change
        ? translate($locale, '{amount} {unit} unconfirmed change', {
            amount: formatAmount(pendingBreakdown.change, $denomination),
            unit: amountUnit($denomination)
          })
        : '',
      pendingBreakdown.outgoing
        ? translate($locale, '{amount} {unit} outgoing', {
            amount: formatAmount(pendingBreakdown.outgoing, $denomination),
            unit: amountUnit($denomination)
          })
        : ''
    ]
      .filter(Boolean)
      .join(' · ') || translate($locale, '0 {unit} pending', { unit: amountUnit($denomination) })
  );
  const recentTransactions = $derived(
    sortTransactionsNewestFirst(snapshot?.transactions ?? []).slice(0, 3)
  );
  const proposalHref = $derived(
    activeProposal
      ? `${multisig ? '/multisig/send' : '/send'}?proposal=${encodeURIComponent(activeProposal.proposalId)}`
      : multisig
        ? '/multisig/send'
        : '/send'
  );
  const proposalCanFinalize = $derived(
    Boolean(activeProposal && 'canFinalize' in activeProposal && activeProposal.canFinalize)
  );
  const proposalTitle = $derived(
    translate(
      $locale,
      activeProposal && !('canFinalize' in activeProposal)
        ? 'Payment ready to sign'
        : proposalCanFinalize
          ? 'Payment ready to broadcast'
          : 'Signing in progress'
    )
  );
  const proposalProgress = $derived(
    activeProposal
      ? 'signed' in activeProposal
        ? translate($locale, '{signed} of {required} signatures collected', {
            signed: activeProposal.signed,
            required: activeProposal.required
          })
        : translate($locale, '{signed} of {required} signatures collected', {
            signed: 0,
            required: 1
          })
      : ''
  );
  const proposalLabel = $derived(
    activeProposal ? ($discreetMode ? 'Label hidden' : activeProposal.label) : ''
  );
  onMount(loadSnapshot);

  onDestroy(() => {
    verifyCredential = '';
  });
  onDestroy(() => {
    initialScanCredential = '';
    ++recoveryPollToken;
  });
  onMount(() => {
    syncClock = Date.now();
    const clock = window.setInterval(() => (syncClock = Date.now()), 30_000);
    void (async () => {
      const status = await refreshSyncStatus();
      if (syncStatusIsActive(status)) startSyncStatusPolling();
    })();
    return () => {
      window.clearInterval(clock);
      ++syncPollToken;
    };
  });
  async function loadSnapshot() {
    loadError = '';
    initialDataLoading = true;
    try {
      const shellWallets = walletShell.profiles();
      const shellSelectedWalletId = walletShell.selectedWalletId();
      if (!shellWallets.length || !shellSelectedWalletId) {
        if (!(await walletService.exists())) {
          await goto('/welcome');
          return;
        }
      }
      const [registry, nextSyncSource] = await Promise.all([
        shellWallets.length && shellSelectedWalletId
          ? Promise.resolve({ wallets: shellWallets, selectedWalletId: shellSelectedWalletId })
          : walletService.profiles(),
        walletService.syncSource()
      ]);
      syncSource = nextSyncSource;
      selectedProfile =
        registry.wallets.find((wallet) => wallet.id === registry.selectedWalletId) ?? null;
      activeDraft = selectedProfile ? await walletService.paymentDraft() : null;
      multisig = selectedProfile?.kind === 'multisig';
      if (multisig) {
        const [nextSnapshot, nextWallet, proposals] = await Promise.all([
          walletService.multisigSnapshot(),
          walletService.multisigWallet(),
          walletService.multisigProposals()
        ]);
        snapshot = nextSnapshot;
        multisigWallet = nextWallet;
        hardwareSignerWallet = null;
        setHardwareHealthChecks([]);
        activeProposal = latestActiveProposal(proposals);
      } else {
        multisigWallet = null;
        const [nextSnapshot, proposals, nextHardwareSignerWallet, nextHealthChecks] =
          await Promise.all([
            walletService.snapshot(),
            selectedProfile?.kind === 'watch_only'
              ? walletService.externalSignerProposals()
              : walletService.paymentProposals(),
            selectedProfile?.kind === 'watch_only'
              ? walletService.externalSignerWallet()
              : Promise.resolve(null),
            selectedProfile?.kind === 'watch_only'
              ? walletService.hardwareHealthChecks()
              : Promise.resolve([])
          ]);
        snapshot = nextSnapshot;
        hardwareSignerWallet = nextHardwareSignerWallet;
        setHardwareHealthChecks(nextHealthChecks);
        activeProposal =
          selectedProfile?.kind === 'watch_only'
            ? latestActiveProposal(proposals as MultisigProposal[])
            : ((proposals as PaymentProposal[])[0] ?? null);
      }
      if (activeProposal) activeDraft = null;
      initialDataLoading = false;
      if (syncSource.type === 'bitcoin_core' && !snapshot?.syncedAt) {
        await loadRecoveryState();
      }
      if (syncSource.type === 'compact_filters' && !inheritedSyncObserved) void sync(false);
    } catch (cause) {
      if (cause instanceof WalletError && cause.code === 'wallet_locked') {
        await goto('/unlock');
        return;
      }
      loadError = localizedError(cause, $locale, 'The wallet data could not be read.');
      initialDataLoading = false;
      toast({ title: 'Could not open wallet', description: loadError, tone: 'danger' });
    }
  }
  onMount(() =>
    walletService.subscribe((event) => {
      if (event.type === 'wallet_updated' && event.walletId === walletShell.selectedWalletId()) {
        multisig = event.walletKind === 'multisig';
        snapshot = event.snapshot;
        loadError = '';
        initialDataLoading = false;
      }
    })
  );
  onMount(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (moreOpen && event.target instanceof Node && !moreMenu?.contains(event.target))
        moreOpen = false;
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
    try {
      syncStatus = await walletService.syncStatus();
      if (syncStatusIsActive(syncStatus)) inheritedSyncObserved = true;
      return syncStatus;
    } catch {
      /* The sync result remains authoritative. */
      return null;
    }
  }
  async function loadRecoveryState() {
    try {
      const [settings, status] = await Promise.all([
        walletService.recoveryScanSettings(),
        walletService.recoveryScanStatus()
      ]);
      recoverySettings = settings;
      recoveryStatus = status;
      initialBirthdayHeight = settings.birthdayHeight;
      initialGapLimit = settings.gapLimit;
      if (recoveryScanIsActive(status)) {
        startRecoveryStatusPolling();
      } else if (!snapshot?.syncedAt) {
        initialScanOpen = true;
      }
    } catch (cause) {
      initialScanError = localizedError(
        cause,
        $locale,
        'Could not read the saved recovery-scan state.'
      );
    }
  }
  async function refreshRecoveryStatus() {
    try {
      recoveryStatus = await walletService.recoveryScanStatus();
      return recoveryStatus;
    } catch {
      return null;
    }
  }
  async function pollRecoveryStatus(token: number) {
    while (token === recoveryPollToken) {
      const status = await refreshRecoveryStatus();
      if (!status || !recoveryScanIsActive(status)) {
        if (status?.status === 'completed') await loadSnapshot();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  function startRecoveryStatusPolling() {
    const token = ++recoveryPollToken;
    void pollRecoveryStatus(token);
  }
  function openInitialScan() {
    initialScanError = '';
    if (savedRecoveryCanResume) {
      initialScanMode = recoverySettings.birthdayHeight === 0 ? 'full' : 'birthday';
      initialBirthdayHeight = recoverySettings.birthdayHeight;
      initialGapLimit = recoverySettings.gapLimit;
    }
    initialScanOpen = true;
  }
  async function startInitialScan() {
    if (!initialScanMode && !savedRecoveryCanResume) return;
    initialScanStarting = true;
    initialScanError = '';
    const credential = initialScanCredential;
    try {
      if (!savedRecoveryCanResume) {
        let birthdayHeight = 0;
        if (initialScanMode === 'new') {
          const node = await walletService.testNodeConnection();
          birthdayHeight = node.blocks;
        } else if (initialScanMode === 'birthday') {
          birthdayHeight = Number(initialBirthdayHeight);
        }
        recoverySettings = await walletService.saveRecoveryScanSettings(
          birthdayHeight,
          Number(initialGapLimit),
          credential
        );
      }
      const scan = walletService.fullRescan(credential);
      initialScanCredential = '';
      initialScanOpen = false;
      await new Promise((resolve) => setTimeout(resolve, 150));
      await refreshRecoveryStatus();
      startRecoveryStatusPolling();
      snapshot = await scan;
      recoveryStatus = await walletService.recoveryScanStatus();
      toast({
        title: 'Wallet history verified',
        description: 'The saved balance and activity now reflect the completed scan.',
        tone: 'success'
      });
    } catch (cause) {
      if (cause instanceof WalletError && cause.code === 'wallet_locked') return;
      initialScanError = localizedError(cause, $locale, 'The wallet-history scan could not start.');
      initialScanOpen = true;
      await refreshRecoveryStatus();
    } finally {
      initialScanCredential = '';
      initialScanStarting = false;
    }
  }
  async function pollSyncStatus(token: number) {
    while (token === syncPollToken) {
      await refreshSyncStatus();
      if (!syncing && !syncStatusIsActive(syncStatus)) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  function startSyncStatusPolling() {
    const token = ++syncPollToken;
    void pollSyncStatus(token);
  }
  const sync = async (showToast = true) => {
    if (initialHistoryRequired) {
      openInitialScan();
      return;
    }
    if (syncInProgress) return;
    syncing = true;
    startSyncStatusPolling();
    try {
      const [nextSnapshot] = await Promise.all([
        multisig ? walletService.syncMultisig() : walletService.sync(),
        new Promise((resolve) => setTimeout(resolve, 1_200))
      ]);
      snapshot = nextSnapshot;
      if (showToast)
        toast({
          title: 'Wallet is up to date',
          description: 'Balance and transactions refreshed.',
          tone: 'success'
        });
    } catch (cause) {
      if (cause instanceof WalletError && cause.code === 'sync_cancelled') return;
      if (cause instanceof WalletError && cause.code === 'wallet_locked') {
        await goto('/unlock');
        return;
      }
      if (showToast)
        toast({
          title: 'Sync failed',
          description: localizedError(cause, $locale),
          tone: 'danger'
        });
    } finally {
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
        toast({
          title: 'Backup still unverified',
          description: 'You can return to verification whenever you are ready.'
        });
        return;
      }
      if (selectedProfile) selectedProfile = { ...selectedProfile, backupVerified: true };
      toast({
        title: 'Recovery backup verified',
        description: 'Your written words matched this wallet.',
        tone: 'success'
      });
    } catch (cause) {
      verifyError = localizedError(cause, $locale, 'Could not verify this recovery backup.');
    } finally {
      verifyCredential = '';
      verifying = false;
    }
  }
  async function revealAndVerifyBackup() {
    revealingBackup = true;
    verifyError = '';
    try {
      const verified = await walletService.revealAndVerifyBackup(verifyCredential);
      if (!verified) {
        toast({
          title: 'Backup still unverified',
          description: 'Your recovery words remain available to reveal again before verification.'
        });
        return;
      }
      verifyOpen = false;
      if (selectedProfile) selectedProfile = { ...selectedProfile, backupVerified: true };
      toast({
        title: 'Recovery backup verified',
        description: 'Your reconstructed word order matched this wallet.',
        tone: 'success'
      });
    } catch (cause) {
      verifyError = localizedError(cause, $locale, 'Could not reveal this recovery backup.');
    } finally {
      verifyCredential = '';
      revealingBackup = false;
    }
  }
  async function runExternalSignerHealthCheck() {
    if (!hardwareSignerWallet || !hardwareSignerDetails || checkingSignerHealth) return;
    const signer = hardwareSignerWallet.signer;
    checkingSignerHealth = true;
    try {
      if (!signer.deviceType)
        throw new WalletError(
          'hardware_unavailable',
          'This saved signer has no USB device type. Re-import its public account backup.'
        );
      const device = await walletService.findSavedHardwareDevice(signer);
      const result = await walletService.checkHardwareExternalSigner(signer, device.id);
      await saveHardwareHealthCheck(signer.fingerprint, result);
      toast({
        title: 'Signer verified',
        description: translate($locale, '{signerName} matches this wallet.', {
          signerName: signer.label
        }),
        tone: 'success'
      });
    } catch (cause) {
      const result: CosignerHealthCheck = {
        checkedAt: new Date().toISOString(),
        summary: localizedError(cause, $locale, 'The device could not be verified.'),
        status: 'attention'
      };
      await saveHardwareHealthCheck(signer.fingerprint, result);
      toast({ title: 'Health check needs attention', description: result.summary, tone: 'danger' });
    } finally {
      checkingSignerHealth = false;
    }
  }
  async function saveHardwareHealthCheck(fingerprint: string, check: CosignerHealthCheck) {
    recordHardwareHealthCheck(fingerprint, check);
  }
</script>

<div class="page dashboard-page">
  <header class="page-header">
    <div>
      <p class="eyebrow">{translate($locale, 'WALLET')}</p>
      <h1>{translate($locale, 'Overview')}</h1>
    </div>
    <button
      class="sync-button"
      disabled={syncInProgress || recoveryScanIsActive(recoveryStatus)}
      title={syncButtonTitle}
      onclick={() => (initialHistoryRequired ? openInitialScan() : sync(true))}
      ><RefreshCw
        size={15}
        class={syncInProgress || recoveryScanIsActive(recoveryStatus) ? 'spin' : ''}
      />{syncButtonLabel}</button
    >
  </header>
  {#if initialHistoryRequired}
    <section class="initial-history-scan" aria-live="polite">
      <div>
        <strong
          >{translate(
            $locale,
            recoveryScanIsActive(recoveryStatus)
              ? 'Scanning wallet history · {percent}%'
              : savedRecoveryCanResume
                ? 'Wallet-history scan paused'
                : 'Choose where wallet history begins',
            { percent: recoveryPercent }
          )}</strong
        ><small
          >{recoveryScanIsActive(recoveryStatus) || savedRecoveryCanResume
            ? translate(
                $locale,
                '{processed} of {total} blocks saved · progress continues across wallet locks',
                {
                  processed: formatInteger(recoveryStatus.processedBlocks, $locale),
                  total: formatInteger(recoveryStatus.totalBlocks, $locale)
                }
              )
            : translate(
                $locale,
                'A birthday makes the first scan faster. Full history always remains available.'
              )}</small
        >
      </div>
      {#if recoveryScanIsActive(recoveryStatus)}
        <progress
          max="100"
          value={recoveryPercent}
          aria-label={translate($locale, 'Recovery scan progress')}
        ></progress>
      {:else}
        <Button size="small" variant="secondary" onclick={openInitialScan}
          >{translate($locale, savedRecoveryCanResume ? 'Resume scan' : 'Choose scan')}</Button
        >
      {/if}
    </section>
  {/if}
  {#if syncStatus && (syncInProgress || syncStatus.state === 'failed')}
    <section class:failed={syncStatus.state === 'failed'} class="sync-progress" aria-live="polite">
      <div>
        <strong
          >{translate(
            $locale,
            syncStatus.source === 'bitcoin_core'
              ? syncStatus.state === 'failed'
                ? 'Wallet sync stopped'
                : 'Scanning Bitcoin Core history'
              : syncStatus.state === 'connecting'
                ? 'Connecting to filter peers'
                : syncStatus.state === 'checking_matches'
                  ? 'Checking matching blocks'
                  : syncStatus.state === 'applying'
                    ? 'Saving verified wallet state'
                    : syncStatus.state === 'failed'
                      ? 'Compact-filter sync stopped'
                      : 'Downloading and checking compact filters'
          )}</strong
        ><small
          >{syncStatus.state === 'failed'
            ? syncStatus.lastVerifiedHeight === 0 && !snapshot?.syncedAt
              ? translate(
                  $locale,
                  'No wallet history has been verified yet. Retry when your connection is available.'
                )
              : translate(
                  $locale,
                  'Balance remains verified through block {height}. Retry when your connection is available.',
                  {
                    height: formatInteger(syncStatus.lastVerifiedHeight, $locale)
                  }
                )
            : syncStatus.chainHeight !== null
              ? translate(
                  $locale,
                  'Network height {height} · verified wallet state stays unchanged until completion',
                  {
                    height: formatInteger(syncStatus.chainHeight, $locale)
                  }
                )
              : syncStatus.connectedPeers !== null && syncStatus.requiredPeers !== null
                ? translate($locale, '{connected} of {required} required peers connected', {
                    connected: syncStatus.connectedPeers,
                    required: syncStatus.requiredPeers
                  })
                : translate(
                    $locale,
                    'Verified wallet state stays unchanged until the scan completes.'
                  )}</small
        >
      </div>
      {#if syncStatus.progressPercent !== null && syncStatus.state !== 'failed'}<progress
          max="100"
          value={syncStatus.progressPercent}
          aria-label={translate(
            $locale,
            syncStatus.source === 'bitcoin_core'
              ? 'Wallet sync progress'
              : 'Compact-filter download progress'
          )}>{syncStatus.progressPercent}%</progress
        >{/if}
    </section>
  {/if}
  {#if selectedProfile?.kind === 'single_key' && !selectedProfile.backupVerified}
    <section
      class="backup-verification-banner"
      aria-label={translate($locale, 'Recovery backup status')}
    >
      <ShieldCheck size={18} /><span
        ><strong>{translate($locale, 'Recovery backup not verified')}</strong><small
          >{translate(
            $locale,
            'Confirm your written words so you know this wallet can be recovered.'
          )}</small
        ></span
      ><Button
        size="small"
        variant="secondary"
        onclick={() => {
          verifyError = '';
          verifyOpen = true;
        }}>{translate($locale, 'Verify now')}</Button
      >
    </section>
  {/if}
  {#if multisigWallet && maturitySummary}
    <section
      class="policy-maturity-banner"
      class:mature={maturitySummary.mature > 0}
      class:approaching={maturitySummary.mature === 0 && maturitySummary.approaching > 0}
      aria-live="polite"
    >
      <span class="policy-maturity-icon"><Clock3 size={18} /></span>
      <div>
        <strong
          >{translate(
            $locale,
            maturitySummary.mature > 0
              ? maturitySummary.mature === 1
                ? '1 coin can now be spent with the {key}'
                : '{count} coins can now be spent with the {key}'
              : maturitySummary.approaching > 0
                ? '{key} unlocks soon for {count} coins'
                : '{key} is still locked',
            {
              count:
                maturitySummary.mature > 0 ? maturitySummary.mature : maturitySummary.approaching,
              key: translate(
                $locale,
                maturitySummary.policyType === 'inheritance' ? 'Heir key' : 'Recovery key'
              )
            }
          )}</strong
        ><small
          >{maturitySummary.chainCurrent
            ? maturitySummary.nextRemainingBlocks !== null
              ? translate($locale, 'Next key change in {count} blocks · times are approximate', {
                  count: formatInteger(maturitySummary.nextRemainingBlocks, $locale)
                })
              : translate($locale, 'The extra key can spend every confirmed coin shown.')
            : translate(
                $locale,
                'Countdown paused until Groot verifies a recent chain tip. Saved coin states are shown as of the last sync.'
              )}</small
        ><small>{translate($locale, 'Your normal 2-of-3 keys still work for every coin.')}</small>
      </div>
      <Button size="small" variant="secondary" href="/coins"
        >{translate($locale, 'Review coins')}</Button
      >
    </section>
  {/if}
  {#if loadError && !snapshot}
    <LoadFailure
      title={translate($locale, 'Wallet data is unavailable')}
      description={loadError}
      onretry={loadSnapshot}
    />
  {:else if snapshot && !initialDataLoading}
    <section class="balance-card content-reveal">
      <div class="balance-top">
        <span>{translate($locale, 'Total balance')}</span><button
          class="ghost-icon"
          aria-label={translate(
            $locale,
            $discreetMode ? 'Show wallet amounts' : 'Hide wallet amounts'
          )}
          aria-pressed={$discreetMode}
          onclick={() => setDiscreetMode(!$discreetMode)}
          >{#if $discreetMode}<Eye size={17} />{:else}<EyeOff size={17} />{/if}</button
        >
      </div>
      {#if initialHistoryRequired}
        <div
          class="balance-value unverified-balance"
          aria-label={translate($locale, 'Unverified balance')}
        >
          <strong>—</strong><small>{translate($locale, 'Not verified yet')}</small>
        </div>
      {:else}
        <button
          class="balance-value"
          type="button"
          aria-label={translate(
            $locale,
            $denomination === 'btc' ? 'Show balance in sats' : 'Show balance in BTC'
          )}
          title={translate(
            $locale,
            $denomination === 'btc' ? 'Show balance in sats' : 'Show balance in BTC'
          )}
          onclick={() => setDenomination($denomination === 'btc' ? 'sats' : 'btc')}
        >
          <Amount value={snapshot?.balance.total ?? 0} hidden={$discreetMode} />
        </button>
      {/if}
      <div class="pending-line">
        <i></i>{translate(
          $locale,
          initialHistoryRequired
            ? 'Balance and activity remain unverified until the scan completes.'
            : $discreetMode
              ? 'Pending activity hidden'
              : pendingDescription
        )}
      </div>
    </section>
  {:else}
    <WalletSkeleton variant="balance" />
  {/if}
  {#if !loadError}
    {#if activeProposal}
      <a
        class="active-proposal-callout"
        class:ready={proposalCanFinalize}
        href={proposalHref}
        aria-label={translate($locale, 'Resume payment, {label}, {progress}', {
          label: proposalLabel,
          progress: proposalProgress
        })}
      >
        <span class="active-proposal-icon"><Clock3 size={17} /></span>
        <span class="active-proposal-copy"
          ><strong>{proposalTitle}</strong><span class="active-proposal-meta"
            ><PermanentLabelTags
              labels={activeProposal.labels ?? [activeProposal.label]}
              hidden={$discreetMode}
              prominent
            /><small>{proposalProgress}</small></span
          ></span
        >
        <span class="active-proposal-action"
          >{translate($locale, 'Resume')} <ChevronRight size={15} /></span
        >
      </a>
    {:else if activeDraft}
      <a
        class="active-proposal-callout"
        href={activeDraft.kind === 'multisig' ? '/multisig/send' : '/send'}
        aria-label={translate($locale, 'Resume payment draft, {label}', {
          label: $discreetMode ? 'Label hidden' : activeDraft.labels.join(', ')
        })}
      >
        <span class="active-proposal-icon"><Clock3 size={17} /></span>
        <span class="active-proposal-copy"
          ><strong>{translate($locale, 'Payment draft in progress')}</strong><span
            class="active-proposal-meta"
            ><PermanentLabelTags
              labels={activeDraft.labels}
              hidden={$discreetMode}
              prominent
            /><small>{translate($locale, 'Recipient and labels saved')}</small></span
          ></span
        >
        <span class="active-proposal-action"
          >{translate($locale, 'Resume')} <ChevronRight size={15} /></span
        >
      </a>
    {/if}
    <div class="primary-actions">
      <MobileWalletSwitcher
        profiles={walletShell.profiles()}
        selectedWalletId={walletShell.selectedWalletId()}
        onselect={walletShell.selectWallet}
      />
      <div class="overview-more" bind:this={moreMenu}>
        <OverflowMenuButton
          bind:element={moreTrigger}
          label={translate($locale, 'More wallet actions')}
          expanded={moreOpen}
          size="large"
          onclick={() => (moreOpen = !moreOpen)}
        />
        {#if moreOpen}
          <div
            class="overview-more-menu"
            role="menu"
            aria-label={translate($locale, 'More wallet actions')}
            transition:fly={{ y: 5, duration: 160 }}
          >
            <a href="/activity" role="menuitem" onclick={() => (moreOpen = false)}
              ><Activity size={16} /><span
                ><strong>{translate($locale, 'Activity')}</strong><small
                  >{translate($locale, 'View all transactions')}</small
                ></span
              ></a
            >
            <a href="/coins" role="menuitem" onclick={() => (moreOpen = false)}
              ><CircleDot size={16} /><span
                ><strong>{translate($locale, 'Coins')}</strong><small
                  >{translate($locale, 'Inspect and choose UTXOs')}</small
                ></span
              ></a
            >
            {#if hardwareSignerWallet}
              <button
                role="menuitem"
                onclick={() => {
                  moreOpen = false;
                  signerDetailsOpen = true;
                }}
                ><HeartPulse size={16} /><span
                  ><strong>{translate($locale, 'Health check')}</strong><small
                    >{translate($locale, 'Verify the connected signer identity')}</small
                  ></span
                ></button
              >
            {/if}
            {#if multisig}
              <a href="/multisig" role="menuitem" onclick={() => (moreOpen = false)}
                ><ShieldCheck size={16} /><span
                  ><strong>{translate($locale, 'Policy')}</strong><small
                    >{translate($locale, 'Keys, backups, and rules')}</small
                  ></span
                ></a
              >
              <button
                role="menuitem"
                onclick={() => {
                  moreOpen = false;
                  showDescriptors = true;
                }}
                ><Eye size={16} /><span
                  ><strong>{translate($locale, 'Show descriptors')}</strong><small
                    >{translate($locale, 'Inspect receive and change logic')}</small
                  ></span
                ></button
              >
              <a href="/multisig/backup" role="menuitem" onclick={() => (moreOpen = false)}
                ><FileKey size={16} /><span
                  ><strong>{translate($locale, 'Export & verify')}</strong><small
                    >{translate($locale, 'Save a public wallet backup')}</small
                  ></span
                ></a
              >
            {/if}
          </div>
        {/if}
      </div>
      <a
        class="button secondary large overview-inline-primary"
        href={multisig ? '/multisig/receive' : '/receive'}
        ><ArrowDownToLine size={18} />{translate($locale, 'Receive')}</a
      >
      <a
        class="button default large overview-inline-primary"
        href={multisig ? '/multisig/send' : '/send'}
        ><ArrowUpFromLine size={18} />{translate($locale, 'Send')}</a
      >
    </div>
    <section class="section-block">
      <div class="section-heading">
        <div><h2>{translate($locale, 'Recent activity')}</h2></div>
        <a href="/activity">{translate($locale, 'View all')}</a>
      </div>
      {#if initialDataLoading}
        <TxList items={[]} loading />
      {:else if initialHistoryRequired}
        <EmptyState
          compact
          title={translate($locale, 'Wallet history not verified')}
          description={translate(
            $locale,
            'Complete or resume the first scan before relying on activity.'
          )}
        >
          {#snippet icon()}<Activity size={22} />{/snippet}
        </EmptyState>
      {:else if recentTransactions.length}
        <TxList items={recentTransactions} onselect={(transaction) => (selected = transaction)} />
      {:else}
        <EmptyState
          compact
          title={translate($locale, 'No transactions yet')}
          description={translate($locale, 'Received and sent transactions will appear here.')}
        >
          {#snippet icon()}<Activity size={22} />{/snippet}
        </EmptyState>
      {/if}
    </section>
  {/if}
</div>

<TxDetailsModal transaction={selected} {multisig} onclose={() => (selected = null)} />
<DeviceDetailsModal
  signer={signerDetailsOpen ? hardwareSignerDetails : null}
  health={signerHealth}
  checking={checkingSignerHealth}
  onclose={() => (signerDetailsOpen = false)}
  oncheck={runExternalSignerHealthCheck}
/>
<MultisigDescriptorsModal
  open={showDescriptors}
  wallet={multisigWallet}
  onclose={() => (showDescriptors = false)}
/>
<Modal
  open={initialScanOpen}
  title={translate(
    $locale,
    savedRecoveryCanResume ? 'Resume wallet-history scan' : 'First wallet-history scan'
  )}
  description={translate(
    $locale,
    savedRecoveryCanResume
      ? 'Continue from the last safely saved block. Locking Groot will no longer stop this scan.'
      : 'Choose the earliest block Groot should inspect before relying on balance or activity.'
  )}
  onclose={() => {
    if (initialScanStarting) return;
    initialScanOpen = false;
    initialScanCredential = '';
    initialScanError = '';
  }}
>
  {#if savedRecoveryCanResume}
    <div class="scan-resume-summary" role="status">
      <strong
        >{translate($locale, 'Saved progress: {percent}%', { percent: recoveryPercent })}</strong
      >
      <span
        >{translate($locale, 'Birthday block {height} · gap limit {gap}', {
          height: formatInteger(recoverySettings.birthdayHeight, $locale),
          gap: formatInteger(recoverySettings.gapLimit, $locale)
        })}</span
      >
      <progress max="100" value={recoveryPercent}></progress>
    </div>
  {:else}
    <div
      class="initial-scan-options"
      role="radiogroup"
      aria-label={translate($locale, 'Wallet history start')}
    >
      <button
        type="button"
        role="radio"
        aria-checked={initialScanMode === 'new'}
        class:selected={initialScanMode === 'new'}
        onclick={() => (initialScanMode = 'new')}
      >
        <strong>{translate($locale, 'New wallet · no earlier activity')}</strong>
        <small
          >{translate(
            $locale,
            'Start at the current chain tip. Fastest, but it will not find older payments.'
          )}</small
        >
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={initialScanMode === 'birthday'}
        class:selected={initialScanMode === 'birthday'}
        onclick={() => (initialScanMode = 'birthday')}
      >
        <strong>{translate($locale, 'Existing wallet · use a birthday block')}</strong>
        <small
          >{translate(
            $locale,
            'Start before the wallet’s first payment. Earlier is safer; later is faster.'
          )}</small
        >
      </button>
      {#if initialScanMode === 'birthday'}
        <label class="field initial-scan-field"
          ><span>{translate($locale, 'Wallet birthday block')}</span><input
            type="number"
            min="0"
            step="1"
            bind:value={initialBirthdayHeight}
            disabled={initialScanStarting}
          /><small
            >{translate($locale, 'If uncertain, choose full history instead of guessing.')}</small
          ></label
        >
      {/if}
      <button
        type="button"
        role="radio"
        aria-checked={initialScanMode === 'full'}
        class:selected={initialScanMode === 'full'}
        onclick={() => (initialScanMode = 'full')}
      >
        <strong>{translate($locale, 'Full history · safest')}</strong>
        <small
          >{translate(
            $locale,
            'Scan from genesis. This can take tens of minutes on Testnet4.'
          )}</small
        >
      </button>
      <label class="field initial-scan-field"
        ><span>{translate($locale, 'Address gap limit')}</span><input
          type="number"
          min="20"
          max="1000"
          step="1"
          bind:value={initialGapLimit}
          disabled={initialScanStarting}
        /><small
          >{translate(
            $locale,
            '20 is standard. It controls address discovery, not block-scan speed.'
          )}</small
        ></label
      >
    </div>
  {/if}
  <PasswordField
    label={scanCredentialLabel}
    bind:value={initialScanCredential}
    autocomplete="current-password"
    disabled={initialScanStarting}
    hint={translate($locale, 'Used only to authenticate this saved recovery operation.')}
  />
  {#if initialScanError}<p class="form-error" role="alert">{initialScanError}</p>{/if}
  <div class="modal-footer">
    <Button
      variant="secondary"
      disabled={initialScanStarting}
      onclick={() => {
        initialScanOpen = false;
        initialScanCredential = '';
      }}>{translate($locale, 'Not now')}</Button
    ><Button
      disabled={!initialScanCredential ||
        (!savedRecoveryCanResume && !initialScanMode) ||
        (!savedRecoveryCanResume &&
          initialScanMode === 'birthday' &&
          (!Number.isInteger(Number(initialBirthdayHeight)) ||
            Number(initialBirthdayHeight) < 0)) ||
        (!savedRecoveryCanResume &&
          (!Number.isInteger(Number(initialGapLimit)) ||
            Number(initialGapLimit) < 20 ||
            Number(initialGapLimit) > 1000))}
      loading={initialScanStarting}
      loadingLabel={translate($locale, savedRecoveryCanResume ? 'Resuming…' : 'Starting scan…')}
      onclick={startInitialScan}
      >{translate($locale, savedRecoveryCanResume ? 'Resume scan' : 'Start scan')}</Button
    >
  </div>
</Modal>
<Modal
  open={verifyOpen}
  title={translate($locale, 'Verify recovery backup')}
  description={translate(
    $locale,
    'Use your written 24 words for a private native proof, or reveal them securely first if you still need to make the backup.'
  )}
  onclose={() => {
    verifyOpen = false;
    verifyCredential = '';
    verifyError = '';
  }}
>
  <div class="warning-box verify-backup-warning">
    <strong>{translate($locale, 'Recovery words stay inside the trusted native window.')}</strong>
    {translate($locale, 'Revealing or verifying them\n    never sends the words into the webview.')}
  </div>
  <PasswordField
    label={translate($locale, 'Wallet passphrase')}
    bind:value={verifyCredential}
    autocomplete="current-password"
    hint={translate(
      $locale,
      'Required to decrypt the recovery words only inside trusted Rust code.'
    )}
  />
  {#if verifyError}<p class="form-error" role="alert">
      {verifyError.replace('passphrase / PIN', 'wallet passphrase')}
    </p>{/if}
  <div class="modal-footer verify-backup-actions">
    <Button
      class="show-words-action"
      variant="secondary"
      disabled={!verifyCredential || verifying || revealingBackup}
      loading={revealingBackup}
      loadingLabel={translate($locale, 'Opening recovery words…')}
      onclick={revealAndVerifyBackup}>{translate($locale, 'View recovery words first')}</Button
    >
    <Button
      variant="secondary"
      disabled={verifying || revealingBackup}
      onclick={() => {
        verifyOpen = false;
        verifyCredential = '';
        verifyError = '';
      }}>{translate($locale, 'Cancel')}</Button
    ><Button
      disabled={!verifyCredential || revealingBackup}
      loading={verifying}
      loadingLabel={translate($locale, 'Opening verification…')}
      onclick={verifyBackup}>{translate($locale, 'Continue')}</Button
    >
  </div>
</Modal>
