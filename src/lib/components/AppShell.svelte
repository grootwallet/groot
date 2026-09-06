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
  import WalletProfileList from './WalletProfileList.svelte';
  import NetworkStatus from './NetworkStatus.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import DiscreetModeToggle from './DiscreetModeToggle.svelte';
  import ResumeSetupNotice from './ResumeSetupNotice.svelte';
  import { APP_VERSION, defaultConfig } from '$lib/config';
  import { onMount } from 'svelte';
  import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
  import { isPrototypeWallet, walletService, WalletError } from '$lib/wallet';
  import { createLiveSync, type LiveSyncController } from '$lib/wallet/live-sync';
  import { createSessionMonitor, type SessionMonitorController } from '$lib/wallet/session-monitor';
  import { toast } from '$lib/stores/toasts';
  import { denomination, initDenomination } from '$lib/denomination';
  import { fade } from 'svelte/transition';
  import type { MultisigSetupDraft, RuntimePlatform, WalletProfile } from '$lib/wallet/contracts';
  import { formatWalletCount, locale, t, type MessageKey } from '$lib/i18n';
  import { provideWalletShellContext } from '$lib/wallet/shell-context';
  import { multisigSetupSignerTarget, multisigSetupStageLabel } from '$lib/wallet/multisig-setup';
  import { walletEventPresentation } from '$lib/wallet/notification-policy';
  import {
    isDesktopPlatform,
    matchKeyboardShortcut,
    usesCommandModifier
  } from '$lib/keyboard-shortcuts';
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
  const foregroundWalletRoutes = new Set([
    '/receive',
    '/send',
    '/multisig/receive',
    '/multisig/send'
  ]);
  const routeCancelsSync = (pathname: string) =>
    walletSetupRoutes.has(pathname) ||
    pathname === '/unlock' ||
    pathname === '/settings' ||
    pathname === '/diagnostics' ||
    foregroundWalletRoutes.has(pathname);
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
  let sessionMonitor: SessionMonitorController | undefined;
  let activeHardwareReviews = 0;
  let startupState = $state<'checking' | 'ready' | 'failed'>('checking');
  const startupStartedAt = Date.now();
  const minimumStartupGateMs = isPrototypeWallet ? 0 : 1_800;
  let navigationPending = $state(false);
  let commandModifier = false;
  let desktopPlatform = false;
  let shortcutLockPending = false;
  let walletSelectionTask: Promise<void> | undefined;
  let pendingUnlockSyncWalletId: string | null = null;
  let runtimeIdentity = $state<RuntimePlatform | null>(null);
  let startupFailure = $state('');
  let selectedProfile = $derived(profiles.find((wallet) => wallet.id === selectedWalletId));
  let policyContext = $derived(
    selectedProfile?.kind === 'multisig' || page.url.pathname.startsWith('/multisig')
  );
  let visibleNav = $derived(policyContext ? nav : nav.slice(0, 3));
  let mobileItems = $derived(policyContext ? nav : nav.slice(0, 3));
  let onboardingRoute = $derived(walletSetupRoutes.has(page.url.pathname));
  let lockedRoute = $derived(page.url.pathname === '/unlock');
  let diagnosticsRoute = $derived(page.url.pathname === '/diagnostics');
  let restrictedUtilityRoute = $derived(
    lockedRoute || (diagnosticsRoute && !selectedWalletUnlocked)
  );
  let syncPausedRoute = $derived(
    onboardingRoute ||
      lockedRoute ||
      diagnosticsRoute ||
      page.url.pathname === '/settings' ||
      foregroundWalletRoutes.has(page.url.pathname)
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
  function handleKeyboardShortcut(event: KeyboardEvent) {
    const primaryModifier = commandModifier
      ? event.metaKey && !event.ctrlKey
      : event.ctrlKey && !event.metaKey;
    const target = event.target as HTMLElement | null;
    if (
      startupState !== 'ready' ||
      onboardingRoute ||
      lockedRoute ||
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
    '/multisig/delete'
  ]);

  beforeNavigate(({ to }) => {
    navigationPending = Boolean(to && to.url.href !== page.url.href);
    const preserveMainnetAdmission = Boolean(
      defaultConfig.network === 'mainnet' && to && walletSetupRoutes.has(to.url.pathname)
    );
    void walletService.cancelHardwareOperations(preserveMainnetAdmission);
    if (navigationPending && to && routeCancelsSync(to.url.pathname) && !isPrototypeWallet)
      void walletService.cancelSync().catch(() => undefined);
    if (to && foregroundWalletRoutes.has(to.url.pathname)) liveSync?.stop();
  });

  afterNavigate(({ from }) => {
    navigationPending = false;
    const previousPath = from?.url?.pathname;
    // Routine navigation must not repeat registry and setup-draft reads that
    // every destination performs independently. Refresh only after a flow that
    // can actually mutate those shell-level records.
    if (previousPath && profileMutatingRoutes.has(previousPath)) void refreshProfiles();
    if (previousPath === '/multisig/new') void refreshSetupDraft();
    if (previousPath === '/unlock') {
      void walletService
        .session()
        .then((selection) => (selectedWalletUnlocked = selection.unlocked))
        .catch(() => (selectedWalletUnlocked = false));
    }
    if (!liveSync || isPrototypeWallet) return;
    if (syncPausedRoute) liveSync.stop();
    else liveSync.start();
  });

  async function selectWallet(walletId: string) {
    if (shortcutLockPending || walletSelectionTask || !walletId || walletId === selectedWalletId)
      return;
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
      await walletService.cancelHardwareOperations();
      const selection = await walletService.selectWallet(walletId);
      // Change the routed wallet context only after Rust has atomically selected
      // the same profile. The keyed route then reloads against one wallet kind.
      selectedWalletId = selection.profile.id;
      selectedWalletUnlocked = selection.unlocked;
      await goto(selection.unlocked ? '/' : '/unlock');
      if (!isPrototypeWallet && selection.unlocked) {
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
    await liveSync?.stopAndWait();
  }
  function resumeAutomaticSync() {
    if (!isPrototypeWallet && !syncPausedRoute) liveSync?.start();
  }
  provideWalletShellContext({
    profiles: () => profiles,
    selectedWalletId: () => selectedWalletId,
    refreshProfiles,
    selectWallet,
    beginHardwareReview,
    requestUnlockSync,
    consumeUnlockSync,
    pauseAutomaticSync,
    resumeAutomaticSync
  });

  async function resolveStartupRoute() {
    startupState = 'checking';
    startupFailure = '';
    try {
      const runtime = await walletService.runtimePlatform();
      runtimeIdentity = runtime;
      if (runtime.network !== defaultConfig.network || runtime.version !== APP_VERSION) {
        startupFailure = translate(
          $locale,
          'The native and web app builds do not match. Restart Groot with the correct build.'
        );
        throw new Error('native/web build mismatch');
      }
      await refreshSetupDraft();
      if (!(await walletService.exists())) {
        if (!diagnosticsRoute) await goto('/welcome');
        await holdStartupGate();
        startupState = 'ready';
        return;
      }
      await refreshProfiles();
      const selection = await walletService.session();
      selectedWalletUnlocked = selection.unlocked;
      if (!selection.unlocked && !onboardingRoute && !lockedRoute && !diagnosticsRoute) {
        await goto('/unlock');
      } else if (selection.unlocked && lockedRoute) {
        await goto('/');
      }
      await holdStartupGate();
      startupState = 'ready';
      if (!syncPausedRoute && !isPrototypeWallet) liveSync?.start();
    } catch {
      if (!startupFailure)
        startupFailure = translate($locale, 'Groot could not verify the wallet lock state.');
      startupState = 'failed';
    }
  }

  async function holdStartupGate() {
    const remaining = minimumStartupGateMs - (Date.now() - startupStartedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  }

  onMount(() => {
    initDenomination();
    commandModifier = usesCommandModifier(navigator.platform);
    desktopPlatform = isDesktopPlatform(
      navigator.platform,
      navigator.userAgent,
      navigator.maxTouchPoints
    );
    const unsubscribe = walletService.subscribe((event) => {
      const presentation = walletEventPresentation(event, $locale, $denomination, goto);
      if (presentation) toast(presentation);
      if (event.type === 'wallet_profile_updated')
        profiles = profiles.map((profile) =>
          profile.id === event.profile.id ? event.profile : profile
        );
    });
    liveSync = createLiveSync(walletService, 10_000, (cause) => {
      if (cause instanceof WalletError && cause.code === 'wallet_locked') {
        liveSync?.stop();
        void goto('/unlock');
      }
    });
    sessionMonitor = createSessionMonitor(
      walletService,
      async (selection) => {
        if (selection.profile.id !== selectedWalletId || lockedRoute) return;
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
      if (document.visibilityState === 'visible') void liveSync?.runNow();
    };
    document.addEventListener('visibilitychange', wakeWhenVisible);
    window.addEventListener('keydown', handleKeyboardShortcut);
    void resolveStartupRoute();
    return () => {
      unsubscribe();
      liveSync?.stop();
      sessionMonitor?.stop();
      document.removeEventListener('visibilitychange', wakeWhenVisible);
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
        <button class="button secondary" onclick={resolveStartupRoute}
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
        {#if !restrictedUtilityRoute}<a
            href="/settings"
            class:active={active('/settings')}
            aria-current={active('/settings') ? 'page' : undefined}
            ><Settings size={17} /><span>{t('settings', $locale)}</span></a
          >{/if}
        <div class="preference-toggles">
          <ThemeToggle /><DiscreetModeToggle />
        </div>
        <NetworkStatus network={defaultConfig.network} locked={restrictedUtilityRoute} />
        <BuildIdentity runtime={runtimeIdentity} placement="sidebar" />
      </div>
    </aside>

    <a class="mobile-brand" href="/" aria-label={translate($locale, 'Groot home')}
      ><BrandLockup /></a
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
      {#key `${selectedWalletId ?? 'none'}:${page.url.pathname}`}
        <div class="route-transition" in:fade={{ duration: 180 }}>
          {@render children?.()}
        </div>
      {/key}
    </main>

    {#if onboardingRoute}<BuildIdentity runtime={runtimeIdentity} placement="onboarding" />{/if}

    {#if !restrictedUtilityRoute}<nav class="mobile-nav" class:policy-nav={policyContext}>
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
        <ThemeToggle /><DiscreetModeToggle /><NetworkStatus
          network={defaultConfig.network}
          locked
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
    <ToastHost />
  {/if}
</div>
