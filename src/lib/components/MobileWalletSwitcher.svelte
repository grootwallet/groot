<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { ChevronDown, Cpu, Plus, ShieldCheck, WalletCards } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import type { WalletProfile } from '$lib/wallet/contracts';

  let {
    profiles,
    selectedWalletId,
    onselect
  }: {
    profiles: WalletProfile[];
    selectedWalletId: string | null;
    onselect: (walletId: string) => Promise<void>;
  } = $props();

  let open = $state(false);
  let root = $state<HTMLDivElement | null>(null);
  let trigger = $state<HTMLButtonElement | null>(null);
  let selected = $derived(profiles.find((profile) => profile.id === selectedWalletId));

  async function choose(walletId: string) {
    open = false;
    await onselect(walletId);
  }

  onMount(() => {
    const closeOutside = (event: PointerEvent) => {
      if (open && root && event.target instanceof Node && !root.contains(event.target))
        open = false;
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !open) return;
      open = false;
      requestAnimationFrame(() => trigger?.focus());
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  });
</script>

<div class="mobile-wallet-switcher" bind:this={root}>
  <button
    bind:this={trigger}
    type="button"
    class="mobile-wallet-trigger"
    aria-label={translate($locale, 'Switch wallet')}
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    {#if selected?.kind === 'multisig'}<ShieldCheck
        size={17}
      />{:else if selected?.kind === 'watch_only'}<Cpu size={17} />{:else}<WalletCards
        size={17}
      />{/if}
    <span>{translate($locale, selected?.name ?? 'Wallet')}</span>
    <ChevronDown size={15} />
  </button>
  {#if open}
    <div class="mobile-wallet-menu" role="menu" aria-label={translate($locale, 'Wallets')}>
      {#each profiles as profile}
        <button
          type="button"
          role="menuitemradio"
          aria-checked={profile.id === selectedWalletId}
          class:active={profile.id === selectedWalletId}
          onclick={() => choose(profile.id)}
        >
          <span class="mobile-wallet-menu-icon"
            >{#if profile.kind === 'multisig'}<ShieldCheck
                size={16}
              />{:else if profile.kind === 'watch_only'}<Cpu size={16} />{:else}<WalletCards
                size={16}
              />{/if}</span
          >
          <span
            ><strong>{profile.name}</strong><small
              >{translate(
                $locale,
                profile.kind === 'multisig'
                  ? 'Multisig wallet'
                  : profile.kind === 'watch_only'
                    ? 'Hardware signer'
                    : 'Software wallet'
              )}</small
            ></span
          >
        </button>
      {/each}
      <a href="/welcome?add=1" role="menuitem" onclick={() => (open = false)}
        ><span class="mobile-wallet-menu-icon"><Plus size={16} /></span><span
          ><strong>{translate($locale, 'Add wallet')}</strong><small
            >{translate($locale, 'Create or recover another wallet')}</small
          ></span
        ></a
      >
    </div>
  {/if}
</div>

<style>
  .mobile-wallet-switcher {
    display: none;
    position: relative;
    min-width: 0;
  }
  .mobile-wallet-trigger {
    width: 100%;
    min-height: 46px;
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) 16px;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    border: 1px solid var(--control-border);
    border-radius: var(--radius-control);
    color: var(--text);
    background: var(--surface-control);
    font: inherit;
    font-size: var(--font-size-meta);
    font-weight: 650;
    text-align: left;
    cursor: pointer;
  }
  .mobile-wallet-trigger span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mobile-wallet-trigger:hover,
  .mobile-wallet-trigger:focus-visible,
  .mobile-wallet-trigger[aria-expanded='true'] {
    background: var(--surface-hover);
    outline: 0;
  }
  .mobile-wallet-trigger:focus-visible {
    box-shadow: 0 0 0 2px var(--focus);
  }
  .mobile-wallet-menu {
    position: absolute;
    z-index: 90;
    top: calc(100% + 8px);
    right: 0;
    left: 0;
    width: 100%;
    max-height: min(360px, calc(100dvh - 180px));
    overflow-y: auto;
    padding: 6px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-inset);
    background: var(--panel-2);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.3);
  }
  .mobile-wallet-menu button,
  .mobile-wallet-menu a {
    width: 100%;
    min-height: 50px;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    align-items: center;
    gap: 9px;
    padding: 8px 10px;
    border: 0;
    border-radius: var(--radius-control);
    color: var(--text);
    background: transparent;
    font: inherit;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }
  .mobile-wallet-menu button:hover,
  .mobile-wallet-menu button:focus-visible,
  .mobile-wallet-menu a:hover,
  .mobile-wallet-menu a:focus-visible,
  .mobile-wallet-menu button.active {
    background: var(--surface-hover);
    outline: 0;
  }
  .mobile-wallet-menu-icon {
    width: 29px;
    height: 29px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-control);
    color: var(--muted);
    background: var(--surface-icon);
  }
  .mobile-wallet-menu button > span:last-child,
  .mobile-wallet-menu a > span:last-child {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .mobile-wallet-menu strong {
    overflow: hidden;
    font-size: var(--font-size-meta);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mobile-wallet-menu small {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  @media (max-width: 760px) {
    .mobile-wallet-switcher {
      display: block;
    }
  }
</style>
