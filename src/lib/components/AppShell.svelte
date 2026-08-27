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
  import DiscardMultisigSetupModal from './DiscardMultisigSetupModal.svelte';
  import ToastHost from './ToastHost.svelte';
  import WalletProfileList from './WalletProfileList.svelte';
  import NetworkStatus from './NetworkStatus.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import DiscreetModeToggle from './DiscreetModeToggle.svelte';
  import ResumeSetupNotice from './ResumeSetupNotice.svelte';
  import { defaultConfig } from '$lib/config';
  import { onMount } from 'svelte';
  import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
  import { isPrototypeWallet, walletService, WalletError } from '$lib/wallet';
  import { createLiveSync, type LiveSyncController } from '$lib/wallet/live-sync';
  import { createSessionMonitor, type SessionMonitorController } from '$lib/wallet/session-monitor';
  import { toast } from '$lib/stores/toasts';
  import { denomination, formatAmount, initDenomination } from '$lib/denomination';
  import { fade } from 'svelte/transition';
  import type { MultisigSetupDraft, RuntimePlatform, WalletProfile } from '$lib/wallet/contracts';
  import { formatWalletCount, locale, t, type MessageKey } from '$lib/i18n';
  import { provideWalletShellContext } from '$lib/wallet/shell-context';
  import { multisigSetupSignerTarget, multisigSetupStageLabel } from '$lib/wallet/multisig-setup';
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
    foregroundWalletRoutes.has(pathname);
  const active = (href: string) =>
    href === '/multisig'
      ? page.url.pathname === href ||
        page.url.pathname.startsWith('/multisig/policy') ||
        page.url.pathname.startsWith('/multisig/backup')
      : page.url.pathname === href;
  let profiles = $state<WalletProfile[]>([]);
  let selectedWalletId = $state<string | null>(null);
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
  let mobileRuntime = false;
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
    page.url.pathname === '/mobile/pair' || page.url.pathname === '/mobile/watch'
  );
  let lockedRoute = $derived(page.url.pathname === '/unlock');
  let syncPausedRoute = $derived(
    onboardingRoute ||
      mobileSetupRoute ||
      lockedRoute ||
      page.url.pathname === '/settings' ||
      foregroundWalletRoutes.has(page.url.pathname)
  );
  const showQuickActions = $derived(
    !lockedRoute && (page.url.pathname === '/' || page.url.pathname === '/coins')
  );
  const receiveHref = $derived(
    selectedProfile?.kind === 'multisig' ? '/multisig/receive' : '/receive'
  );
  const sendHref = $derived(selectedProfile?.kind === 'multisig' ? '/multisig/send' : '/send');
  const showSetupResume = $derived(Boolean(multisigSetupDraft) && !onboardingRoute);

  function handleKeyboardShortcut(event: KeyboardEvent) {
    const primaryModifier = commandModifier
      ? event.metaKey && !event.ctrlKey
      : event.ctrlKey && !event.metaKey;
    const target = event.target as HTMLElement | null;
    if (
      startupState !== 'ready' ||
      onboardingRoute ||
      lockedRoute ||
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
    void walletService.cancelHardwareOperations();
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
  provideWalletShellContext({
    profiles: () => profiles,
    selectedWalletId: () => selectedWalletId,
    refreshProfiles,
    selectWallet,
    beginHardwareReview
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
        !['regtest', 'signet', 'testnet4'].includes(runtime.network)
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
      if (runtime.network !== defaultConfig.network) {
        startupFailure = translate(
          $locale,
          'The native and web network builds do not match. Restart Groot with the correct network build.'
        );
        throw new Error('network build mismatch');
      }
      checkingRuntime = false;
      await refreshSetupDraft();
      if (!(await walletService.exists())) {
        await goto('/welcome');
        await holdStartupGate();
        startupState = 'ready';
        return;
      }
      await refreshProfiles();
      const selection = await walletService.session();
      if (!selection.unlocked && !onboardingRoute && !lockedRoute) {
        await goto('/unlock');
      } else if (selection.unlocked && lockedRoute) {
        await goto('/');
      }
      await holdStartupGate();
      startupState = 'ready';
      if (!syncPausedRoute && !isPrototypeWallet) liveSync?.start();
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

  async function holdStartupGate() {
    const remaining = minimumStartupGateMs - (Date.now() - startupStartedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
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
        walletService.cancelSync(),
        walletService.cancelFullRescan()
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
    const unsubscribe = walletService.subscribe((event) => {
      if (event.type === 'payment_received')
        toast({
          title: 'Bitcoin received',
          description: translate($locale, 'Received {amount} {unit} · Balance {balance} {unit}', {
            amount: formatAmount(event.amount, $denomination),
            balance: formatAmount(event.balance, $denomination),
            unit: $denomination === 'btc' ? 'BTC' : 'sats'
          }),
          tone: 'success'
        });
      if (event.type === 'payment_received_confirmed')
        toast({
          title: 'Bitcoin received',
          description: translate(
            $locale,
            'Received {amount} {unit} · First confirmation · Balance {balance} {unit}',
            {
              amount: formatAmount(event.amount, $denomination),
              balance: formatAmount(event.balance, $denomination),
              unit: $denomination === 'btc' ? 'BTC' : 'sats'
            }
          ),
          tone: 'success'
        });
      if (event.type === 'first_confirmation')
        toast({
          title: 'First confirmation',
          description: translate($locale, 'Transaction confirmed · Balance {balance} {unit}', {
            balance: formatAmount(event.balance, $denomination),
            unit: $denomination === 'btc' ? 'BTC' : 'sats'
          }),
          tone: 'success'
        });
      if (event.type === 'transaction_broadcast')
        toast({
          title: 'Transaction broadcast',
          description: translate($locale, 'Remaining wallet balance: {balance} {unit}', {
            balance: formatAmount(event.balance, $denomination),
            unit: $denomination === 'btc' ? 'BTC' : 'sats'
          }),
          tone: 'success'
        });
      if (event.type === 'policy_approaching_maturity')
        toast({
          title: translate($locale, '{key} available soon', {
            key: translate(
              $locale,
              event.policyType === 'inheritance' ? 'Heir key' : 'Recovery key'
            )
          }),
          description: translate($locale, '{count} blocks remain before it can spend one coin.', {
            count: event.remainingBlocks
          }),
          action: {
            label: translate($locale, 'View coin'),
            run: () => goto(`/coins?coin=${encodeURIComponent(event.outpoint)}`)
          }
        });
      if (event.type === 'policy_mature')
        toast({
          title: translate($locale, '{key} can now spend a coin', {
            key: translate(
              $locale,
              event.policyType === 'inheritance' ? 'Heir key' : 'Recovery key'
            )
          }),
          description: translate(
            $locale,
            'Your normal 2-of-3 keys still work. No action is required.'
          ),
          action: {
            label: translate($locale, 'View options'),
            run: () => goto(`/coins?coin=${encodeURIComponent(event.outpoint)}`)
          }
        });
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
      {#if !lockedRoute}
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
        {#if !lockedRoute}<a
            href="/settings"
            class:active={active('/settings')}
            aria-current={active('/settings') ? 'page' : undefined}
            ><Settings size={17} /><span>{t('settings', $locale)}</span></a
          >{/if}
        <div class="preference-toggles">
          <ThemeToggle /><DiscreetModeToggle />
        </div>
        <NetworkStatus
          network={runtimeIdentity?.network ?? defaultConfig.network}
          locked={lockedRoute}
        />
        {#if runtimeIdentity}<small class="sidebar-build-identity"
            >{translate($locale, 'Groot v{version} · {commit}', {
              version: runtimeIdentity.version,
              commit: runtimeIdentity.commit
            })}</small
          >{/if}
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

    {#if !lockedRoute && !mobileSetupRoute}<nav class="mobile-nav" class:policy-nav={policyContext}>
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

    {#if lockedRoute}<div class="locked-mobile-utilities">
        <ThemeToggle /><DiscreetModeToggle /><NetworkStatus
          network={runtimeIdentity?.network ?? defaultConfig.network}
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
