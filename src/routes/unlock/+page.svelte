<script lang="ts">
  import { LockKeyhole, Trash2 } from '@lucide/svelte';
  import { afterNavigate, goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import { defaultConfig } from '$lib/config';
  import { isPrototypeWallet, walletService } from '$lib/wallet';
  import { page } from '$app/state';
  import { useWalletShellContext } from '$lib/wallet/shell-context';
  import type { WalletProfile } from '$lib/wallet/contracts';
  const walletShell = useWalletShellContext();

  let credential = $state('');
  let error = $state('');
  let busy = $state(false);
  let showReset = $state(false);
  let resetConfirmation = $state('');
  let resetting = $state(false);
  let profiles = $state<WalletProfile[]>([]);
  let selectedWalletId = $state<string | null>(null);
  let selectedProfile = $derived(profiles.find((wallet) => wallet.id === selectedWalletId));
  let isSoftwareWallet = $derived(selectedProfile?.kind === 'single_key');
  let credentialLabel = $derived(isSoftwareWallet ? 'Wallet passphrase' : 'App PIN');
  let credentialPlaceholder = $derived(
    isSoftwareWallet ? 'Enter wallet passphrase' : 'Enter app PIN'
  );

  async function loadProfiles() {
    const registry = await walletService.profiles();
    profiles = registry.wallets;
    selectedWalletId = registry.selectedWalletId;
  }

  onMount(async () => {
    if (!(await walletService.exists())) {
      await goto('/welcome');
      return;
    }
    await loadProfiles();
  });
  afterNavigate(() => {
    void loadProfiles();
  });

  onDestroy(() => {
    credential = '';
    resetConfirmation = '';
  });

  async function unlock() {
    if (busy || !credential) return;
    busy = true;
    error = '';
    try {
      await walletService.unlock(credential);
      credential = '';
      const requested = page.url.searchParams.get('next');
      const next =
        requested?.startsWith('/') && !requested.startsWith('//') && requested !== '/multisig'
          ? requested
          : '/';
      await goto(next);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not unlock wallet.';
      credential = '';
    } finally {
      busy = false;
    }
  }

  function submitCredentialOnEnter(event: KeyboardEvent) {
    if (
      event.key !== 'Enter' ||
      event.isComposing ||
      !(event.currentTarget instanceof HTMLInputElement)
    )
      return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  async function resetRegtestWallet() {
    resetting = true;
    error = '';
    try {
      await walletService.resetRegtestWallet(resetConfirmation);
      resetConfirmation = '';
      showReset = false;
      await walletShell.refreshProfiles();
      const registry = await walletService.profiles();
      await goto(registry.wallets.length ? '/unlock' : '/welcome');
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not reset the local test wallet.';
    } finally {
      resetting = false;
    }
  }
</script>

<div class="onboarding-overlay unlock-overlay">
  <main class="onboarding-card">
    <span class="setup-step">WALLET LOCKED</span>
    <span class="sign-icon"><LockKeyhole size={25} /></span>
    <h1>{selectedProfile?.name ?? 'Unlock wallet'}</h1>
    <p>
      {#if isSoftwareWallet}Enter this wallet’s passphrase to continue.{:else}Enter this wallet’s
        app PIN to continue.{/if}
    </p>
    {#if isPrototypeWallet}<p class="prototype-hint">
        UI prototype PIN: <code>prototype-passphrase</code>
      </p>{/if}
    <form
      onsubmit={(event) => {
        event.preventDefault();
        unlock();
      }}
    >
      <PasswordField
        label={credentialLabel}
        tooltip={isSoftwareWallet
          ? 'This BIP39 passphrase is required with your 24 recovery words and also unlocks Groot. A different passphrase opens a different wallet.'
          : 'This app PIN protects local Groot data only. It is not a hardware-wallet passphrase and is not part of a signer seed backup.'}
        bind:value={credential}
        placeholder={credentialPlaceholder}
        autocomplete="current-password"
        {error}
        oninput={() => (error = '')}
        onkeydown={submitCredentialOnEnter}
      />
      <Button
        type="submit"
        size="large"
        class="full"
        disabled={!credential}
        loading={busy}
        loadingLabel="Unlocking wallet…">Unlock wallet</Button
      >
    </form>
    {#if defaultConfig.network === 'regtest'}<button
        class="locked-reset"
        onclick={() => (showReset = true)}><Trash2 size={14} />Delete this regtest wallet</button
      >{/if}
  </main>
  <footer class="onboarding-footer">Keys stay on this device · Open source</footer>
</div>

<Modal
  open={showReset}
  title="Delete this regtest wallet?"
  description={selectedProfile
    ? `Remove ${selectedProfile.name} from this device.`
    : 'Use this only for disposable local testing.'}
  onclose={() => {
    showReset = false;
    resetConfirmation = '';
  }}
>
  <div class="warning-box danger">
    <strong>This removes the encrypted wallet data from this device.</strong>
    {#if isSoftwareWallet}It cannot be undone unless you have the correct 24 recovery words and
      wallet passphrase.{:else}It cannot be undone unless you have the public wallet backup and
      access to the required signer or signers.{/if}
  </div>
  <label class="field"
    ><span>Type RESET REGTEST to confirm</span><input
      bind:value={resetConfirmation}
      placeholder="RESET REGTEST"
      autocomplete="off"
    /></label
  >
  <div class="modal-footer">
    <Button
      variant="secondary"
      onclick={() => {
        showReset = false;
        resetConfirmation = '';
      }}>Cancel</Button
    ><Button
      variant="danger"
      disabled={resetConfirmation !== 'RESET REGTEST'}
      loading={resetting}
      loadingLabel="Deleting…"
      onclick={resetRegtestWallet}>Delete test wallet</Button
    >
  </div>
</Modal>
