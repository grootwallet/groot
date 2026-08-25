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
  import { toast } from '$lib/stores/toasts';
  import { denomination, formatAmount, initDenomination } from '$lib/denomination';
  import { fade } from 'svelte/transition';
  import type { MultisigSetupDraft, WalletProfile } from '$lib/wallet/contracts';
  import { formatWalletCount, locale, t, type MessageKey } from '$lib/i18n';
  import { provideWalletShellContext } from '$lib/wallet/shell-context';
  import { multisigSetupSignerTarget, multisigSetupStageLabel } from '$lib/wallet/multisig-setup';
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
  let startupState = $state<'checking' | 'ready' | 'failed'>('checking');
  let navigationPending = $state(false);
  let selectedProfile = $derived(profiles.find((wallet) => wallet.id === selectedWalletId));
  let policyContext = $derived(
    selectedProfile?.kind === 'multisig' || page.url.pathname.startsWith('/multisig')
  );
  let visibleNav = $derived(policyContext ? nav : nav.slice(0, 3));
  let mobileItems = $derived(policyContext ? nav : nav.slice(0, 3));
  let onboardingRoute = $derived(walletSetupRoutes.has(page.url.pathname));
  let lockedRoute = $derived(page.url.pathname === '/unlock');
  let syncPausedRoute = $derived(
    onboardingRoute ||
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
    if (!walletId || walletId === selectedWalletId) return;
    await walletService.cancelHardwareOperations();
    const previousWalletId = selectedWalletId;
    ++profileReadGeneration;
    // Reflect the explicit choice immediately. The trusted adapter remains the
    // authority, and a failed selection restores the prior shell state.
    selectedWalletId = walletId;
    try {
      const selection = await walletService.selectWallet(walletId);
      selectedWalletId = selection.profile.id;
      await goto(selection.unlocked ? '/' : '/unlock');
      if (!isPrototypeWallet && selection.unlocked) {
        liveSync?.restart();
      } else {
        liveSync?.stop();
      }
    } catch (cause) {
      if (selectedWalletId === walletId) selectedWalletId = previousWalletId;
      toast({
        title: 'Wallet not switched',
        description: localizedError(cause, $locale, 'Could not select this wallet.'),
        tone: 'danger'
      });
    }
  }
  provideWalletShellContext({
    profiles: () => profiles,
    selectedWalletId: () => selectedWalletId,
    refreshProfiles,
    selectWallet
  });

  async function resolveStartupRoute() {
    startupState = 'checking';
    try {
      await refreshSetupDraft();
      if (!(await walletService.exists())) {
        await goto('/welcome');
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
      startupState = 'ready';
      if (!syncPausedRoute && !isPrototypeWallet) liveSync?.start();
    } catch {
      startupState = 'failed';
    }
  }

  onMount(() => {
    initDenomination();
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
          title: translate($locale, '{key} unlocks soon', {
            key: translate(
              $locale,
              event.policyType === 'inheritance' ? 'Heir key' : 'Recovery key'
            )
          }),
          description: translate($locale, '{count} blocks remain before it can spend one coin.', {
            count: event.remainingBlocks
          })
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
            'Your normal 2-of-3 keys still work. Review the coin or renew its protection.'
          )
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
    const wakeWhenVisible = () => {
      if (document.visibilityState === 'visible') void liveSync?.runNow();
    };
    document.addEventListener('visibilitychange', wakeWhenVisible);
    void resolveStartupRoute();
    return () => {
      unsubscribe();
      liveSync?.stop();
      document.removeEventListener('visibilitychange', wakeWhenVisible);
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
      <BrandLockup />
      {#if startupState === 'failed'}
        <p>{translate($locale, 'Groot could not verify the wallet lock state.')}</p>
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
        <NetworkStatus network={defaultConfig.network} locked={lockedRoute} />
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

    {#if !lockedRoute}<nav class="mobile-nav" class:policy-nav={policyContext}>
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
