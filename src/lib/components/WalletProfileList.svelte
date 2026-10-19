<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { Check, ChevronRight, KeyRound, ShieldCheck, WalletCards } from '@lucide/svelte';
  import Tooltip from './Tooltip.svelte';
  import type { WalletProfile } from '$lib/wallet/contracts';

  let {
    profiles,
    selectedWalletId,
    onselect,
    compact = false
  } = $props<{
    profiles: WalletProfile[];
    selectedWalletId: string | null;
    onselect: (walletId: string) => void | Promise<void>;
    compact?: boolean;
  }>();
  let list = $state<HTMLUListElement | null>(null);

  $effect(() => {
    if (!compact || !selectedWalletId || !list) return;

    const frame = requestAnimationFrame(() => {
      const activeWallet = list?.querySelector<HTMLElement>('[aria-current="true"]');
      if (!activeWallet || !list) return;

      const listBounds = list.getBoundingClientRect();
      const walletBounds = activeWallet.getBoundingClientRect();
      if (walletBounds.top < listBounds.top || walletBounds.bottom > listBounds.bottom) {
        activeWallet.scrollIntoView({ block: 'nearest' });
      }
    });

    return () => cancelAnimationFrame(frame);
  });

  function kindLabel(profile: WalletProfile) {
    return profile.kind === 'multisig'
      ? 'Multisig'
      : profile.kind === 'watch_only'
        ? 'Hardware signer'
        : 'Single-key';
  }
</script>

<ul
  bind:this={list}
  class:compact
  class="wallet-profile-list"
  aria-label={translate($locale, 'Wallets')}
>
  {#each profiles as profile}
    <li>
      <Tooltip text={profile.name} truncatedSelector=".wallet-profile-copy strong"
        ><button
          type="button"
          class:active={profile.id === selectedWalletId}
          aria-current={profile.id === selectedWalletId ? 'true' : undefined}
          aria-label={translate(
            $locale,
            profile.id === selectedWalletId ? '{name}, {kind}, active wallet' : '{name}, {kind}',
            { name: profile.name, kind: translate($locale, kindLabel(profile)) }
          )}
          onclick={() => onselect(profile.id)}
        >
          <span class="wallet-profile-icon">
            {#if profile.kind === 'multisig'}<ShieldCheck size={15} />
            {:else if profile.kind === 'watch_only'}<KeyRound size={15} />
            {:else}<WalletCards size={15} />{/if}
          </span>
          <span class="wallet-profile-copy"
            ><strong>{profile.name}</strong><small>{translate($locale, kindLabel(profile))}</small
            ></span
          >
          {#if profile.id === selectedWalletId}<Check size={15} />{:else}<ChevronRight
              size={15}
            />{/if}
        </button></Tooltip
      >
    </li>
  {/each}
</ul>

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.wallet-profile-list):where(.wallet-profile-list) {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  :global(.wallet-profile-list.compact):where(.wallet-profile-list) {
    max-height: 180px;
    overflow-y: auto;
    padding-right: 2px;
  }
  :global(.wallet-profile-list):where(.wallet-profile-list) :global(button) {
    width: 100%;
    min-width: 0;
    min-height: 52px;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) 16px;
    align-items: center;
    gap: 9px;
    padding: 7px 9px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    color: var(--muted);
    background: var(--surface-control);
    text-align: left;
    cursor: pointer;
    transition:
      color 0.16s ease,
      border-color 0.16s ease,
      background-color 0.16s ease,
      box-shadow 0.16s ease,
      transform 0.16s ease;
  }
  :global(.wallet-profile-list):where(.wallet-profile-list) :global(button:hover) {
    color: var(--text-soft);
    border-color: var(--border-strong);
    background: var(--surface-hover);
  }
  :global(.wallet-profile-list):where(.wallet-profile-list) :global(button.active) {
    color: var(--text);
    border-color: color-mix(in srgb, var(--link) 45%, transparent);
    background: color-mix(in srgb, var(--link) 10%, transparent);
    box-shadow: inset 2px 0 0 var(--fr-blue);
  }
  :global(.wallet-profile-icon):where(.wallet-profile-icon) {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-control);
    color: var(--muted);
    background: var(--surface-icon);
  }
  :global(.wallet-profile-list):where(.wallet-profile-list)
    :global(button.active .wallet-profile-icon) {
    color: var(--link);
    background: color-mix(in srgb, var(--link) 13%, transparent);
  }
  :global(.wallet-profile-copy):where(.wallet-profile-copy) {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  :global(.wallet-profile-copy):where(.wallet-profile-copy) :global(strong) {
    overflow: hidden;
    color: inherit;
    font-size: 14px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.wallet-profile-copy):where(.wallet-profile-copy) :global(small) {
    color: var(--muted-2);
    font-size: var(--font-size-meta);
  }
  :global(.wallet-profile-icon):where(.wallet-profile-icon) :global(svg) {
    transition:
      color 0.16s ease,
      transform 0.16s cubic-bezier(0.2, 0.75, 0.3, 1);
  }
  :global(.wallet-profile-list):where(.wallet-profile-list)
    :global(button:hover .wallet-profile-icon svg) {
    transform: translateY(-1px) scale(1.025);
  }
  :global(.wallet-profile-list):where(.wallet-profile-list) :global(button:active) {
    transform: scale(0.992);
  }
</style>
