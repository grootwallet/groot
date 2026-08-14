<script lang="ts">
  import { page } from '$app/state';
  import { Activity, ArrowDownToLine, ArrowUpFromLine, CircleDot, LayoutGrid, Plus, Settings, ShieldCheck } from '@lucide/svelte';
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
  import { afterNavigate, goto } from '$app/navigation';
  import { isPrototypeWallet, walletService, WalletError } from '$lib/wallet';
  import { createLiveSync, type LiveSyncController } from '$lib/wallet/live-sync';
  import { toast } from '$lib/stores/toasts';
  import { shortSats } from '$lib/data';
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
  const walletSetupRoutes = new Set(['/welcome', '/hardware/new', '/multisig/new', '/multisig/recover']);
  const active = (href: string) => href === '/multisig' ? page.url.pathname === href || page.url.pathname.startsWith('/multisig/policy') || page.url.pathname.startsWith('/multisig/backup') : page.url.pathname === href;
  let profiles = $state<WalletProfile[]>([]);
  let selectedWalletId = $state<string | null>(null);
  let multisigSetupDraft = $state<MultisigSetupDraft | null>(null);
  let discardSetupOpen = $state(false);
  let discardingSetup = $state(false);
  let discardSetupError = $state('');
  let setupDraftReadGeneration = 0;
  let liveSync: LiveSyncController | undefined;
  let selectedProfile = $derived(profiles.find((wallet) => wallet.id === selectedWalletId));
  let policyContext = $derived(selectedProfile?.kind === 'multisig' || page.url.pathname.startsWith('/multisig'));
  let visibleNav = $derived(policyContext ? nav : nav.slice(0, 3));
  let mobileItems = $derived(policyContext ? nav : nav.slice(0, 3));
  let onboardingRoute = $derived(walletSetupRoutes.has(page.url.pathname));
  let lockedRoute = $derived(page.url.pathname === '/unlock');
  const showQuickActions = $derived(!lockedRoute && (page.url.pathname === '/' || page.url.pathname === '/coins'));
  const receiveHref = $derived(selectedProfile?.kind === 'multisig' ? '/multisig/receive' : '/receive');
  const sendHref = $derived(selectedProfile?.kind === 'multisig' ? '/multisig/send' : '/send');
  const showSetupResume = $derived(Boolean(multisigSetupDraft) && !onboardingRoute);

  async function refreshSetupDraft() {
    const generation = ++setupDraftReadGeneration;
    try {
      const draft = await walletService.multisigSetupDraft();
      if (generation === setupDraftReadGeneration) multisigSetupDraft = draft;
    } catch { /* Keep the last known notice visible across transient read failures. */ }
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
      toast({ title: 'Setup discarded', description: 'The unfinished multisig wallet setup was removed.', tone: 'success' });
    } catch (cause) {
      discardSetupError = cause instanceof Error ? cause.message : 'Could not discard the unfinished setup.';
    } finally {
      discardingSetup = false;
    }
  }

  async function refreshProfiles() {
    try {
      const registry = await walletService.profiles();
      profiles = registry.wallets;
      selectedWalletId = registry.selectedWalletId;
    } catch {
      profiles = [];
      selectedWalletId = null;
    }
  }

  afterNavigate(() => {
    void refreshProfiles();
    void refreshSetupDraft();
    if (!liveSync || isPrototypeWallet) return;
    if (onboardingRoute || lockedRoute) liveSync.stop();
    else liveSync.start();
  });

  async function selectWallet(walletId: string) {
    if (!walletId || walletId === selectedWalletId) return;
    try {
      const profile = await walletService.selectWallet(walletId);
      selectedWalletId = profile.id;
      await goto('/');
      if (!isPrototypeWallet) {
        liveSync?.restart();
      }
    } catch (cause) {
      toast({ title: 'Wallet not switched', description: cause instanceof Error ? cause.message : 'Could not select this wallet.', tone: 'danger' });
    }
  }
  provideWalletShellContext({
    profiles: () => profiles,
    selectedWalletId: () => selectedWalletId,
    selectWallet
  });
  onMount(() => {
    const unsubscribe = walletService.subscribe((event) => {
      if (event.type === 'payment_received') toast({ title: 'Bitcoin received', description: `Received ${shortSats(event.amount)} sats · Balance ${shortSats(event.balance)} sats`, tone: 'success' });
      if (event.type === 'payment_received_confirmed') toast({ title: 'Bitcoin received', description: `Received ${shortSats(event.amount)} sats · First confirmation · Balance ${shortSats(event.balance)} sats`, tone: 'success' });
      if (event.type === 'first_confirmation') toast({ title: 'First confirmation', description: `Transaction confirmed · Balance ${shortSats(event.balance)} sats`, tone: 'success' });
      if (event.type === 'transaction_broadcast') toast({ title: 'Transaction broadcast', description: `Remaining wallet balance: ${shortSats(event.balance)} sats`, tone: 'success' });
      if (event.type === 'wallet_profile_updated') profiles = profiles.map((profile) => profile.id === event.profile.id ? event.profile : profile);
    });
    liveSync = createLiveSync(walletService, 10_000, (cause) => {
      if (cause instanceof WalletError && cause.code === 'wallet_locked') {
        liveSync?.stop();
        void goto('/unlock');
      }
    });
    const wakeWhenVisible = () => { if (document.visibilityState === 'visible') void liveSync?.runNow(); };
    document.addEventListener('visibilitychange', wakeWhenVisible);
    void (async () => {
      try {
        await refreshSetupDraft();
        if (!await walletService.exists()) { await goto('/welcome'); return; }
        const registry = await walletService.profiles();
        profiles = registry.wallets;
        selectedWalletId = registry.selectedWalletId;
        if (onboardingRoute || lockedRoute) return;
        if (!isPrototypeWallet) liveSync?.start();
      } catch (cause) {
        if (cause instanceof WalletError && cause.code === 'wallet_locked') await goto('/unlock');
      }
    })();
    return () => {
      unsubscribe();
      liveSync?.stop();
      document.removeEventListener('visibilitychange', wakeWhenVisible);
    };
  });
