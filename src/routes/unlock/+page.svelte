<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate, localizedError } from '$lib/i18n-catalog';
  import { LockKeyhole, Trash2 } from '@lucide/svelte';
  import { afterNavigate, goto } from '$app/navigation';
  import { onDestroy, onMount, tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import WarningNotice from '$lib/components/WarningNotice.svelte';
  import { defaultConfig } from '$lib/config';
  import { isPrototypeWallet, walletService } from '$lib/wallet';
  import { page } from '$app/state';
  import { useWalletShellContext } from '$lib/wallet/shell-context';
  import type { WalletProfile, WalletProfileCompatibility } from '$lib/wallet/contracts';
  const walletShell = useWalletShellContext();

  let credential = $state('');
  let error = $state('');
  let busy = $state(false);
  let showReset = $state(false);
  let resetConfirmation = $state('');
  let resetting = $state(false);
  let profiles = $state<WalletProfile[]>([]);
  let selectedWalletId = $state<string | null>(null);
  let compatibility = $state<WalletProfileCompatibility | null>(null);
  let credentialForm = $state<HTMLFormElement | null>(null);
  let selectedProfile = $derived(profiles.find((wallet) => wallet.id === selectedWalletId));
  let isSoftwareWallet = $derived(selectedProfile?.kind === 'single_key');
  let credentialLabel = $derived(
    translate($locale, isSoftwareWallet ? 'Wallet passphrase' : 'App PIN')
  );
  let credentialPlaceholder = $derived(
    translate($locale, isSoftwareWallet ? 'Enter wallet passphrase' : 'Enter app PIN')
  );

  async function loadProfiles() {
    const registry = await walletService.profiles();
    const selectionChanged = selectedWalletId !== registry.selectedWalletId;
    profiles = registry.wallets;
    selectedWalletId = registry.selectedWalletId;
    if (selectionChanged) {
      credential = '';
      error = '';
      resetConfirmation = '';
      showReset = false;
    }
    compatibility = selectedWalletId ? await walletService.profileCompatibility() : null;
    await tick();
    credentialForm?.querySelector<HTMLInputElement>('input')?.focus();
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
      if (next === '/' && selectedWalletId) walletShell.requestUnlockSync(selectedWalletId);
      await goto(next);
    } catch (cause) {
      error = localizedError(cause, $locale, 'Could not unlock wallet.');
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
      error = localizedError(cause, $locale, 'Could not reset the local test wallet.');
    } finally {
      resetting = false;
    }
  }
</script>

<div class="onboarding-overlay unlock-overlay">
  {#key selectedWalletId}
    <main class="onboarding-card" in:fly={{ y: 6, duration: 260, opacity: 0 }}>
      <span class="setup-step">{translate($locale, 'WALLET LOCKED')}</span>
      <span class="sign-icon"><LockKeyhole size={25} /></span>
      <h1>{translate($locale, selectedProfile?.name ?? 'Unlock wallet')}</h1>
      <p>
        {#if compatibility && !compatibility.supported}
          {translate(
            $locale,
            'This disposable Regtest wallet uses an unsupported test-profile format.'
          )}
        {:else if isSoftwareWallet}{translate(
            $locale,
            'Enter this wallet’s passphrase to continue.'
          )}{:else}{translate($locale, 'Enter this\n          wallet’s app PIN to continue.')}{/if}
      </p>
      {#if compatibility && !compatibility.supported}
        <WarningNotice
          title={translate(
            $locale,
            'This profile predates the current hardware-signer storage format.'
          )}
          body={translate(
            $locale,
            'Groot will not guess missing metadata or reset its app PIN. Because Regtest wallets are disposable,\n          delete this test wallet and recreate or recover it from a public wallet backup. Its existing\n          files remain untouched until you explicitly delete it.'
          )}
        />
      {/if}
      {#if isPrototypeWallet}<p class="prototype-hint">
          {translate($locale, 'UI prototype PIN:')}
          <code>{translate($locale, 'prototype-passphrase')}</code>
        </p>{/if}
      {#if compatibility?.supported !== false}
        <form
          bind:this={credentialForm}
          onsubmit={(event) => {
            event.preventDefault();
            unlock();
          }}
        >
          <PasswordField
            label={credentialLabel}
            tooltip={isSoftwareWallet
              ? translate(
                  $locale,
                  'This BIP39 passphrase is required with your 24 recovery words and also unlocks Groot. A different passphrase opens a different wallet.'
                )
              : translate(
                  $locale,
                  'This app PIN protects local Groot data only. It is not a hardware-signer passphrase and is not part of a signer seed backup.'
                )}
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
            loadingLabel={translate($locale, 'Unlocking wallet…')}
            >{translate($locale, 'Unlock wallet')}</Button
          >
        </form>
      {/if}
      {#if defaultConfig.network === 'regtest'}<button
          class="locked-reset"
          onclick={() => (showReset = true)}
          ><Trash2 size={14} />{translate($locale, 'Delete this regtest wallet')}</button
        >{/if}
    </main>
  {/key}
</div>

<Modal
  open={showReset}
  title={translate($locale, 'Delete this regtest wallet?')}
  description={translate(
    $locale,
    selectedProfile
      ? `Remove ${selectedProfile.name} from this device.`
      : 'Use this only for disposable local testing.'
  )}
  onclose={() => {
    showReset = false;
    resetConfirmation = '';
  }}
>
  <WarningNotice
    tone="danger"
    title={translate($locale, 'This removes the encrypted wallet data from this device.')}
    body={translate(
      $locale,
      isSoftwareWallet
        ? 'It cannot be undone unless you have the correct 24 recovery words and\n      wallet passphrase.'
        : 'It cannot be undone unless you have the public wallet backup and\n      access to the required signer or signers.'
    )}
  />
  <label class="field"
    ><span>{translate($locale, 'Type RESET REGTEST to confirm')}</span><input
      bind:value={resetConfirmation}
      placeholder={translate($locale, 'RESET REGTEST')}
      autocomplete="off"
    /></label
  >
  <div class="modal-footer">
    <Button
      variant="secondary"
      onclick={() => {
        showReset = false;
        resetConfirmation = '';
      }}>{translate($locale, 'Cancel')}</Button
    ><Button
      variant="danger"
      disabled={resetConfirmation !== 'RESET REGTEST'}
      loading={resetting}
      loadingLabel={translate($locale, 'Deleting…')}
      onclick={resetRegtestWallet}>{translate($locale, 'Delete test wallet')}</Button
    >
  </div>
</Modal>
