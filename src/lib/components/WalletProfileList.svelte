<script lang="ts">
  import { Check, ChevronRight, KeyRound, ShieldCheck, WalletCards } from '@lucide/svelte';
  import type { WalletProfile } from '$lib/wallet/contracts';

  let { profiles, selectedWalletId, onselect, compact = false } = $props<{
    profiles: WalletProfile[];
    selectedWalletId: string | null;
    onselect: (walletId: string) => void | Promise<void>;
    compact?: boolean;
  }>();

  function kindLabel(profile: WalletProfile) {
    return profile.kind === 'multisig' ? 'Multisig' : profile.kind === 'watch_only' ? 'Hardware signer' : 'Single-key';
  }
</script>

<ul class:compact class="wallet-profile-list" aria-label="Wallets">
  {#each profiles as profile}
    <li><button
        type="button"
        class:active={profile.id === selectedWalletId}
        aria-current={profile.id === selectedWalletId ? 'true' : undefined}
        aria-label={`${profile.name}, ${kindLabel(profile)}${profile.id === selectedWalletId ? ', active wallet' : ''}`}
        onclick={() => onselect(profile.id)}
      >
        <span class="wallet-profile-icon">
          {#if profile.kind === 'multisig'}<ShieldCheck size={15}/>
          {:else if profile.kind === 'watch_only'}<KeyRound size={15}/>
          {:else}<WalletCards size={15}/>{/if}
        </span>
        <span class="wallet-profile-copy"><strong>{profile.name}</strong><small>{kindLabel(profile)}</small></span>
        {#if profile.id === selectedWalletId}<Check size={15}/>{:else}<ChevronRight size={15}/>{/if}
      </button></li>
  {/each}
</ul>
