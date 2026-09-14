<script lang="ts">
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
    RefreshCw,
    ShieldCheck,
    TriangleAlert,
    Trash2
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
    type WalletErrorDetails,
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
  import { latestActiveProposal, proposalInputsUnavailable } from '$lib/wallet/proposal-resume';
  import type { PaymentDraft } from '$lib/wallet/payment-draft';
  import { pendingBalanceBreakdown, sortTransactionsNewestFirst } from '$lib/wallet/presentation';
  import { policyMaturitySummary } from '$lib/wallet/policy';
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
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
  const isMainnet = defaultConfig.network === 'mainnet';
  let syncing = $state(false);
  let manualSyncDetailsVisible = $state(false);
  let snapshot = $state<WalletSnapshot | import('$lib/wallet/contracts').WalletOverview | null>(
    null
  );
  let loadGeneration = 0;
  let secondaryError = $state('');
  let secondaryLoading = $state(false);
  let multisigWallet = $state<MultisigWallet | null>(null);
  let hardwareSignerWallet = $state<ExternalSignerWallet | null>(null);
  let signerDetailsOpen = $state(false);
  let checkingSignerHealth = $state(false);
  let activeProposal = $state<MultisigProposal | PaymentProposal | null>(null);
  let activeDraft = $state<PaymentDraft | null>(null);
  let discardDraftOpen = $state(false);
  let discardingDraft = $state(false);
  let discardDraftError = $state('');
  let selected = $state<Transaction | null>(null);
  let multisig = $state(false);
  let moreOpen = $state(false);
  let moreMenu = $state<HTMLDivElement | null>(null);
  let moreTrigger = $state<HTMLButtonElement | null>(null);
  let showDescriptors = $state(false);
  let loadError = $state('');
  let networkSetupRequired = $state(false);
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
  let initialScanMode = $state<'new' | 'birthday' | 'full'>('new');
  let showManualScanOptions = $state(false);
  let showAdvancedScanOptions = $state(false);
  let initialBirthdayHeight = $state(0);
  let initialGapLimit = $state(20);
  let initialScanCredential = $state('');
  let initialScanError = $state('');
  let initialScanErrorCode = $state('');
  let initialScanErrorDetails = $state<WalletErrorDetails | null>(null);
  let initialScanStarting = $state(false);
  let nodeReady = $state(false);
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
    const generation = ++loadGeneration;
    loadError = '';
    networkSetupRequired = false;
    initialDataLoading = true;
    try {
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
      const [nextSyncSource, networkSetupSources] = await Promise.all([
        walletService.syncSource(),
        walletService.networkSetupSources()
      ]);
      if (generation !== loadGeneration) return;
      syncSource = nextSyncSource;
      selectedProfile =
        registry.wallets.find((wallet) => wallet.id === registry.selectedWalletId) ?? null;
      nodeReady = Boolean(
        selectedProfile &&
        networkSetupSources.some(
          (source) => source.walletId === selectedProfile?.id && source.ready
        )
      );
      if (isMainnet && nodeReady) await walletService.testNodeConnection();
      if (generation !== loadGeneration) return;
      multisig = selectedProfile?.kind === 'multisig';
      if (!selectedProfile)
        throw new WalletError('wallet_not_found', 'The selected wallet does not exist.');
      const nextSnapshot = await walletService.overview(selectedProfile.id);
      if (generation !== loadGeneration) return;
      snapshot = nextSnapshot;
      initialDataLoading = false;
      void loadSecondaryDetails(generation);
      if (syncSource.type === 'bitcoin_core' && !snapshot?.syncedAt) {
        await loadRecoveryState();
      }
      if (
        selectedProfile &&
        walletShell.consumeUnlockSync(selectedProfile.id) &&
        !inheritedSyncObserved
      )
        void sync(false);
    } catch (cause) {
      if (generation !== loadGeneration) return;
      if (cause instanceof WalletError && cause.code === 'wallet_locked') {
        await goto('/unlock');
        return;
      }
      networkSetupRequired =
        cause instanceof WalletError &&
        [
          'invalid_node_config',
          'network_unavailable',
          'node_admission_required',
          'wallet_corrupt'
        ].includes(cause.code);
      nodeReady = false;
      loadError = networkSetupRequired
        ? 'Connect this wallet to Bitcoin Core in Settings to load network data.'
        : localizedError(cause, $locale, 'The wallet data could not be read.');
      initialDataLoading = false;
      toast({
        title: networkSetupRequired ? 'Connect Bitcoin Core' : 'Could not open wallet',
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
    secondaryLoading = true;
    const current = () =>
      generation === loadGeneration && profile.id === walletShell.selectedWalletId();
    const results = await Promise.allSettled([
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
    secondaryLoading = false;
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
      } else if (!snapshot?.syncedAt && nodeReady) {
        // If setup navigation was interrupted, scan conservatively. Only an
        // explicit new-wallet hint may skip history before the current tip.
        initialScanMode = page.url.searchParams.get('initial') === 'new' ? 'new' : 'full';
        showManualScanOptions = false;
        showAdvancedScanOptions = false;
        void startInitialScan();
      }
    } catch (cause) {
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
    initialScanErrorCode = '';
    initialScanErrorDetails = null;
    if (!nodeReady) {
      void goto('/settings');
      return;
    }
    if (savedRecoveryCanResume) {
      initialScanMode = recoverySettings.birthdayHeight === 0 ? 'full' : 'birthday';
      initialBirthdayHeight = recoverySettings.birthdayHeight;
      initialGapLimit = recoverySettings.gapLimit;
      showManualScanOptions = true;
      showAdvancedScanOptions = recoverySettings.gapLimit !== 20;
    } else {
      initialScanMode = 'new';
      showManualScanOptions = false;
      showAdvancedScanOptions = false;
    }
    initialScanOpen = true;
  }
  async function startInitialScan() {
    initialScanStarting = true;
    initialScanError = '';
    initialScanErrorCode = '';
    initialScanErrorDetails = null;
    const credential = '';
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
      initialScanErrorCode = cause instanceof WalletError ? cause.code : 'internal_error';
      initialScanErrorDetails = cause instanceof WalletError ? cause.details : null;
      initialScanOpen = false;
      toast({
        title: 'Wallet-history scan paused',
        description: initialScanError,
        tone: 'danger'
      });
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
  const sync = async (manual = true) => {
    if (manual && networkSetupRequired) {
      await openNetworkSetup();
      return;
    }
    if (initialHistoryRequired) {
      if (!nodeReady) {
        await openNetworkSetup();
      } else if (savedRecoveryCanResume) {
        await startInitialScan();
      } else {
        await goto('/settings');
      }
      return;
    }
    if (syncInProgress) return;
    manualSyncDetailsVisible = manual;
    syncing = true;
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
      if (manual && setupRequired) {
        networkSetupRequired = true;
        await openNetworkSetup();
        return;
      }
      if (manual)
        toast({
          title: 'Sync failed',
          description: localizedError(cause, $locale),
          tone: 'danger'
        });
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
      <p class="eyebrow">{translate($locale, 'WALLET')}</p>
      <h1>{translate($locale, 'Overview')}</h1>
    </div>
    <button
      class="sync-button"
      disabled={syncInProgress || recoveryScanIsActive(recoveryStatus)}
      title={syncButtonTitle}
      onclick={() => sync(true)}
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
                : nodeReady
                  ? 'Choose where wallet history begins'
                  : 'Connect Bitcoin Core',
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
            : nodeReady
              ? translate(
                  $locale,
                  'A birthday makes the first scan faster. Full history always remains available.'
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
          href={nodeReady && savedRecoveryCanResume ? undefined : '/settings'}
          onclick={nodeReady && savedRecoveryCanResume ? startInitialScan : undefined}
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
      onretry={networkSetupRequired ? openNetworkSetup : loadSnapshot}
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
    {#if secondaryLoading}
      <p role="status">{translate($locale, 'Loading wallet details…')}</p>
    {:else if secondaryError}
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
  open={discardDraftOpen}
  title={translate($locale, 'Discard this payment draft?')}
  description={translate($locale, 'Remove the unfinished payment without creating a transaction.')}
  onclose={() => {
    if (!discardingDraft) {
      discardDraftOpen = false;
      discardDraftError = '';
    }
  }}
  >{#if activeDraft}<div class="warning-box">
      <strong>{translate($locale, 'Only the draft will be removed.')}</strong>
      {translate($locale, 'No transaction or signature exists yet.')}
    </div>
    <dl class="details-list cancel-proposal-details">
      <div>
        <dt>{translate($locale, 'Payment')}</dt>
        <dd><PermanentLabelTags labels={activeDraft.labels} hidden={$discreetMode} prominent /></dd>
      </div>
      <div>
        <dt>{translate($locale, 'Saved fields')}</dt>
        <dd>{translate($locale, 'Recipient, labels, amount, fee, and coin selection')}</dd>
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
    initialScanErrorCode = '';
    initialScanErrorDetails = null;
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
      <Button
        class="initial-scan-disclosure"
        variant="ghost"
        size="small"
        onclick={() => (showManualScanOptions = !showManualScanOptions)}
        >{translate(
          $locale,
          showManualScanOptions ? 'Hide existing-wallet options' : 'Existing wallet options'
        )}</Button
      >
      {#if showManualScanOptions}
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
        <Button
          class="initial-scan-disclosure"
          variant="ghost"
          size="small"
          onclick={() => (showAdvancedScanOptions = !showAdvancedScanOptions)}
          >{translate(
            $locale,
            showAdvancedScanOptions ? 'Hide address discovery options' : 'Address discovery options'
          )}</Button
        >
        {#if showAdvancedScanOptions}
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
        {/if}
      {/if}
    </div>
  {/if}
  <PasswordField
    label={scanCredentialLabel}
    bind:value={initialScanCredential}
    autocomplete="current-password"
    disabled={initialScanStarting}
    hint={translate($locale, 'Used only to authenticate this saved recovery operation.')}
  />
  {#if initialScanError}<div
      class="hardware-inline-error scan-error-card"
      role="alert"
      aria-live="polite"
    >
      <TriangleAlert size={18} />
      <span>
        <strong
          >{translate(
            $locale,
            initialScanErrorCode === 'node_history_unavailable'
              ? 'Required block history is unavailable'
              : 'Wallet-history scan failed'
          )}</strong
        >
        <small>{initialScanError}</small>
        {#if initialScanErrorDetails}<dl class="scan-error-details">
            {#if initialScanErrorDetails.requestedBirthdayBlock !== undefined}<div>
                <dt>{translate($locale, 'Requested birthday')}</dt>
                <dd>
                  {translate($locale, 'Block {height}', {
                    height: formatInteger(initialScanErrorDetails.requestedBirthdayBlock, $locale)
                  })}
                </dd>
              </div>{/if}
            {#if initialScanErrorDetails.requiredBlock !== undefined}<div>
                <dt>{translate($locale, 'Required anchor')}</dt>
                <dd>
                  {translate($locale, 'Block {height}', {
                    height: formatInteger(initialScanErrorDetails.requiredBlock, $locale)
                  })}
                </dd>
              </div>{/if}
            {#if initialScanErrorDetails.earliestRetainedBlock !== undefined}<div>
                <dt>{translate($locale, 'Bitcoin Core retains full blocks from')}</dt>
                <dd>
                  {translate($locale, 'Block {height}', {
                    height: formatInteger(initialScanErrorDetails.earliestRetainedBlock, $locale)
                  })}
                </dd>
              </div>{/if}
            {#if initialScanErrorDetails.minimumBirthdayBlock !== undefined}<div>
                <dt>{translate($locale, 'Earliest usable birthday')}</dt>
                <dd>
                  {translate($locale, 'Block {height}', {
                    height: formatInteger(initialScanErrorDetails.minimumBirthdayBlock, $locale)
                  })}
                </dd>
              </div>{/if}
          </dl>{/if}
      </span>
    </div>{/if}
  <div class="modal-footer">
    <Button
      variant="secondary"
      disabled={initialScanStarting}
      onclick={() => {
        initialScanOpen = false;
        initialScanCredential = '';
        initialScanError = '';
        initialScanErrorCode = '';
        initialScanErrorDetails = null;
      }}>{translate($locale, 'Not now')}</Button
    ><Button
      disabled={!initialScanCredential ||
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
