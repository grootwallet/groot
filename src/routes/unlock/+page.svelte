<script lang="ts">
  import { ArrowLeft, LockKeyhole, Plus, Trash2 } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import { defaultConfig } from '$lib/config';
  import { isPrototypeWallet, walletService } from '$lib/wallet';
  import { page } from '$app/state';
  import type { WalletProfile } from '$lib/wallet/contracts';

  let credential = $state('');
  let error = $state('');
  let busy = $state(false);
  let showReset = $state(false);
  let resetConfirmation = $state('');
  let resetting = $state(false);
  let profiles = $state<WalletProfile[]>([]);
  let selectedWalletId = $state<string | null>(null);
  let selectedProfile = $derived(profiles.find((wallet) => wallet.id === selectedWalletId));

  onMount(async () => {
    if (!await walletService.exists()) { await goto('/welcome'); return; }
    const registry = await walletService.profiles();
    profiles = registry.wallets;
    selectedWalletId = registry.selectedWalletId;
  });

  async function selectWallet(walletId: string) {
    if (!walletId || walletId === selectedWalletId) return;
    await walletService.selectWallet(walletId);
    selectedWalletId = walletId;
    credential = '';
    error = '';
  }

  async function unlock() {
    busy = true; error = '';
    try {
      await walletService.unlock(credential);
      credential = '';
      const next = page.url.searchParams.get('next');
      await goto(next === '/multisig' ? '/multisig' : '/');
    }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Could not unlock wallet.'; credential = ''; }
    finally { busy = false; }
  }

  async function resetRegtestWallet() {
    resetting = true;
    error = '';
    try {
      await walletService.resetRegtestWallet(resetConfirmation);
      resetConfirmation = '';
      showReset = false;
      const registry = await walletService.profiles();
      await goto(registry.wallets.length ? '/unlock' : '/welcome');
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not reset the local test wallet.';
    } finally {
      resetting = false;
    }
  }
</script>

<div class="onboarding-overlay">
  <header class="onboarding-brand"><span class="brand-mark">₿</span><span>Satchel</span><small>REGTEST</small></header>
  <main class="onboarding-card">
    <button class="back-link" onclick={() => goto('/welcome?add=1')}><ArrowLeft size={16}/>Wallets</button>
    <span class="sign-icon"><LockKeyhole size={25} /></span>
    <span class="setup-step">WALLET LOCKED</span>
    <h1>Welcome back</h1>
    <p>Enter the passphrase / PIN for {selectedProfile?.name ?? 'the selected wallet'}.</p>
    {#if profiles.length > 1}<label class="field unlock-wallet-picker"><span>Wallet</span><select aria-label="Wallet to unlock" value={selectedWalletId ?? ''} onchange={(event) => selectWallet(event.currentTarget.value)}>{#each profiles as profile}<option value={profile.id}>{profile.name} · {profile.kind === 'multisig' ? 'Multisig' : 'Single-key'}</option>{/each}</select></label>{/if}
    {#if isPrototypeWallet}<p class="prototype-hint">UI prototype PIN: <code>prototype-passphrase</code></p>{/if}
    <form onsubmit={(event) => { event.preventDefault(); unlock(); }}>
      <PasswordField label="Passphrase / PIN" bind:value={credential} placeholder="Enter wallet passphrase / PIN" autocomplete="current-password" {error} oninput={() => error = ''}/>
      <Button type="submit" size="large" class="full" disabled={!credential || busy}>{busy ? 'Unlocking…' : 'Unlock wallet'}</Button>
    </form>
    <button class="locked-add" onclick={() => goto('/welcome?add=1')}><Plus size={14}/>Create or recover another wallet</button>
    {#if defaultConfig.network === 'regtest'}<button class="locked-reset" onclick={() => showReset = true}><Trash2 size={14}/>Delete this regtest wallet</button>{/if}
  </main>
  <footer class="onboarding-footer">Keys stay on this device · Open source</footer>
</div>

<Modal open={showReset} title="Delete this regtest wallet?" description={selectedProfile ? `Remove ${selectedProfile.name} from this device.` : 'Use this only for disposable local testing.'} onclose={() => { showReset = false; resetConfirmation = ''; }}>
  <div class="warning-box danger"><strong>This removes the encrypted secret and wallet database from this device.</strong> It cannot be undone unless you have the correct 24 words and passphrase.</div>
  <label class="field"><span>Type RESET REGTEST to confirm</span><input bind:value={resetConfirmation} placeholder="RESET REGTEST" autocomplete="off" /></label>
  <div class="modal-footer"><Button variant="secondary" onclick={() => { showReset = false; resetConfirmation = ''; }}>Cancel</Button><Button variant="danger" disabled={resetConfirmation !== 'RESET REGTEST' || resetting} onclick={resetRegtestWallet}>{resetting ? 'Deleting…' : 'Delete test wallet'}</Button></div>
</Modal>
