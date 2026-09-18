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
