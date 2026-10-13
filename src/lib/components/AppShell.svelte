<script lang="ts">
  import { translate, localizedError } from '$lib/i18n-catalog';
  import { page } from '$app/state';
  import {
    Activity,
    ArrowDownToLine,
    ArrowUpFromLine,
    CircleDot,
    LayoutGrid,
    Plus,
    Settings,
    ShieldCheck
  } from '@lucide/svelte';
  import BrandLockup from './BrandLockup.svelte';
  import BuildIdentity from './BuildIdentity.svelte';
  import DiscardMultisigSetupModal from './DiscardMultisigSetupModal.svelte';
  import ToastHost from './ToastHost.svelte';
  import Modal from './Modal.svelte';
  import Button from './Button.svelte';
  import WarningNotice from './WarningNotice.svelte';
  import WalletProfileList from './WalletProfileList.svelte';
  import NetworkStatus from './NetworkStatus.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import DiscreetModeToggle from './DiscreetModeToggle.svelte';
  import ResumeSetupNotice from './ResumeSetupNotice.svelte';
  import WalletSkeleton from './WalletSkeleton.svelte';
  import {
    APP_VERSION,
    applyRuntimeNetwork,
    defaultConfig,
    networkSwitchingBuild
  } from '$lib/config';
  import { applyMultisigNetwork } from '$lib/multisig/policy';
  import { onMount } from 'svelte';
  import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
  import { isPrototypeWallet, walletService, WalletError } from '$lib/wallet';
  import {
    createLiveSync,
    LIVE_SYNC_INTERVAL_MS,
    type LiveSyncController
  } from '$lib/wallet/live-sync';
  import { createSessionMonitor, type SessionMonitorController } from '$lib/wallet/session-monitor';
  import { toast } from '$lib/stores/toasts';
  import { denomination, initDenomination } from '$lib/denomination';
  import { fade } from 'svelte/transition';
  import type {
    MultisigSetupDraft,
    RuntimePlatform,
    WalletProfile,
    WalletSelection
  } from '$lib/wallet/contracts';
  import { formatWalletCount, locale, t, type MessageKey } from '$lib/i18n';
  import { provideWalletShellContext } from '$lib/wallet/shell-context';
  import { multisigSetupSignerTarget, multisigSetupStageLabel } from '$lib/wallet/multisig-setup';
  import { walletEventPresentation } from '$lib/wallet/notification-policy';
  import {
    isDesktopPlatform,
    matchKeyboardShortcut,
    matchZoomShortcut,
    usesCommandModifier
  } from '$lib/keyboard-shortcuts';
  import { applyZoom, changeZoom, initZoom } from '$lib/zoom';
  let { children } = $props();
  const nav: Array<{ href: string; label: MessageKey; icon: typeof LayoutGrid }> = [
    { href: '/', label: 'overview', icon: LayoutGrid },
    { href: '/activity', label: 'activity', icon: Activity },
    { href: '/coins', label: 'coins', icon: CircleDot },
    { href: '/multisig', label: 'policy', icon: ShieldCheck }
  ];
  const walletSetupRoutes = new Set([
    '/welcome',
    '/hardware/new',
    '/multisig/new',
    '/multisig/recover'
  ]);
  const routeCancelsSync = (pathname: string) =>
    walletSetupRoutes.has(pathname) || pathname === '/unlock' || pathname === '/diagnostics';
  const active = (href: string) =>
    href === '/settings'
      ? page.url.pathname === href || page.url.pathname === '/diagnostics'
      : href === '/multisig'
        ? page.url.pathname === href ||
          page.url.pathname.startsWith('/multisig/policy') ||
          page.url.pathname.startsWith('/multisig/backup')
        : page.url.pathname === href;
  let profiles = $state<WalletProfile[]>([]);
  let selectedWalletId = $state<string | null>(null);
  let selectedWalletUnlocked = $state(false);
  let multisigSetupDraft = $state<MultisigSetupDraft | null>(null);
  let discardSetupOpen = $state(false);
  let discardingSetup = $state(false);
  let discardSetupError = $state('');
  let setupDraftReadGeneration = 0;
  let profileReadGeneration = 0;
  let liveSync: LiveSyncController | undefined;
  let automaticSyncPauseCount = 0;
  let automaticSyncPauseTask: Promise<void> | undefined;
  let sessionMonitor: SessionMonitorController | undefined;
  let activeHardwareReviews = 0;
  let startupState = $state<'checking' | 'ready' | 'failed'>('checking');
  let navigationPending = $state(false);
  let pendingDestination = $state('');
  let commandModifier = false;
  let desktopPlatform = false;
  let currentZoom = 1;
  let shortcutLockPending = false;
  let walletSelectionTask: Promise<void> | undefined;
  let mobileRuntime = false;
  let pendingUnlockSyncWalletId: string | null = null;
  let runtimeIdentity = $state<RuntimePlatform | null>(null);
  let startupFailure = $state('');
  let checkingRuntime = $state(true);
  let backgroundLockRequired = false;
  let selectedProfile = $derived(profiles.find((wallet) => wallet.id === selectedWalletId));
  let policyContext = $derived(
    selectedProfile?.kind === 'multisig' || page.url.pathname.startsWith('/multisig')
  );
  let visibleNav = $derived(policyContext ? nav : nav.slice(0, 3));
  let mobileItems = $derived(policyContext ? nav : nav.slice(0, 3));
  let onboardingRoute = $derived(walletSetupRoutes.has(page.url.pathname));
  let mobileSetupRoute = $derived(
    page.url.pathname === '/mobile/pair' ||
      page.url.pathname === '/mobile/watch' ||
      page.url.pathname === '/mobile/recover'
  );
  let lockedRoute = $derived(page.url.pathname === '/unlock');
  let settingsRoute = $derived(page.url.pathname === '/settings');
  let diagnosticsRoute = $derived(page.url.pathname === '/diagnostics');
  let walletLocked = $derived(!selectedWalletUnlocked);
  let restrictedUtilityRoute = $derived(
    lockedRoute || ((settingsRoute || diagnosticsRoute) && walletLocked)
  );
  let syncPausedRoute = $derived(
    onboardingRoute || lockedRoute || diagnosticsRoute || walletLocked || mobileSetupRoute
  );
  const showQuickActions = $derived(
    !restrictedUtilityRoute && (page.url.pathname === '/' || page.url.pathname === '/coins')
  );
  const receiveHref = $derived(
    selectedProfile?.kind === 'multisig' ? '/multisig/receive' : '/receive'
  );
  const sendHref = $derived(selectedProfile?.kind === 'multisig' ? '/multisig/send' : '/send');
  const showSetupResume = $derived(
    Boolean(multisigSetupDraft) && !onboardingRoute && !diagnosticsRoute
  );
  let initialApprovalWalletId = $state<string | null>(null);
  let initialApprovalBusy = $state(false);
  let initialApprovalError = $state('');
  let initialApprovalManaged = $state(false);
  const declinedInitialScans = new Set<string>();
  function requestInitialHistoryApproval(force = false) {
    const id = selectedWalletId;
    if (!id || (!force && declinedInitialScans.has(id)) || initialApprovalBusy) return;
    if (!force && initialApprovalWalletId === id) return;
    initialApprovalWalletId = id;
    initialApprovalError = '';
    initialApprovalManaged = false;
    void walletService
      .nodeConfig()
      .then((config) => {
        if (initialApprovalWalletId === id)
          initialApprovalManaged =
            config.backend.type === 'remote_core' &&
            config.backend.url === 'https://bitcoin-rpc.usegroot.com/';
      })
      .catch(() => undefined);
  }
  async function declineInitialHistoryScan() {
    if (initialApprovalBusy) return;
    if (initialApprovalWalletId) declinedInitialScans.add(initialApprovalWalletId);
    initialApprovalWalletId = null;
    await goto('/settings?nodeConnection=1');
  }
  async function approveInitialHistoryScan() {
    const id = initialApprovalWalletId;
    if (!id || initialApprovalBusy) return;
    initialApprovalBusy = true;
    initialApprovalError = '';
    let scanStarted = false;
    try {
      await pauseAutomaticSync();
      const session = await walletService.session();
      if (!session.unlocked || session.profile.id !== id)
        throw new WalletError(
          'wallet_selection_changed',
          'The selected wallet changed. Open it again before approving the scan.'
        );
      const settings = await walletService.recoveryScanSettings();
      await walletService.saveRecoveryScanSettings(0, settings.gapLimit, '', id);
      declinedInitialScans.delete(id);
      const scan = walletService.fullRescan('', id);
      scanStarted = true;
      initialApprovalWalletId = null;
      void scan
        .then(() => toast({ title: 'Wallet history verified', tone: 'success' }))
        .catch((cause) => {
          if (selectedWalletId !== id) return;
          initialApprovalError = localizedError(
            cause,
            $locale,
            'The wallet-history scan could not start.'
          );
          initialApprovalWalletId = id;
          toast({
            title: 'Wallet-history scan paused',
            description: initialApprovalError,
            tone: 'danger'
          });
        })
        .finally(() => resumeAutomaticSync())
        .catch(() => undefined);
    } catch (cause) {
      initialApprovalError = localizedError(
        cause,
        $locale,
        'The wallet-history scan could not start.'
      );
      toast({
        title: 'Wallet-history scan paused',
        description: initialApprovalError,
        tone: 'danger'
      });
    } finally {
      initialApprovalBusy = false;
      if (!scanStarted) await resumeAutomaticSync();
    }
  }
  function handleKeyboardShortcut(event: KeyboardEvent) {
    const primaryModifier = commandModifier
      ? event.metaKey && !event.ctrlKey
      : event.ctrlKey && !event.metaKey;
    const target = event.target as HTMLElement | null;
    const zoomShortcut = matchZoomShortcut(event);
    if (
      desktopPlatform &&
      !event.defaultPrevented &&
      !event.repeat &&
      !event.altKey &&
      primaryModifier &&
      zoomShortcut
    ) {
      event.preventDefault();
      currentZoom = applyZoom(changeZoom(currentZoom, zoomShortcut));
      return;
    }
    if (
      startupState !== 'ready' ||
      onboardingRoute ||
      walletLocked ||
      diagnosticsRoute ||
      event.defaultPrevented ||
      event.repeat ||
      event.altKey ||
      !primaryModifier ||
      target?.closest('input, textarea, select, [contenteditable="true"]') ||
      document.querySelector('[role="dialog"]')
    )
      return;

    const shortcut = matchKeyboardShortcut(event);
    if (!shortcut) return;

    if (shortcut.id === 'zoom_in' || shortcut.id === 'zoom_out' || shortcut.id === 'zoom_reset')
      return;

    if (shortcut.id === 'lock') {
      if (isPrototypeWallet || !desktopPlatform || navigationPending || shortcutLockPending) return;
      event.preventDefault();
      void lockSelectedWallet();
      return;
    }

    let destination: string;
    switch (shortcut.id) {
      case 'overview':
        destination = '/';
        break;
      case 'activity':
        destination = '/activity';
        break;
      case 'coins':
        destination = '/coins';
        break;
      case 'settings':
        destination = '/settings';
        break;
      case 'receive':
        destination = receiveHref;
        break;
      case 'send':
        destination = sendHref;
        break;
    }
    event.preventDefault();
    void goto(destination);
  }

  async function lockSelectedWallet() {
    shortcutLockPending = true;
    const resumeAutomaticSync = !syncPausedRoute;
    liveSync?.stop();
    try {
      // A wallet switch that began before this shortcut must settle first so
      // the native lock always applies to the wallet selected at lock time.
      await walletSelectionTask?.catch(() => undefined);
      liveSync?.stop();
      await walletService.cancelHardwareOperations();
      await walletService.cancelSync().catch(() => undefined);
      await walletService.lock();
      await goto('/unlock');
    } catch (cause) {
      if (resumeAutomaticSync) liveSync?.restart();
      toast({
        title: 'Wallet not locked',
        description: localizedError(cause, $locale, 'Could not lock this wallet.'),
        tone: 'danger'
      });
    } finally {
      shortcutLockPending = false;
    }
  }

  async function refreshSetupDraft() {
    const generation = ++setupDraftReadGeneration;
    try {
      const draft = await walletService.multisigSetupDraft();
      if (generation === setupDraftReadGeneration) multisigSetupDraft = draft;
    } catch {
      /* Keep the last known notice visible across transient read failures. */
    }
  }

  async function discardSetupDraft() {
    if (discardingSetup) return;
    discardingSetup = true;
    discardSetupError = '';
    ++setupDraftReadGeneration;
    try {
      await walletService.discardMultisigSetupDraft();
      ++setupDraftReadGeneration;
      multisigSetupDraft = null;
      discardSetupOpen = false;
      toast({
        title: 'Setup discarded',
        description: 'The unfinished multisig wallet setup was removed.',
        tone: 'success'
      });
    } catch (cause) {
      discardSetupError = localizedError(cause, $locale, 'Could not discard the unfinished setup.');
    } finally {
      discardingSetup = false;
    }
  }

  async function refreshProfiles() {
    const generation = ++profileReadGeneration;
    try {
      const registry = await walletService.profiles();
      if (generation === profileReadGeneration) {
        profiles = registry.wallets;
        selectedWalletId = registry.selectedWalletId;
      }
    } catch {
      if (generation === profileReadGeneration) {
        profiles = [];
        selectedWalletId = null;
      }
    }
  }

  const profileMutatingRoutes = new Set([
    '/welcome',
    '/hardware/new',
    '/multisig/new',
    '/multisig/recover',
    '/multisig/delete',
    '/mobile/pair',
    '/mobile/watch',
    '/mobile/recover'
  ]);

  async function resumeAfterWalletCreation(profileRefresh: Promise<void>) {
    await profileRefresh;
    let selection: WalletSelection;
    try {
      selection = await walletService.session();
      selectedWalletUnlocked = selection.unlocked;
    } catch {
      selectedWalletUnlocked = false;
      return;
    }
    if (
      !selection.unlocked ||
      !liveSync ||
      routeCancelsSync(page.url.pathname) ||
      automaticSyncPauseCount > 0
    )
      return;
    liveSync.start();
    await liveSync.runNow();
  }

  beforeNavigate(({ to }) => {
    navigationPending = Boolean(to && to.url.href !== page.url.href);
    pendingDestination = navigationPending && to ? to.url.pathname : '';
    const preserveMainnetAdmission = Boolean(
      defaultConfig.network === 'mainnet' && to && walletSetupRoutes.has(to.url.pathname)
    );
    void walletService.cancelHardwareOperations(preserveMainnetAdmission);
    if (navigationPending && to && routeCancelsSync(to.url.pathname) && !isPrototypeWallet)
      void walletService.cancelSync().catch(() => undefined);
  });

  afterNavigate(({ from }) => {
    navigationPending = false;
    pendingDestination = '';
    const previousPath = from?.url?.pathname;
    // Routine navigation must not repeat registry and setup-draft reads that
    // every destination performs independently. Refresh only after a flow that
    // can actually mutate those shell-level records.
    const profileRefresh =
      previousPath && profileMutatingRoutes.has(previousPath)
        ? refreshProfiles()
        : Promise.resolve();
    if (previousPath === '/multisig/new') void refreshSetupDraft();
    if (previousPath === '/unlock') {
      void walletService
        .session()
        .then((selection) => (selectedWalletUnlocked = selection.unlocked))
        .catch(() => (selectedWalletUnlocked = false));
    }
    if (!liveSync) return;
    if (previousPath && profileMutatingRoutes.has(previousPath)) {
      void resumeAfterWalletCreation(profileRefresh);
      return;
    }
    if (isPrototypeWallet) return;
    if (syncPausedRoute) liveSync.stop();
    else if (automaticSyncPauseCount === 0) {
      liveSync.start();
      // Unlock is an explicit foreground wake-up. Start the selected wallet's
      // first or routine sync even when the user returns to Settings instead
      // of waiting for Overview to mount or for the steady-state interval.
      // A genuine credential unlock should refresh immediately. Wallet selection
      // can also leave /unlock when the target wallet already has a live session;
      // in that case let its cached Overview paint before the normal sync timer.
      if (previousPath === '/unlock' && !walletSelectionTask) void liveSync.runNow();
    }
  });

  async function selectWallet(walletId: string) {
    if (shortcutLockPending || walletSelectionTask || !walletId) return;
    if (walletId === selectedWalletId) {
      if (!selectedWalletUnlocked && page.url.pathname !== '/unlock') await goto('/unlock');
      return;
    }
    const task = performWalletSelection(walletId);
    walletSelectionTask = task;
    try {
      await task;
    } finally {
      if (walletSelectionTask === task) walletSelectionTask = undefined;
    }
  }

  async function performWalletSelection(walletId: string) {
    const resumeAutomaticSync = !isPrototypeWallet && !syncPausedRoute;
    // Stop and cancel automatic network work before native selection. The
    // target route must get the wallet-operation lock for its cached snapshot
    // before background sync is scheduled again.
    liveSync?.stop();
    ++profileReadGeneration;
    try {
      await walletService.cancelSync().catch(() => undefined);
      await walletService.cancelHardwareOperations();
      const selection = await walletService.selectWallet(walletId);
      // Change the routed wallet context only after Rust has atomically selected
      // the same profile. The keyed route then reloads against one wallet kind.
      selectedWalletId = selection.profile.id;
      selectedWalletUnlocked = selection.unlocked;
      await goto(selection.unlocked ? '/' : '/unlock');
      if (!isPrototypeWallet && selection.unlocked && automaticSyncPauseCount === 0) {
        liveSync?.restart();
      } else {
        liveSync?.stop();
      }
    } catch (cause) {
      if (resumeAutomaticSync && !shortcutLockPending) liveSync?.restart();
      toast({
        title: 'Wallet not switched',
        description: localizedError(cause, $locale, 'Could not select this wallet.'),
        tone: 'danger'
      });
    }
  }
  function beginHardwareReview() {
    activeHardwareReviews += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      activeHardwareReviews = Math.max(0, activeHardwareReviews - 1);
    };
  }
  function requestUnlockSync(walletId: string) {
    pendingUnlockSyncWalletId = walletId;
  }
  function consumeUnlockSync(walletId: string) {
    if (pendingUnlockSyncWalletId !== walletId) return false;
    pendingUnlockSyncWalletId = null;
    return true;
  }
  async function pauseAutomaticSync() {
    automaticSyncPauseCount += 1;
    if (!automaticSyncPauseTask) {
      const task = liveSync?.stopAndWait() ?? Promise.resolve();
      automaticSyncPauseTask = task;
      try {
        await task;
      } finally {
        if (automaticSyncPauseTask === task) automaticSyncPauseTask = undefined;
      }
      return;
    }
    await automaticSyncPauseTask;
  }
  function resumeAutomaticSync() {
    automaticSyncPauseCount = Math.max(0, automaticSyncPauseCount - 1);
    if (automaticSyncPauseCount === 0 && !isPrototypeWallet && !syncPausedRoute) liveSync?.start();
  }
  provideWalletShellContext({
    profiles: () => profiles,
    selectedWalletId: () => selectedWalletId,
    refreshProfiles,
    selectWallet,
    beginHardwareReview,
    requestUnlockSync,
    requestInitialHistoryApproval,
    consumeUnlockSync,
    pauseAutomaticSync,
    resumeAutomaticSync
  });

  async function resolveStartupRoute() {
    startupState = 'checking';
    startupFailure = '';
    checkingRuntime = true;
    try {
      const runtime = await walletService.runtimePlatform();
      if (
        !runtime.network ||
        !runtime.version ||
        !runtime.commit ||
        !['regtest', 'signet', 'testnet4', 'mainnet'].includes(runtime.network)
      ) {
        startupFailure = translate(
          $locale,
          'This Groot app contains mismatched components. Rebuild and reinstall the native app.'
        );
        throw new Error('incomplete runtime identity');
      }
      runtimeIdentity = runtime;
      mobileRuntime = runtime.mobile;
      if (mobileRuntime && document.visibilityState !== 'visible') {
        backgroundLockRequired = true;
        await enforceMobileBackgroundLock();
        return;
      }
      if (runtime.networkSwitching !== networkSwitchingBuild) {
        startupFailure = translate(
          $locale,
          'The native and web app builds do not match. Restart Groot with the correct build.'
        );
        throw new Error('native/web build mismatch');
      }
      if (runtime.networkSwitching) {
        applyRuntimeNetwork(runtime.network);
        applyMultisigNetwork(runtime.network);
      }
      if (runtime.network !== defaultConfig.network || runtime.version !== APP_VERSION) {
        startupFailure = translate(
          $locale,
          'The native and web app builds do not match. Restart Groot with the correct build.'
        );
        throw new Error('native/web build mismatch');
      }
      checkingRuntime = false;
      await refreshSetupDraft();
      if (!(await walletService.exists())) {
        if (!diagnosticsRoute) await goto('/welcome');
        startupState = 'ready';
        return;
      }
      await refreshProfiles();
      const selection = await walletService.session();
      selectedWalletUnlocked = selection.unlocked;
      if (
        !selection.unlocked &&
        !onboardingRoute &&
        !lockedRoute &&
        !settingsRoute &&
        !diagnosticsRoute
      ) {
        await goto('/unlock');
      } else if (selection.unlocked && lockedRoute) {
        await goto('/');
      }
      startupState = 'ready';
      if (!syncPausedRoute && !isPrototypeWallet && automaticSyncPauseCount === 0) {
        liveSync?.start();
        void liveSync?.runNow();
      }
    } catch {
      if (!startupFailure) {
        startupFailure = translate(
          $locale,
          checkingRuntime
            ? 'Groot could not verify this app build. Rebuild and reinstall the native app.'
            : 'Groot could not verify the wallet lock state.'
        );
      }
      startupState = 'failed';
    }
  }

  function centerMobileField(event: FocusEvent) {
    if (!mobileRuntime) return;
    const field = event.target;
    if (!(
      field instanceof HTMLInputElement ||
      field instanceof HTMLTextAreaElement ||
      field instanceof HTMLSelectElement
    ))
      return;
    // Let iOS finish resizing the visual viewport for the keyboard, then perform
    // one centering move. Competing smooth-scroll timers can otherwise move the
    // field into view and immediately pull it away again.
    setTimeout(() => {
      if (document.activeElement !== field) return;
      field.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    }, 320);
  }

  async function enforceMobileBackgroundLock() {
    if (!mobileRuntime || !backgroundLockRequired) return;
    startupState = 'checking';
    liveSync?.stop();
    try {
      await Promise.allSettled([
        walletService.cancelHardwareOperations(),
        walletService.cancelSync()
      ]);
      await walletService.lockAll();
      backgroundLockRequired = false;
      await goto('/unlock');
      startupState = 'ready';
    } catch {
      startupState = 'failed';
    }
  }

  onMount(() => {
    initDenomination();
    commandModifier = usesCommandModifier(navigator.platform);
    desktopPlatform = isDesktopPlatform(
      navigator.platform,
      navigator.userAgent,
      navigator.maxTouchPoints
    );
    if (desktopPlatform) currentZoom = initZoom();
    const unsubscribe = walletService.subscribe((event) => {
      const presentation = walletEventPresentation(event, $locale, $denomination, goto);
      if (presentation) toast(presentation);
      if (event.type === 'wallet_profile_updated') {
        const known = profiles.some((profile) => profile.id === event.profile.id);
        profiles = known
          ? profiles.map((profile) => (profile.id === event.profile.id ? event.profile : profile))
          : [...profiles, event.profile];
        selectedWalletId = event.profile.id;
      }
    });
    liveSync = createLiveSync(
      walletService,
      () => selectedProfile?.kind ?? null,
      LIVE_SYNC_INTERVAL_MS,
      (cause) => {
        if (cause instanceof WalletError && cause.code === 'initial_scan_required')
          requestInitialHistoryApproval();
        if (cause instanceof WalletError && cause.code === 'wallet_locked') {
          liveSync?.stop();
          void goto('/unlock');
        }
      }
    );
    sessionMonitor = createSessionMonitor(
      walletService,
      async (selection) => {
        if (
          selection.profile.id !== selectedWalletId ||
          lockedRoute ||
          settingsRoute ||
          diagnosticsRoute
        )
          return;
        selectedWalletUnlocked = false;
        liveSync?.stop();
        await walletService.cancelSync().catch(() => undefined);
        await goto('/unlock');
      },
      () =>
        startupState !== 'ready' ||
        isPrototypeWallet ||
        onboardingRoute ||
        lockedRoute ||
        navigationPending ||
        !selectedWalletId ||
        activeHardwareReviews > 0
    );
    sessionMonitor.start();
    const wakeWhenVisible = () => {
      if (document.visibilityState !== 'visible') {
        if (mobileRuntime) {
          backgroundLockRequired = true;
          void enforceMobileBackgroundLock();
        }
        return;
      }
      if (backgroundLockRequired) void enforceMobileBackgroundLock();
      else void liveSync?.runNow();
    };
    document.addEventListener('visibilitychange', wakeWhenVisible);
    document.addEventListener('focusin', centerMobileField);
    window.addEventListener('keydown', handleKeyboardShortcut);
    void resolveStartupRoute();
    return () => {
      unsubscribe();
      liveSync?.stop();
      sessionMonitor?.stop();
      document.removeEventListener('visibilitychange', wakeWhenVisible);
      document.removeEventListener('focusin', centerMobileField);
      window.removeEventListener('keydown', handleKeyboardShortcut);
    };
  });