</script>

<div class="app-shell" class:onboarding-shell={onboardingRoute} class:mobile-actions-visible={showQuickActions} class:prototype-shell={isPrototypeWallet} class:locked-setup-visible={showSetupResume && lockedRoute}>
  <aside class="sidebar">
    <a class="brand" href="/" aria-label="Groot home"><BrandLockup /></a>
    {#if profiles.length}
      <div class="wallet-switcher">
        <span class="wallet-switcher-label">{t('wallets', $locale)} <strong>{formatWalletCount(profiles.length, $locale)}</strong></span>
        <WalletProfileList {profiles} {selectedWalletId} onselect={selectWallet} compact />
        <a href="/welcome?add=1"><Plus size={14}/>{t('addWallet', $locale)}</a>
      </div>
    {/if}
    {#if !lockedRoute}
      <nav class="side-nav">
        {#each visibleNav as item}
          <a href={item.href} class:active={active(item.href)} aria-current={active(item.href) ? 'page' : undefined}><item.icon size={17} /><span>{t(item.label, $locale)}</span></a>
        {/each}
      </nav>
    {/if}
    <div class="sidebar-bottom">
      {#if !lockedRoute}<a href="/settings" class:active={active('/settings')} aria-current={active('/settings') ? 'page' : undefined}><Settings size={17} /><span>{t('settings', $locale)}</span></a>{/if}
      <div class="preference-toggles"><ThemeToggle /><DiscreetModeToggle /></div>
      <NetworkStatus network={defaultConfig.network} locked={lockedRoute} />
    </div>
  </aside>

  <a class="mobile-brand" href="/" aria-label="Groot home"><BrandLockup /></a>

  <main class="main">
    {#if isPrototypeWallet}<div class="demo-banner" role="status"><strong>Interactive prototype</strong><span>Dummy data only · Never use real funds or recovery words</span></div>{/if}
    {#if showSetupResume && multisigSetupDraft}
      <ResumeSetupNotice
        title={lockedRoute ? 'Multisig wallet setup' : multisigSetupDraft.name.trim() || 'Multisig wallet setup'}
        detail={lockedRoute ? 'Wallet creation in progress' : `${multisigSetupStageLabel(multisigSetupDraft.stage)} · ${multisigSetupDraft.cosigners.length} of ${multisigSetupSignerTarget(multisigSetupDraft)} signers added`}
        href="/multisig/new"
        locked={lockedRoute}
        ondiscard={() => { discardSetupError = ''; discardSetupOpen = true; }}
      />
    {/if}
    {#key selectedWalletId}
      {@render children?.()}
    {/key}
  </main>

  {#if !lockedRoute}<nav class="mobile-nav" class:policy-nav={policyContext}>
    {#each mobileItems as item}
      <a href={item.href} class:active={active(item.href)} aria-current={active(item.href) ? 'page' : undefined}><item.icon size={20} /><span>{t(item.label, $locale)}</span></a>
    {/each}
    <a href="/settings" class:active={active('/settings')} aria-current={active('/settings') ? 'page' : undefined}><Settings size={20} /><span>{t('settings', $locale)}</span></a>
  </nav>{/if}

  {#if lockedRoute}<div class="locked-mobile-utilities"><ThemeToggle /><DiscreetModeToggle /><NetworkStatus network={defaultConfig.network} locked /></div>{/if}

  {#if showQuickActions}
    <div class="mobile-actions">
      <a class="mobile-action secondary" href={receiveHref}><ArrowDownToLine size={18} />{t('receive', $locale)}</a>
      <a class="mobile-action primary" href={sendHref}><ArrowUpFromLine size={18} />{t('send', $locale)}</a>
    </div>
  {/if}
  <DiscardMultisigSetupModal open={discardSetupOpen} busy={discardingSetup} error={discardSetupError} onclose={() => { discardSetupOpen = false; discardSetupError = ''; }} onconfirm={discardSetupDraft}/>
  <ToastHost />
</div>
