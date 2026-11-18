<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { ChevronDown, Cpu, Plus, ShieldCheck, WalletCards } from '@lucide/svelte';
  import type { WalletProfile } from '$lib/wallet/contracts';
  import Button from './Button.svelte';
  import Modal from './Modal.svelte';
  import WalletProfileList from './WalletProfileList.svelte';

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
  let selected = $derived(profiles.find((profile) => profile.id === selectedWalletId));

  async function choose(walletId: string) {
    open = false;
    await onselect(walletId);
  }
</script>

<div class="mobile-wallet-switcher">
  <button
    type="button"
    class="mobile-wallet-trigger"
    aria-label={translate($locale, 'Switch wallet')}
    aria-haspopup="dialog"
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
</div>

<Modal
  {open}
  fixedViewport={profiles.length > 5}
  title={translate($locale, 'Wallets')}
  onclose={() => (open = false)}
>
  <div class="mobile-wallet-dialog" data-testid="mobile-wallet-dialog-layout">
    <div class="mobile-wallet-list-scroll" data-testid="mobile-wallet-list-scroll">
      <WalletProfileList {profiles} {selectedWalletId} onselect={choose} />
    </div>
    <div class="modal-footer mobile-wallet-footer">
      <Button href="/welcome?add=1" variant="secondary" class="full" onclick={() => (open = false)}
        ><Plus size={16} />{translate($locale, 'Add wallet')}</Button
      >
    </div>
  </div>
</Modal>

<style>
  .mobile-wallet-switcher {
    display: none;
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
  .mobile-wallet-dialog {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
  }
  .mobile-wallet-list-scroll {
    min-height: 0;
    flex: 1 1 auto;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }
  .mobile-wallet-footer {
    display: grid;
    flex: 0 0 auto;
    grid-template-columns: minmax(0, 1fr);
    margin-top: 0;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }
  @media (max-width: 760px) {
    .mobile-wallet-switcher {
      display: block;
    }
  }
</style>