</script>

<div
  class="app-shell"
  data-sveltekit-preload-code="viewport"
  data-sveltekit-preload-data="hover"
  class:onboarding-shell={onboardingRoute}
  class:mobile-actions-visible={showQuickActions}
  class:prototype-shell={isPrototypeWallet}
  class:locked-setup-visible={showSetupResume && lockedRoute}
  class:navigation-pending={navigationPending}
>
  {#if startupState !== 'ready'}
    <div class="startup-gate" role="status" aria-live="polite">
      <BrandLockup animated />
      {#if startupState === 'failed'}
        <p>{startupFailure}</p>
        <button
          class="button secondary"
          onclick={() =>
            backgroundLockRequired ? enforceMobileBackgroundLock() : resolveStartupRoute()}
          >{translate($locale, 'Retry')}</button
        >
      {:else}
        <span class="sr-only">{translate($locale, 'Checking wallet lock state')}</span>
      {/if}
    </div>
  {:else}
    <div class="navigation-progress" aria-hidden="true"></div>
    <aside class="sidebar">
      <a class="brand" href="/" aria-label={translate($locale, 'Groot home')}><BrandLockup /></a>
      {#if profiles.length}
        <div class="wallet-switcher">
          <span class="wallet-switcher-label"
            ><span>{t('wallets', $locale)}</span>
            <strong>{formatWalletCount(profiles.length, $locale)}</strong></span
          >
          <WalletProfileList {profiles} {selectedWalletId} onselect={selectWallet} compact />
          <a href="/welcome?add=1"><Plus size={14} />{t('addWallet', $locale)}</a>
        </div>
      {/if}
      {#if !restrictedUtilityRoute}
        <nav class="side-nav">
          {#each visibleNav as item}
            <a
              href={item.href}
              class:active={active(item.href)}
              aria-current={active(item.href) ? 'page' : undefined}
              ><item.icon size={17} /><span>{t(item.label, $locale)}</span></a
            >
          {/each}
        </nav>
      {/if}
      <div class="sidebar-bottom">
        <a
          href="/settings"
          class:active={active('/settings')}
          aria-current={active('/settings') ? 'page' : undefined}
          ><Settings size={17} /><span>{t('settings', $locale)}</span></a
        >
        <div class="preference-toggles">
          <ThemeToggle /><DiscreetModeToggle />
        </div>
        <NetworkStatus network={defaultConfig.network} locked={walletLocked} />
        <BuildIdentity runtime={runtimeIdentity} placement="sidebar" />
      </div>
    </aside>

    <a
      class="mobile-brand"
      class:locked-brand={lockedRoute}
      href="/"
      aria-label={translate($locale, 'Groot home')}><BrandLockup /></a
    >

    <main class="main">
      {#if isPrototypeWallet}<div class="demo-banner" role="status">
          <strong>{translate($locale, 'Interactive prototype')}</strong><span
            >{translate($locale, 'Dummy data only · Never use real funds or recovery words')}</span
          >
        </div>{/if}
      {#if showSetupResume && multisigSetupDraft}
        <ResumeSetupNotice
          title={translate(
            $locale,
            lockedRoute
              ? 'Multisig wallet setup'
              : multisigSetupDraft.name.trim() || 'Multisig wallet setup'
          )}
          detail={translate(
            $locale,
            lockedRoute
              ? 'Wallet creation in progress'
              : `${multisigSetupStageLabel(multisigSetupDraft.stage)} · ${multisigSetupDraft.cosigners.length} of ${multisigSetupSignerTarget(multisigSetupDraft)} signers added`
          )}
          href="/multisig/new"
          locked={lockedRoute}
          ondiscard={() => {
            discardSetupError = '';
            discardSetupOpen = true;
          }}
        />
      {/if}
      {#if navigationPending && pendingDestination === '/diagnostics'}
        <div class="page diagnostics-navigation-skeleton">
          <WalletSkeleton variant="diagnostics" count={4} header />
        </div>
      {:else}
        {#key `${selectedWalletId ?? 'none'}:${page.url.pathname}`}
          <div class="route-transition" in:fade={{ duration: 180 }}>
            {@render children?.()}
          </div>
        {/key}
      {/if}
    </main>

    {#if onboardingRoute}<BuildIdentity runtime={runtimeIdentity} placement="onboarding" />{/if}

    {#if !restrictedUtilityRoute && !onboardingRoute && !mobileSetupRoute}<nav
        class="mobile-nav"
        class:policy-nav={policyContext}
      >
        {#each mobileItems as item}
          <a
            href={item.href}
            class:active={active(item.href)}
            aria-current={active(item.href) ? 'page' : undefined}
            ><item.icon size={20} /><span>{t(item.label, $locale)}</span></a
          >
        {/each}
        <a
          href="/settings"
          class:active={active('/settings')}
          aria-current={active('/settings') ? 'page' : undefined}
          ><Settings size={20} /><span>{t('settings', $locale)}</span></a
        >
      </nav>{/if}

    {#if restrictedUtilityRoute}<div class="locked-mobile-utilities">
        {#if lockedRoute}<a
            class="locked-settings-link"
            href="/settings"
            aria-label={t('settings', $locale)}><Settings size={20} /></a
          >{/if}<ThemeToggle /><DiscreetModeToggle /><NetworkStatus
          network={defaultConfig.network}
          locked={walletLocked}
        />
      </div>{/if}

    {#if showQuickActions}
      <div class="mobile-actions">
        <a class="mobile-action secondary" href={receiveHref}
          ><ArrowDownToLine size={18} />{t('receive', $locale)}</a
        >
        <a class="mobile-action primary" href={sendHref}
          ><ArrowUpFromLine size={18} />{t('send', $locale)}</a
        >
      </div>
    {/if}
    <DiscardMultisigSetupModal
      open={discardSetupOpen}
      busy={discardingSetup}
      error={discardSetupError}
      onclose={() => {
        discardSetupOpen = false;
        discardSetupError = '';
      }}
      onconfirm={discardSetupDraft}
    />
    {#if !initialApprovalWalletId}<ToastHost />{/if}
  {/if}
</div>

<Modal
  open={Boolean(initialApprovalWalletId) &&
    selectedWalletId === initialApprovalWalletId &&
    !walletLocked}
  title={translate($locale, 'Approve wallet-history scan')}
  description={translate(
    $locale,
    'Use Groot’s network for simplicity and speed, or set up your own node for better privacy.'
  )}
  onclose={() => {
    void declineInitialHistoryScan();
  }}
>
  <div class="modal-form">
    <WarningNotice
      title={translate($locale, 'Wallet privacy')}
      body={translate(
        $locale,
        initialApprovalManaged
          ? 'Groot’s network can see your wallet activity. Your keys stay on your device.'
          : 'Your own node checks your wallet history. Your keys stay on your device.'
      )}
    />
    {#if initialApprovalError}<WarningNotice
        tone="danger"
        icon
        role="alert"
        title={translate($locale, 'Scan could not start')}
        body={initialApprovalError}
      />{/if}
  </div>
  <div class="modal-footer">
    <Button variant="secondary" disabled={initialApprovalBusy} onclick={declineInitialHistoryScan}
      >{translate($locale, 'Set up my own node')}</Button
    ><Button
      loading={initialApprovalBusy}
      loadingLabel={translate($locale, 'Starting scan…')}
      onclick={approveInitialHistoryScan}>{translate($locale, 'Approve and scan')}</Button
    >
  </div>
</Modal>
