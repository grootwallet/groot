<script lang="ts">
  import { requiresMobileNodeSetup } from '$lib/wallet/network-readiness';
  import { translate, localizedError } from '$lib/i18n-catalog';
  import { defaultConfig } from '$lib/config';
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
    Network,
    RefreshCw,
    ShieldCheck,
    Smartphone,
    TriangleAlert,
    Trash2
  } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import WarningNotice from '$lib/components/WarningNotice.svelte';
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
    type WalletErrorDetails,
    type CosignerHealthCheck,
    type CoreNodeConfig,
    type ExternalSignerWallet,
    type MultisigProposal,
    type MultisigWallet,
    type PaymentProposal,
    type RecoveryScanSettings,
    type RecoveryScanStatus,
    type WalletOverview,
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
  import { latestActiveProposal, proposalInputsUnavailable } from '$lib/wallet/proposal-resume';
  import type { PaymentDraft } from '$lib/wallet/payment-draft';
  import {
    pendingBalanceBreakdown,
    sortTransactionsNewestFirst,
    transactionForSelection
  } from '$lib/wallet/presentation';
  import { policyMaturitySummary } from '$lib/wallet/policy';
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
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
  const isMainnet = defaultConfig.network === 'mainnet';
  let syncing = $state(false);
  let syncError = $state('');
  let manualSyncDetailsVisible = $state(false);
  let snapshot = $state<WalletSnapshot | import('$lib/wallet/contracts').WalletOverview | null>(
    null
  );
  let loadGeneration = 0;
  let secondaryError = $state('');
  let multisigWallet = $state<MultisigWallet | null>(null);
  let hardwareSignerWallet = $state<ExternalSignerWallet | null>(null);
  let signerDetailsOpen = $state(false);
  let checkingSignerHealth = $state(false);
  let activeProposal = $state<MultisigProposal | PaymentProposal | null>(null);
  let activeDraft = $state<PaymentDraft | null>(null);
  let pendingMobilePairingCount = $state(0);
  let discardDraftOpen = $state(false);
  let discardingDraft = $state(false);
  let discardDraftError = $state('');
  let selectedTransactionId = $state<string | null>(null);
  let selected = $derived(
    transactionForSelection(snapshot?.transactions ?? [], selectedTransactionId)
  );
  let multisig = $state(false);
  let moreOpen = $state(false);
  let moreMenu = $state<HTMLDivElement | null>(null);
  let moreTrigger = $state<HTMLButtonElement | null>(null);
  let showDescriptors = $state(false);
  let loadError = $state('');
  let loadErrorCode = $state('');
  let networkSetupRequired = $state(false);
  let selectedProfile = $state<WalletProfile | null>(null);
  let phoneBackupUnverified = $state(false);
  let verifyOpen = $state(false);
  let verifyCredential = $state('');
  let verifyError = $state('');
  let verifying = $state(false);
  let revealingBackup = $state(false);
  let initialDataLoading = $state(true);
  let syncSource = $state<WalletSyncSource | null>(null);
  let syncStatus = $state<WalletSyncStatus | null>(null);
  let mobileRuntime = $state(false);
  let nodeConfig = $state<CoreNodeConfig | null>(null);
  let syncPollToken = 0;
  let syncStatusReadGeneration = 0;
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
  let initialScanError = $state('');
  let initialScanErrorCode = $state('');
  let initialScanErrorDetails = $state<WalletErrorDetails | null>(null);
  let nodeReady = $state(false);
  let automaticInitialScanPending = $state(false);

  const recoveryScanIsActive = (status: RecoveryScanStatus) =>
    ['running', 'cancelling'].includes(status.status);
  let recoveryPercent = $derived(
    recoveryStatus.totalBlocks > 0
      ? Math.min(
          recoveryScanIsActive(recoveryStatus) ? 99 : 100,
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
      ['interrupted', 'failed'].includes(recoveryStatus.status)
  );
  let walletAwaitingAutomaticScan = $derived(
    page.url.searchParams.has('initial') &&
      automaticInitialScanPending &&
      initialHistoryRequired &&
      !recoveryScanIsActive(recoveryStatus) &&
      !savedRecoveryCanResume
  );
  let automaticInitialScanActive = $derived(recoveryScanIsActive(recoveryStatus));
  let scanCredentialLabel = $derived(
    selectedProfile?.kind === 'single_key'
      ? translate($locale, 'Wallet passphrase')
      : translate($locale, 'App PIN')
  );
  const syncStatusIsActive = (status: WalletSyncStatus | null) =>
    Boolean(
      status &&
      ['connecting', 'syncing', 'checking_pending', 'checking_matches', 'applying'].includes(
        status.state
      )
    );
  let syncCheckingPending = $derived(syncStatus?.state === 'checking_pending');
  const syncFailureDescription = (status: WalletSyncStatus) => {
    if (status.lastVerifiedHeight === 0 && !snapshot?.syncedAt) {
      return translate(
        $locale,
        'No wallet history has been verified yet. Retry when your connection is available.'
      );
    }
    const height = formatInteger(status.lastVerifiedHeight, $locale);
    if (status.failureCode === 'invalid_node_config') {
      return translate(
        $locale,
        'Bitcoin Core is reachable, but its RPC user cannot run every wallet-sync method. Balance remains verified through block {height}.',
        { height }
      );
    }
    if (status.failureCode === 'node_syncing') {
      return translate(
        $locale,
        'Bitcoin Core is still syncing and has not reached this wallet’s last verified block. Balance remains verified through block {height}.',
        { height }
      );
    }
    if (status.failureCode === 'node_history_unavailable') {
      return translate(
        $locale,
        'Bitcoin Core no longer stores the blocks needed after this wallet’s checkpoint. Balance remains verified through block {height}.',
        { height }
      );
    }
    if (status.failureCode === 'internal_error') {
      return translate(
        $locale,
        'Groot could not reconcile or save the refreshed wallet state. Balance remains verified through block {height}.',
        { height }
      );
    }
    return translate(
      $locale,
      'Balance remains verified through block {height}. Retry when your connection is available.',
      { height }
    );
  };
  let syncInProgress = $derived(syncing || syncStatusIsActive(syncStatus));
  let syncAgeValue = $derived(syncAge(snapshot?.syncedAt ?? null, syncClock));
  let syncButtonLabel = $derived.by(() => {
    if (initialDataLoading) return translate($locale, isMainnet ? 'Checking node…' : 'Loading…');
    if (automaticInitialScanPending || walletAwaitingAutomaticScan)
      return translate($locale, 'Syncing');
    if (loadErrorCode === 'network_unavailable') return translate($locale, 'Node unavailable');
    if (loadError && !snapshot) return translate($locale, 'Sync unavailable');
    if (initialHistoryRequired && !nodeReady && !recoveryScanIsActive(recoveryStatus))
      return translate($locale, 'Connect Bitcoin Core');
    if (initialHistoryRequired && !recoveryScanIsActive(recoveryStatus))
      return translate($locale, savedRecoveryCanResume ? 'Resume scan' : 'Scan settings');
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
    loadError ||
      (snapshot?.syncedAt
        ? presentLocalTimestamp(snapshot.syncedAt).detail
        : translate($locale, 'This wallet has not completed a sync yet.'))
  );
  const mobileSyncSetupRequired = $derived(
    mobileRuntime &&
      (syncSource?.type === 'compact_filters' ||
        (syncSource?.type === 'bitcoin_core' && requiresMobileNodeSetup(nodeConfig)))
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
  const activeProposalInputsUnavailable = $derived(
    Boolean(
      multisig &&
      activeProposal &&
      'canFinalize' in activeProposal &&
      proposalInputsUnavailable(activeProposal)
    )
  );
  const proposalTitle = $derived(
    translate(
      $locale,
      activeProposalInputsUnavailable
        ? 'Payment inputs unavailable'
        : activeProposal && !('canFinalize' in activeProposal)
          ? 'Payment ready to sign'
          : proposalCanFinalize
            ? 'Payment ready to broadcast'
            : 'Signing in progress'
    )
  );
  const proposalProgress = $derived(
    activeProposalInputsUnavailable
      ? translate($locale, 'Sync and cancel this payment; its coins were spent elsewhere.')
      : activeProposal
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
    ++loadGeneration;
    ++syncStatusReadGeneration;
  });
  onDestroy(() => {
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
    const generation = ++loadGeneration;
    let unlockSyncRequested = false;
    let admissionRestored = false;
    loadError = '';
    loadErrorCode = '';
    networkSetupRequired = false;
    initialDataLoading = true;
    try {
      const pendingPairingsPromise = walletService.pendingMobilePairings().catch(() => []);
      // Profile-mutating routes refresh the shell after navigation. Read the
      // authoritative registry here so this route cannot race that refresh and
      // query the newly selected wallet using the previous wallet's kind.
      const registry = await walletService.profiles();
      if (generation !== loadGeneration) return;
      if (!registry.wallets.length || !registry.selectedWalletId) {
        if (!(await walletService.exists())) {
          await goto('/welcome');
          return;
        }
      }
      const [nextSyncSource, runtime, networkSetupSources] = await Promise.all([
        walletService.syncSource(),
        walletService.runtimePlatform(),
        walletService.networkSetupSources()
      ]);
      if (generation !== loadGeneration) return;
      pendingMobilePairingCount = (await pendingPairingsPromise).length;
      syncSource = nextSyncSource;
      mobileRuntime = runtime.mobile && runtime.platform !== 'browser';
      nodeConfig = null;
      selectedProfile =
        registry.wallets.find((wallet) => wallet.id === registry.selectedWalletId) ?? null;
      // Set the command family before any network preflight can fail. Otherwise
      // a retry after an offline preflight uses the single-key command for a
      // selected multisig wallet and returns `wrong_wallet_kind`.
      multisig = selectedProfile?.kind === 'multisig';
      phoneBackupUnverified = Boolean(
        multisig &&
        !selectedProfile?.backupVerified &&
        (await walletService.coordinationStatus()).role === 'mobile_cosigner'
      );
      unlockSyncRequested = Boolean(
        selectedProfile && walletShell.consumeUnlockSync(selectedProfile.id)
      );
      nodeReady = Boolean(
        selectedProfile &&
        networkSetupSources.some(
          (source) => source.walletId === selectedProfile?.id && source.ready
        )
      );
      // Mainnet admission is required once after unlock, not whenever the user
      // returns to Overview. The admitted wallet session remains authoritative.
      if (isMainnet && nodeReady && unlockSyncRequested) await walletService.testNodeConnection();
      if (generation !== loadGeneration) return;
      if (!selectedProfile)
        throw new WalletError('wallet_not_found', 'The selected wallet does not exist.');
      let nextSnapshot: WalletOverview;
      try {
        nextSnapshot = await walletService.overview(selectedProfile.id);
      } catch (cause) {
        // The shell's unlock-sync handoff is deliberately ephemeral. If route
        // timing consumes or misses that hint, recover the native Mainnet
        // admission once instead of presenting a configured wallet as though
        // it had no Bitcoin Core connection.
        if (!(
          isMainnet &&
          nodeReady &&
          cause instanceof WalletError &&
          cause.code === 'node_admission_required'
        ))
          throw cause;
        await walletService.testNodeConnection();
        admissionRestored = true;
        nextSnapshot = await walletService.overview(selectedProfile.id);
      }
      if (generation !== loadGeneration) return;
      automaticInitialScanPending = false;
      snapshot = nextSnapshot;
      initialDataLoading = false;
      void loadSecondaryDetails(generation);
      if (syncSource.type === 'bitcoin_core' && !snapshot?.syncedAt) {
        await loadRecoveryState();
      }
      if ((unlockSyncRequested || admissionRestored) && !inheritedSyncObserved) void sync(false);
    } catch (cause) {
      if (generation !== loadGeneration) return;
      if (unlockSyncRequested && selectedProfile) walletShell.requestUnlockSync(selectedProfile.id);
      if (cause instanceof WalletError && cause.code === 'wallet_locked') {
        await goto('/unlock');
        return;
      }
      loadErrorCode = cause instanceof WalletError ? cause.code : 'internal_error';
      networkSetupRequired =
        cause instanceof WalletError &&
        ['invalid_node_config', 'node_admission_required', 'wallet_corrupt'].includes(cause.code);
      nodeReady = false;
      loadError =
        loadErrorCode === 'network_unavailable'
          ? translate(
              $locale,
              'The saved Bitcoin Core node is unreachable. Check that it is running and reachable, then try again.'
            )
          : networkSetupRequired
            ? 'Connect this wallet to Bitcoin Core in Settings to load network data.'
            : localizedError(cause, $locale, 'The wallet data could not be read.');
      initialDataLoading = false;
      toast({
        title:
          loadErrorCode === 'network_unavailable'
            ? 'Node unavailable'
            : networkSetupRequired
              ? 'Connect Bitcoin Core'
              : 'Could not open wallet',
        description: loadError,
        tone: networkSetupRequired ? 'default' : 'danger'
      });
    }
  }

  async function openNetworkSetup() {
    await goto('/settings?networkSetup=1');
  }

  async function loadSecondaryDetails(generation = loadGeneration) {
    const profile = selectedProfile;
    if (!profile) return;
    secondaryError = '';
    const current = () =>
      generation === loadGeneration && profile.id === walletShell.selectedWalletId();
    const results = await Promise.allSettled([
      // Connection hints must not block cached wallet data or the separate
      // fail-closed wallet-history privacy disclosure.
      (mobileRuntime ? walletService.nodeConfig() : Promise.resolve(null)).then((config) => {
        if (current()) nodeConfig = config;
      }),
      Promise.all([
        walletService.paymentDraft(),
        profile.kind === 'multisig'
          ? walletService.multisigProposals()
          : profile.kind === 'watch_only'
            ? walletService.externalSignerProposals()
            : walletService.paymentProposals()
      ]).then(([draft, proposals]) => {
        if (!current()) return;
        activeProposal =
          profile.kind === 'single_key'
            ? ((proposals as PaymentProposal[])[0] ?? null)
            : latestActiveProposal(proposals as MultisigProposal[]);
        activeDraft = activeProposal ? null : draft;
      }),
      (profile.kind === 'multisig' ? walletService.multisigWallet() : Promise.resolve(null)).then(
        (value) => {
          if (current()) multisigWallet = value;
        }
      ),
      (profile.kind === 'watch_only'
        ? walletService.externalSignerWallet()
        : Promise.resolve(null)
      ).then((value) => {
        if (current()) hardwareSignerWallet = value;
      }),
      (profile.kind === 'watch_only'
        ? walletService.hardwareHealthChecks()
        : Promise.resolve([])
      ).then((value) => {
        if (current()) setHardwareHealthChecks(value);
      })
    ]);
    if (!current()) return;
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') {
      if (failure.reason instanceof WalletError && failure.reason.code === 'wallet_locked') {
        await goto('/unlock');
        return;
      }
      secondaryError = localizedError(
        failure.reason,
        $locale,
        'The wallet data could not be read.'
      );
      toast({ title: 'Could not load wallet', description: secondaryError, tone: 'danger' });
    }
  }

  async function confirmDiscardPaymentDraft() {
    if (!activeDraft || discardingDraft) return;
    discardingDraft = true;
    discardDraftError = '';
    try {
      await walletService.clearPaymentDraft();
      activeDraft = null;
      discardDraftOpen = false;
      toast({
        title: translate($locale, 'Payment draft discarded'),
        description: translate(
          $locale,
          'The unfinished payment was removed. No transaction was created.'
        ),
        tone: 'success'
      });
    } catch (cause) {
      discardDraftError = localizedError(
        cause,
        $locale,
        'The payment draft could not be discarded.'
      );
    } finally {
      discardingDraft = false;
    }
  }
  onMount(() =>
    walletService.subscribe((event) => {
      if (event.type === 'wallet_updated' && event.walletId === walletShell.selectedWalletId()) {
        multisig = event.walletKind === 'multisig';
        snapshot = event.snapshot;
        loadError = '';
        loadErrorCode = '';
        syncError = '';
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
    const generation = ++syncStatusReadGeneration;
    try {
      const nextStatus = await walletService.syncStatus();
      if (generation !== syncStatusReadGeneration) return syncStatus;
      syncStatus = nextStatus;
      if (syncStatusIsActive(nextStatus)) inheritedSyncObserved = true;
      return nextStatus;
    } catch {
      if (generation !== syncStatusReadGeneration) return syncStatus;
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
      if (recoveryScanIsActive(status)) {
        automaticInitialScanPending = false;
        startRecoveryStatusPolling();
      } else if (!snapshot?.syncedAt && nodeReady) {
        automaticInitialScanPending = false;
        walletShell.requestInitialHistoryApproval();
      }
    } catch (cause) {
      automaticInitialScanPending = false;
      initialScanError = localizedError(
        cause,
        $locale,
        'Could not read the saved recovery-scan state.'
      );
      initialScanErrorCode = cause instanceof WalletError ? cause.code : 'internal_error';
      initialScanErrorDetails = cause instanceof WalletError ? cause.details : null;
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
  async function pollRecoveryStatus(token: number, waitForAutomaticStart = false) {
    const startupDeadline = Date.now() + 10_000;
    while (token === recoveryPollToken) {
      const status = await refreshRecoveryStatus();
      if (!status || !recoveryScanIsActive(status)) {
        if (status?.status === 'completed') {
          await loadSnapshot();
        } else if (waitForAutomaticStart && Date.now() < startupDeadline) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          continue;
        }
        automaticInitialScanPending = false;
        return;
      }
      automaticInitialScanPending = false;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  function startRecoveryStatusPolling(waitForAutomaticStart = false) {
    const token = ++recoveryPollToken;
    void pollRecoveryStatus(token, waitForAutomaticStart);
  }
  function openInitialScan() {
    walletShell.requestInitialHistoryApproval(true);
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
  const sync = async (manual = true) => {
    if (mobileSyncSetupRequired) {
      if (manual) await goto('/settings#network-services');
      return;
    }
    if (manual && networkSetupRequired) {
      await openNetworkSetup();
      return;
    }
    if (manual && loadErrorCode === 'network_unavailable') {
      await loadSnapshot();
      return;
    }
    if (initialHistoryRequired) {
      if (!nodeReady) {
        await openNetworkSetup();
      } else {
        openInitialScan();
      }
      return;
    }
    if (syncInProgress) return;
    manualSyncDetailsVisible = manual;
    syncing = true;
    if (manual) syncError = '';
    try {
      if (manual) await walletShell.pauseAutomaticSync();
      startSyncStatusPolling();
      const [nextSnapshot] = await Promise.all([
        multisig ? walletService.syncMultisig() : walletService.sync(),
        new Promise((resolve) => setTimeout(resolve, 1_200))
      ]);
      snapshot = nextSnapshot;
      if (manual)
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
      const setupRequired =
        cause instanceof WalletError &&
        [
          'invalid_node_config',
          'network_unavailable',
          'node_admission_required',
          'wallet_corrupt'
        ].includes(cause.code);
      if (manual) {
        syncError = localizedError(cause, $locale);
        manualSyncDetailsVisible = false;
        toast({ title: 'Sync failed', description: syncError, tone: 'danger' });
      }
      if (manual && setupRequired) {
        networkSetupRequired = true;
        await openNetworkSetup();
        return;
      }
    } finally {
      await refreshSyncStatus();
      syncing = false;
      if (syncStatus?.state !== 'failed') manualSyncDetailsVisible = false;
      if (manual) walletShell.resumeAutomaticSync();
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
      <h1>{translate($locale, 'Overview')}</h1>
    </div>
    <button
      class="sync-button"
      disabled={automaticInitialScanPending ||
        walletAwaitingAutomaticScan ||
        syncInProgress ||
        recoveryScanIsActive(recoveryStatus)}
      title={mobileSyncSetupRequired
        ? translate($locale, 'Connect a trusted node to sync this wallet.')
        : syncButtonTitle}
      onclick={() => sync(true)}
      ><RefreshCw
        size={15}
        class={automaticInitialScanPending ||
        walletAwaitingAutomaticScan ||
        syncInProgress ||
        recoveryScanIsActive(recoveryStatus)
          ? 'spin'
          : ''}
      />{mobileSyncSetupRequired ? translate($locale, 'Set up sync') : syncButtonLabel}</button
    >
  </header>
  {#if mobileSyncSetupRequired}<div class="mobile-sync-notice">
      <WarningNotice
        title={translate($locale, 'Set up wallet sync')}
        body={translate($locale, 'Connect a trusted node to sync this wallet.')}
        ><Button size="small" variant="secondary" href="/settings#network-services"
          >{translate($locale, 'Configure sync')}</Button
        ></WarningNotice
      >
    </div>{/if}
  {#if initialHistoryRequired && !mobileSyncSetupRequired && !walletAwaitingAutomaticScan && !automaticInitialScanActive}
    <section class="initial-history-scan" aria-live="polite">
      <div>
        <strong
          >{translate(
            $locale,
            recoveryScanIsActive(recoveryStatus)
              ? 'Syncing · {percent}%'
              : savedRecoveryCanResume
                ? 'Wallet-history scan paused'
                : nodeReady
                  ? 'Approve wallet-history scan'
                  : 'Connect Bitcoin Core',
            { percent: recoveryPercent }
          )}</strong
        ><small
          >{recoveryScanIsActive(recoveryStatus) || savedRecoveryCanResume
            ? translate($locale, '{processed} / {total} blocks', {
                processed: formatInteger(recoveryStatus.processedBlocks, $locale),
                total: formatInteger(recoveryStatus.totalBlocks, $locale)
              })
            : nodeReady
              ? translate(
                  $locale,
                  'Scan the complete wallet history, or choose a private connection in Settings.'
                )
              : translate($locale, 'This wallet has not completed a sync yet.')}</small
        >
      </div>
      {#if recoveryScanIsActive(recoveryStatus)}
        <progress
          max="100"
          value={recoveryPercent}
          aria-label={translate($locale, 'Recovery scan progress')}
        ></progress>
      {:else}
        <Button
          size="small"
          variant="secondary"
          href={nodeReady ? undefined : '/settings'}
          onclick={nodeReady ? openInitialScan : undefined}
          >{translate(
            $locale,
            nodeReady
              ? savedRecoveryCanResume
                ? 'Resume scan'
                : 'Scan settings'
              : 'Connect Bitcoin Core'
          )}</Button
        >
      {/if}
    </section>
  {/if}
  {#if manualSyncDetailsVisible && syncStatus && (syncInProgress || syncStatus.state === 'failed')}
    <section class:failed={syncStatus.state === 'failed'} class="sync-progress" aria-live="polite">
      <div>
        <strong
          >{translate(
            $locale,
            syncStatus.source === 'bitcoin_core'
              ? syncStatus.state === 'failed'
                ? 'Wallet sync stopped'
                : syncCheckingPending
                  ? 'Checking pending transactions…'
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
            ? syncFailureDescription(syncStatus)
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
  {#if syncError}
    <div class="sync-failure-banner">
      <LoadFailure
        title={translate($locale, 'Sync failed')}
        description={syncError}
        onretry={() => sync(true)}
      />
    </div>
  {/if}
  {#if phoneBackupUnverified}
    <WarningNotice
      title={translate($locale, 'Recovery backup not verified')}
      body={translate($locale, 'Verify your written recovery words.')}
    >
      <Button size="small" variant="secondary" href="/multisig"
        >{translate($locale, 'Verify phone backup')}</Button
      >
    </WarningNotice>
  {/if}
  {#if selectedProfile?.kind === 'single_key' && !selectedProfile.backupVerified}
    <section
      class="backup-verification-banner"
      aria-label={translate($locale, 'Recovery backup status')}
    >
      <ShieldCheck size={18} /><span
        ><strong>{translate($locale, 'Recovery backup not verified')}</strong><small
          >{translate($locale, 'Verify your written recovery words.')}</small
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
      onretry={networkSetupRequired ? openNetworkSetup : loadSnapshot}
    />
  {:else if snapshot && !initialDataLoading && !walletAwaitingAutomaticScan}
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
          <Amount value={0} hidden={$discreetMode} /><small
            >{translate($locale, 'Never synced')}</small
          >
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
            ? 'This wallet has not completed a sync yet.'
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
    {#if pendingMobilePairingCount > 0}
      <a
        class="active-proposal-callout"
        href="/mobile/pair"
        aria-label={translate($locale, 'Resume wallet pairing')}
      >
        <span class="active-proposal-icon"><Smartphone size={17} /></span>
        <span class="active-proposal-copy"
          ><strong>{translate($locale, 'Wallet pairing in progress')}</strong><span
            class="active-proposal-meta"
            ><small>{translate($locale, 'Phone signer setup is waiting to finish')}</small></span
          ></span
        >
        <span class="active-proposal-action"
          >{translate($locale, 'Resume')} <ChevronRight size={15} /></span
        >
      </a>
    {/if}
    {#if secondaryError}
      <LoadFailure
        title={translate($locale, 'Wallet details are unavailable')}
        description={secondaryError}
        onretry={() => loadSecondaryDetails()}
      />
    {/if}
    {#if activeProposal}
      <a
        class="active-proposal-callout"
        class:ready={proposalCanFinalize && !activeProposalInputsUnavailable}
        href={proposalHref}
        aria-label={translate($locale, 'Resume payment, {label}, {progress}', {
          label: proposalLabel,
          progress: proposalProgress
        })}
      >
        <span class="active-proposal-icon"><Clock3 size={17} /></span>
        <span class="active-proposal-copy active-payment-copy"
          ><strong>{proposalTitle}</strong><span class="active-proposal-meta"
            ><PermanentLabelTags
              labels={activeProposal.labels ?? [activeProposal.label]}
              hidden={$discreetMode}
              prominent
            /></span
          ><small class="active-proposal-progress">{proposalProgress}</small></span
        >
        <span class="active-proposal-action"
          >{translate($locale, 'Resume')} <ChevronRight size={15} /></span
        >
      </a>
    {:else if activeDraft}
      <section class="active-proposal-callout active-draft-callout">
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
        <span class="active-draft-actions">
          <Button
            variant="ghost-danger"
            size="small"
            onclick={() => {
              discardDraftError = '';
              discardDraftOpen = true;
            }}><Trash2 size={14} />{translate($locale, 'Discard draft')}</Button
          >
          <Button
            variant="secondary"
            size="small"
            href={activeDraft.kind === 'multisig' ? '/multisig/send' : '/send'}
            ariaLabel={translate($locale, 'Resume payment draft, {label}', {
              label: $discreetMode ? 'Label hidden' : activeDraft.labels.join(', ')
            })}>{translate($locale, 'Resume')} <ChevronRight size={15} /></Button
          >
        </span>
      </section>
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
        <TxList
          items={recentTransactions}
          onselect={(transaction) => (selectedTransactionId = transaction.id)}
        />
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

<TxDetailsModal transaction={selected} {multisig} onclose={() => (selectedTransactionId = null)} />
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
  open={discardDraftOpen}
  title={translate($locale, 'Discard this payment draft?')}
  description={translate($locale, 'Remove the unfinished payment without creating a transaction.')}
  onclose={() => {
    if (!discardingDraft) {
      discardDraftOpen = false;
      discardDraftError = '';
    }
  }}
  >{#if activeDraft}<dl class="details-list cancel-proposal-details">
      <div>
        <dt>{translate($locale, 'Payment')}</dt>
        <dd><PermanentLabelTags labels={activeDraft.labels} hidden={$discreetMode} prominent /></dd>
      </div>
    </dl>
    {#if discardDraftError}<p class="form-error" role="alert">{discardDraftError}</p>{/if}
    <div class="modal-footer">
      <Button
        variant="secondary"
        disabled={discardingDraft}
        onclick={() => {
          discardDraftOpen = false;
          discardDraftError = '';
        }}>{translate($locale, 'Keep draft')}</Button
      ><Button
        variant="danger"
        loading={discardingDraft}
        loadingLabel={translate($locale, 'Discarding draft…')}
        onclick={confirmDiscardPaymentDraft}>{translate($locale, 'Discard draft')}</Button
      >
    </div>{/if}</Modal
>

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
  <WarningNotice
    class="verify-backup-warning"
    credentialSpacing
    title={translate($locale, 'Your recovery words stay private')}
    body={translate($locale, 'Groot checks them securely on this device.')}
    insightLabel={translate($locale, 'About recovery-word privacy')}
    insightText={translate(
      $locale,
      'Groot reveals and verifies the words in a separate trusted native window. They never enter the webview or leave this device.'
    )}
  />
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

<style>
  @media (max-width: 760px) {
    .dashboard-page .page-header {
      min-height: 46px;
      margin-bottom: 18px;
    }
  }
  .mobile-sync-notice {
    margin-bottom: 16px;
  }
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.sync-progress):where(.sync-progress) {
    display: grid;
    gap: 9px;
    margin: 0 0 16px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--panel);
  }
  :global(.sync-progress):where(.sync-progress) > :global(div) {
    display: grid;
    gap: 3px;
  }
  :global(.sync-progress):where(.sync-progress) :global(strong) {
    color: var(--text);
    font-size: 13px;
  }
  :global(.sync-progress):where(.sync-progress) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.45;
  }
  :global(.sync-progress):where(.sync-progress) :global(progress) {
    width: 100%;
    height: 5px;
    accent-color: var(--progress);
  }
  :global(.sync-progress.failed):where(.sync-progress) {
    border-color: color-mix(in srgb, var(--danger) 38%, var(--border));
  }
  :global(.initial-history-scan):where(.initial-history-scan) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px 18px;
    margin: 0 0 16px;
    padding: 13px 14px;
    border: 1px solid color-mix(in srgb, var(--accent) 38%, var(--border));
    border-radius: var(--radius-control);
    background: var(--accent-soft);
  }
  :global(.initial-history-scan):where(.initial-history-scan) > :global(div) {
    display: grid;
    gap: 3px;
  }
  :global(.initial-history-scan):where(.initial-history-scan) :global(strong) {
    color: var(--text);
    font-size: 13px;
  }
  :global(.initial-history-scan):where(.initial-history-scan) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.45;
  }
  :global(.initial-history-scan):where(.initial-history-scan) :global(progress) {
    grid-column: 1 / -1;
    width: 100%;
    height: 5px;
    accent-color: var(--progress);
  }
  :global(.unverified-balance):where(.unverified-balance) {
    display: flex;
    align-items: baseline;
    gap: 10px;
    cursor: default;
  }
  :global(.unverified-balance):where(.unverified-balance) :global(strong) {
    font-size: 42px;
  }
  :global(.unverified-balance):where(.unverified-balance) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    font-weight: 600;
  }
  :global(.initial-history-scan):where(.initial-history-scan)
    + :global(.backup-verification-banner),
  :global(.sync-progress):where(.sync-progress) + :global(.backup-verification-banner) {
    margin-top: 0;
  }

  :global(.balance-card):where(.balance-card) {
    border: 1px solid var(--border);
    background: var(--panel);
    border-radius: var(--radius-panel);
    padding: 26px 28px 23px;
    position: relative;
    overflow: hidden;
  }
  :global(.backup-verification-banner):where(.backup-verification-banner) {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto;
    align-items: center;
    gap: 11px;
    margin: 0 0 16px;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--accent) 34%, var(--border));
    border-radius: var(--radius-control);
    color: var(--accent);
    background: var(--accent-soft);
  }
  :global(.backup-verification-banner):where(.backup-verification-banner) > :global(span) {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  :global(.backup-verification-banner):where(.backup-verification-banner) :global(strong) {
    color: var(--text);
    font-size: var(--font-size-meta);
  }
  :global(.backup-verification-banner):where(.backup-verification-banner) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.45;
  }

  :global(.policy-maturity-banner):where(.policy-maturity-banner) {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border: 1px solid color-mix(in srgb, var(--focus) 28%, var(--border));
    border-radius: var(--radius-inset);
    background: color-mix(in srgb, var(--focus) 7%, var(--panel));
  }

  :global(.policy-maturity-banner.approaching):where(.policy-maturity-banner) {
    border-color: color-mix(in srgb, var(--warning-text) 42%, var(--border));
    background: color-mix(in srgb, var(--warning-text) 8%, var(--panel));
  }

  :global(.policy-maturity-banner.mature):where(.policy-maturity-banner) {
    border-color: color-mix(in srgb, var(--danger) 38%, var(--border));
    background: color-mix(in srgb, var(--danger) 7%, var(--panel));
  }

  :global(.policy-maturity-banner.compact):where(.policy-maturity-banner) {
    grid-template-columns: auto minmax(0, 1fr);
  }

  :global(.policy-maturity-icon):where(.policy-maturity-icon) {
    display: grid;
    width: 36px;
    height: 36px;
    place-items: center;
    border-radius: var(--radius-inset);
    color: var(--focus);
    background: color-mix(in srgb, var(--focus) 12%, var(--surface-icon));
  }

  :global(.policy-maturity-banner):where(.policy-maturity-banner) > :global(div) {
    display: grid;
    gap: 3px;
  }

  :global(.policy-maturity-banner):where(.policy-maturity-banner) :global(strong),
  :global(.policy-maturity-banner):where(.policy-maturity-banner) :global(small) {
    display: block;
  }

  :global(.policy-maturity-banner):where(.policy-maturity-banner) :global(small) {
    color: var(--muted);
    line-height: 1.4;
  }

  :global(.policy-maturity-banner):where(.policy-maturity-banner) :global(.stale-copy) {
    color: var(--warning-text);
  }
  :global(.policy-maturity-banner:not(.compact)):where(.policy-maturity-banner) {
    margin-bottom: 14px;
  }
  :global(.balance-top):where(.balance-top) {
    color: var(--muted);
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  :global(.ghost-icon):where(.ghost-icon) {
    border: 0;
    background: none;
    color: var(--muted-2);
    padding: 2px;
    display: inline-flex;
    cursor: pointer;
  }
  :global(.balance-value):where(.balance-value) {
    appearance: none;
    width: fit-content;
    border: 0;
    background: none;
    color: var(--text);
    font-size: clamp(34px, 5vw, 47px);
    font-weight: 600;
    letter-spacing: -0.035em;
    margin-top: 14px;
    padding: 0;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  :global(.balance-value:focus-visible):where(.balance-value) {
    outline: 2px solid var(--focus);
    outline-offset: 5px;
    border-radius: 4px;
  }
  :global(.balance-value):where(.balance-value) :global(small) {
    font-size: 16px;
    letter-spacing: 0;
    color: var(--muted);
    font-weight: 500;
  }
  :global(.pending-line):where(.pending-line) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 24px;
  }
  :global(.pending-line):where(.pending-line) :global(i) {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--progress);
  }
  :global(.active-proposal-callout):where(.active-proposal-callout) {
    min-height: 54px;
    margin-top: 13px;
    padding: 9px 12px;
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border: 1px solid color-mix(in srgb, var(--accent) 24%, transparent);
    border-radius: var(--radius-control);
    color: var(--text);
    background: color-mix(in srgb, var(--accent) 8%, var(--panel));
    transition:
      border-color 0.15s ease,
      background-color 0.15s ease;
  }
  :global(.active-proposal-callout:hover):where(.active-proposal-callout) {
    border-color: color-mix(in srgb, var(--accent) 34%, transparent);
    background: color-mix(in srgb, var(--accent) 12%, var(--panel));
  }
  :global(.active-proposal-icon):where(.active-proposal-icon) {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-control);
    color: var(--accent);
    background: var(--accent-soft);
  }
  :global(.active-proposal-callout.ready):where(.active-proposal-callout) {
    border-color: color-mix(in srgb, var(--success) 38%, var(--border));
    background: color-mix(in srgb, var(--success) 7%, var(--panel));
  }
  :global(.active-proposal-callout.ready):where(.active-proposal-callout)
    :global(.active-proposal-icon) {
    color: var(--success);
    background: color-mix(in srgb, var(--success) 12%, transparent);
  }
  :global(.active-proposal-copy):where(.active-proposal-copy) {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  :global(.active-payment-copy):where(.active-payment-copy) {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'title progress'
      'labels progress';
    column-gap: 10px;
  }
  :global(.active-payment-copy):where(.active-payment-copy) > :global(strong) {
    grid-area: title;
  }
  :global(.active-payment-copy):where(.active-payment-copy) > :global(.active-proposal-meta) {
    grid-area: labels;
  }
  :global(.active-proposal-copy):where(.active-proposal-copy) :global(strong) {
    font-size: var(--font-size-meta);
  }
  :global(.active-proposal-copy):where(.active-proposal-copy) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.active-proposal-meta):where(.active-proposal-meta) {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 7px;
    padding-top: 4px;
  }
  :global(.active-proposal-meta):where(.active-proposal-meta)
    :global(.permanent-label-tags.prominent) {
    flex: 0 1 auto;
    justify-content: flex-start;
  }
  :global(.active-proposal-meta):where(.active-proposal-meta) > :global(small) {
    flex: 0 0 auto;
  }
  :global(.active-proposal-progress):where(.active-proposal-progress) {
    grid-area: progress;
    align-self: center;
    color: var(--muted);
    font-size: var(--font-size-meta);
    white-space: nowrap;
  }
  :global(.active-proposal-action):where(.active-proposal-action) {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    color: var(--link);
    font-size: var(--font-size-meta);
    font-weight: 650;
  }
  :global(.active-draft-actions):where(.active-draft-actions) {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 7px;
  }
  :global(.active-draft-actions):where(.active-draft-actions) :global(.button) {
    min-height: 32px;
    font-size: var(--font-size-meta);
    font-weight: 650;
  }
  :global(.active-proposal-callout):where(.active-proposal-callout) + :global(.primary-actions) {
    margin-top: 10px;
  }
  :global(.primary-actions):where(.primary-actions) {
    display: grid;
    grid-template-columns: 46px repeat(2, minmax(0, 1fr));
    align-items: stretch;
    gap: 10px;
    margin-top: 13px;
  }
  :global(.primary-actions):where(.primary-actions) > :global(*) {
    min-width: 0;
  }
  :global(.overview-more):where(.overview-more) {
    position: relative;
    width: 46px;
    align-self: center;
  }
  :global(.overview-more-menu):where(.overview-more-menu) {
    position: absolute;
    z-index: 90;
    left: 0;
    bottom: calc(100% + 8px);
    width: 238px;
    padding: 6px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-inset);
    background: var(--panel-2);
    box-shadow: 0 16px 42px rgba(0, 0, 0, 0.28);
  }
  :global(.overview-more-menu):where(.overview-more-menu) :global(a),
  :global(.overview-more-menu):where(.overview-more-menu) :global(button) {
    width: 100%;
    min-height: 48px;
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    align-items: center;
    gap: 9px;
    padding: 7px 9px;
    border: 0;
    border-radius: var(--radius-control);
    color: var(--text-soft);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  :global(.overview-more-menu):where(.overview-more-menu) :global(a:hover),
  :global(.overview-more-menu):where(.overview-more-menu) :global(a:focus-visible),
  :global(.overview-more-menu):where(.overview-more-menu) :global(button:hover),
  :global(.overview-more-menu):where(.overview-more-menu) :global(button:focus-visible) {
    color: var(--text);
    background: var(--surface-hover);
    outline: 0;
  }
  :global(.overview-more-menu):where(.overview-more-menu) :global(a > svg),
  :global(.overview-more-menu):where(.overview-more-menu) :global(button > svg) {
    color: var(--muted);
  }
  :global(.overview-more-menu):where(.overview-more-menu) :global(a > span),
  :global(.overview-more-menu):where(.overview-more-menu) :global(button > span) {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  :global(.overview-more-menu):where(.overview-more-menu) :global(strong) {
    font-size: var(--font-size-meta);
  }
  :global(.overview-more-menu):where(.overview-more-menu) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }

  @media (max-width: 700px) {
    :global(.policy-maturity-banner):where(.policy-maturity-banner) {
      grid-template-columns: auto minmax(0, 1fr);
    }

    :global(.policy-maturity-banner):where(.policy-maturity-banner) :global(.button) {
      grid-column: 1 / -1;
      width: 100%;
    }
  }

  @media (max-width: 760px) {
    :global(.balance-card):where(.balance-card) {
      padding: 22px 20px;
    }
    :global(.backup-verification-banner):where(.backup-verification-banner) {
      grid-template-columns: 24px minmax(0, 1fr);
      margin-top: -12px;
    }
    :global(.backup-verification-banner):where(.backup-verification-banner) :global(.button) {
      grid-column: 2;
      justify-self: start;
    }
    :global(.balance-value):where(.balance-value) {
      font-size: 35px;
    }
    :global(.active-proposal-callout):where(.active-proposal-callout) {
      grid-template-columns: 32px minmax(0, 1fr);
    }
    :global(.active-payment-copy):where(.active-payment-copy) {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        'title'
        'labels'
        'progress';
    }
    :global(.active-proposal-progress):where(.active-proposal-progress) {
      justify-self: start;
      margin-top: 3px;
    }
    :global(.active-proposal-action):where(.active-proposal-action) {
      display: none;
    }
    :global(.active-draft-actions):where(.active-draft-actions) {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
    }
    :global(.active-draft-actions):where(.active-draft-actions) :global(a.button) {
      width: 100%;
    }
    :global(.dashboard-page):where(.dashboard-page) :global(.primary-actions) {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 46px;
    }
    :global(.overview-more-menu):where(.overview-more-menu) {
      position: absolute;
      z-index: 90;
      top: calc(100% + 8px);
      right: 0;
      bottom: auto;
      left: auto;
      width: min(238px, calc(100vw - 36px));
      max-height: calc(100dvh - 180px);
      overflow-y: auto;
    }
  }
  .page > :global(.warning-notice) {
    margin-bottom: 1rem;
  }
</style>
