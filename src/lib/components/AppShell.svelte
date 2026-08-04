<script lang="ts">
  import { page } from '$app/state';
  import { Activity, ArrowDownToLine, ArrowUpFromLine, Bitcoin, CircleDot, LayoutGrid, Plus, Settings, ShieldCheck } from '@lucide/svelte';
  import ToastHost from './ToastHost.svelte';
  import { defaultConfig, networkName } from '$lib/config';
  import { onMount } from 'svelte';
  import { afterNavigate, goto } from '$app/navigation';
  import { isPrototypeWallet, walletService, WalletError } from '$lib/wallet';
  import { toast } from '$lib/stores/toasts';
  import { shortSats } from '$lib/data';
  import type { WalletProfile } from '$lib/wallet/contracts';
  let { children } = $props();
  const nav = [
    { href: '/', label: 'Overview', icon: LayoutGrid },
    { href: '/activity', label: 'Activity', icon: Activity },
    { href: '/coins', label: 'Coins', icon: CircleDot },
    { href: '/multisig', label: 'Vault', icon: ShieldCheck }
  ];
  const active = (href: string) => href === '/multisig' ? page.url.pathname.startsWith(href) : page.url.pathname === href;
  let profiles = $state<WalletProfile[]>([]);
  let selectedWalletId = $state<string | null>(null);
  let selectedProfile = $derived(profiles.find((wallet) => wallet.id === selectedWalletId));
  let visibleNav = $derived(selectedProfile?.kind === 'multisig' ? [nav[3]] : nav);
  let mobileItems = $derived(selectedProfile?.kind === 'multisig' ? [
    { href: '/multisig', label: 'Vault', icon: ShieldCheck },
    { href: '/multisig/receive', label: 'Receive', icon: ArrowDownToLine },
    { href: '/multisig/send', label: 'Send', icon: ArrowUpFromLine }
  ] : nav.slice(0, 3));
  const showQuickActions = $derived(selectedProfile?.kind !== 'multisig' && page.url.pathname !== '/send' && page.url.pathname !== '/receive' && !page.url.pathname.startsWith('/multisig'));

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

  afterNavigate(() => { void refreshProfiles(); });

  async function selectWallet(walletId: string) {
    if (!walletId || walletId === selectedWalletId) return;
    try {
      const profile = await walletService.selectWallet(walletId);
      selectedWalletId = profile.id;
      await goto(`/unlock?next=${profile.kind === 'multisig' ? '/multisig' : '/'}`);
    } catch (cause) {
      toast({ title: 'Wallet not switched', description: cause instanceof Error ? cause.message : 'Could not select this wallet.', tone: 'danger' });
    }
  }
  onMount(() => {
    const unsubscribe = walletService.subscribe((event) => {
      if (event.type === 'payment_received') toast({ title: 'Bitcoin received', description: `Received ${shortSats(event.amount)} sats · Balance ${shortSats(event.balance)} sats`, tone: 'success' });
      if (event.type === 'first_confirmation') toast({ title: 'First confirmation', description: `Transaction confirmed · Balance ${shortSats(event.balance)} sats`, tone: 'success' });
      if (event.type === 'transaction_broadcast') toast({ title: 'Transaction broadcast', description: `Balance ${shortSats(event.balance)} sats`, tone: 'success' });
    });
    void (async () => {
      try {
        if (!await walletService.exists()) { await goto('/welcome'); return; }
        const registry = await walletService.profiles();
        profiles = registry.wallets;
        selectedWalletId = registry.selectedWalletId;
        if (page.url.pathname === '/welcome' || page.url.pathname === '/unlock') return;
        const selected = profiles.find((wallet) => wallet.id === selectedWalletId);
        if (selected?.kind === 'multisig') {
          await walletService.multisigSnapshot();
          if (!page.url.pathname.startsWith('/multisig') && page.url.pathname !== '/settings') await goto('/multisig');
        } else {
          await walletService.snapshot();
        }
      } catch (cause) {
        if (cause instanceof WalletError && cause.code === 'wallet_locked') await goto('/unlock');
      }
    })();
    return unsubscribe;
  });
</script>

<div class="app-shell">
  <aside class="sidebar">
    <a class="brand" href="/"><span class="brand-mark"><Bitcoin size={18} /></span><span>Satchel</span></a>
    {#if profiles.length}
      <div class="wallet-switcher">
        <label for="wallet-profile">Wallet</label>
        <select id="wallet-profile" value={selectedWalletId ?? ''} onchange={(event) => selectWallet(event.currentTarget.value)}>
          {#each profiles as profile}<option value={profile.id}>{profile.name}</option>{/each}
        </select>
        <a href="/welcome?add=1"><Plus size={14}/>Add wallet</a>
      </div>
    {/if}
    <nav class="side-nav">
      {#each visibleNav as item}
        <a href={item.href} class:active={active(item.href)}><item.icon size={17} /><span>{item.label}</span></a>
      {/each}
    </nav>
    <div class="sidebar-bottom">
      <a href="/settings" class:active={active('/settings')}><Settings size={17} /><span>Settings</span></a>
      <div class="network"><i></i><span>{networkName(defaultConfig.network)}</span></div>
    </div>
  </aside>

  <main class="main">
    {#if isPrototypeWallet}<div class="demo-banner" role="status"><strong>Interactive prototype</strong><span>Dummy data only · Never use real funds or recovery words</span></div>{/if}
    {@render children?.()}
  </main>

  <nav class="mobile-nav">
    {#each mobileItems as item}
      <a href={item.href} class:active={active(item.href)}><item.icon size={20} /><span>{item.label}</span></a>
    {/each}
    <a href="/settings" class:active={active('/settings')}><Settings size={20} /><span>Settings</span></a>
  </nav>

  {#if showQuickActions}
    <div class="mobile-actions">
      <a class="mobile-action secondary" href="/receive"><ArrowDownToLine size={18} />Receive</a>
      <a class="mobile-action primary" href="/send"><ArrowUpFromLine size={18} />Send</a>
    </div>
  {/if}
  <ToastHost />
</div>
