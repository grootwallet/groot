<script lang="ts">
  import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, KeyRound, ShieldCheck, X } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import { toast } from '$lib/stores/toasts';
  import { defaultConfig, networkName } from '$lib/config';
  import { walletService, WalletError } from '$lib/wallet';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onDestroy, onMount } from 'svelte';
  let mode = $state<'home'|'create'|'words'|'passphrase'|'recover'>('home');
  let revealed = $state(false);
  let passphrase = $state('');
  let confirmation = $state('');
  let recovery = $state('');
  let words = $state<string[]>([]);
  let nativeBackup = $state(false);
  let busy = $state(false);
  let error = $state('');
  let walletName = $state('My wallet');
  let hasExistingWallet = $state(false);

  onMount(async () => {
    hasExistingWallet = await walletService.exists();
    if (hasExistingWallet && page.url.searchParams.get('add') !== '1') await goto('/');
  });
  onDestroy(() => { void walletService.cancelOnboarding(); words = []; recovery = ''; passphrase = ''; confirmation = ''; });

  async function generate() {
    busy = true; error = '';
    try {
      const presentation = await walletService.generateMnemonic();
      if (presentation.mode === 'fixture') {
        words = presentation.words;
        mode = 'words';
      } else {
        words = [];
        nativeBackup = true;
        revealed = true;
        mode = 'passphrase';
      }
    }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Could not generate recovery words.'; }
    finally { busy = false; }
  }

  async function finishCreate() {
    busy = true; error = '';
    try {
      await walletService.createWallet(walletName, passphrase);
      words = []; passphrase = ''; confirmation = '';
      toast({title:'Wallet created',description:'Your regtest wallet is ready.',tone:'success'});
      await goto('/');
    } catch (cause) { error = cause instanceof WalletError ? cause.message : 'Could not create wallet.'; }
    finally { passphrase = ''; confirmation = ''; words = []; busy = false; }
  }

  async function recoverWallet() {
    busy = true; error = '';
    try {
      await walletService.recoverWallet(walletName, recovery.trim().replace(/\s+/g, ' '), passphrase);
      recovery = ''; passphrase = '';
      toast({title:'Wallet recovered',description:'Sync to restore transaction history.',tone:'success'});
      await goto('/');
    } catch (cause) { error = cause instanceof WalletError ? cause.message : 'Could not recover wallet.'; }
    finally { recovery = ''; passphrase = ''; busy = false; }
  }

  async function returnToWallet() {
    const registry = await walletService.profiles();
    const selected = registry.wallets.find((wallet) => wallet.id === registry.selectedWalletId);
    await goto(selected?.kind === 'multisig' ? '/multisig' : '/');
  }
</script>

<div class="onboarding-overlay">
  <header class="onboarding-brand"><span class="brand-mark">₿</span><span>Satchel</span><small>{networkName(defaultConfig.network).toUpperCase()}</small>{#if hasExistingWallet}<button class="onboarding-exit" aria-label="Close wallet setup" onclick={returnToWallet}><X size={17}/></button>{/if}</header>
  <main class="onboarding-card">
    {#if mode === 'home'}
      <span class="hero-mark">₿</span><h1>Your bitcoin.<br/>Simply held.</h1><p>A minimal onchain wallet with private keys that stay on your device.</p><div class="onboarding-actions"><Button size="large" class="full" onclick={() => mode = 'create'}>Create new wallet<ArrowRight size={17} /></Button><Button size="large" variant="secondary" class="full" onclick={() => mode = 'recover'}>Recover wallet</Button></div><div class="trust-line"><ShieldCheck size={15} />Non-custodial · Onchain only</div>
    {:else if mode === 'create'}
      <button class="back-link" onclick={() => mode = 'home'}><ArrowLeft size={16} />Back</button><span class="setup-step">STEP 1 OF 3</span><h1>Create wallet</h1><p>We’ll generate 24 recovery words. Write them down in order and keep them offline.</p><div class="setup-points"><div><ShieldCheck size={18}/><span><strong>You control the keys</strong><small>No account, email, or cloud backup.</small></span></div><div><KeyRound size={18}/><span><strong>Recovery words are the backup</strong><small>Anyone with them can spend your funds.</small></span></div></div><Button size="large" class="full" disabled={busy} onclick={generate}>{busy ? 'Generating…' : 'Generate recovery words'}</Button>
    {:else if mode === 'words'}
      <button class="back-link" onclick={() => mode = 'create'}><ArrowLeft size={16} />Back</button><span class="setup-step">STEP 2 OF 3</span><h1>Recovery words</h1><p>Write these down in order. Never store them in a screenshot or password manager.</p><div class="mnemonic-grid" class:blurred={!revealed}>{#each words as word, i}<div><span>{i+1}</span><strong>{word}</strong></div>{/each}</div><button class="reveal-button" onclick={() => revealed = !revealed}>{#if revealed}<EyeOff size={16}/>Hide words{:else}<Eye size={16}/>Reveal words{/if}</button><Button size="large" class="full" disabled={!revealed} onclick={() => mode = 'passphrase'}>I wrote them down<ArrowRight size={17}/></Button>
    {:else if mode === 'passphrase'}
      <button class="back-link" onclick={() => mode = nativeBackup ? 'create' : 'words'}><ArrowLeft size={16} />Back</button>
      <span class="setup-step">STEP 3 OF 3</span>
      <h1>Protect your wallet</h1>
      <p class="credential-intro">Choose the passphrase that completes your backup, unlocks Satchel, and authorizes payments.</p>
      <div class="credential-form">
        <label class="field">
          <span>Wallet name</span>
          <input bind:value={walletName} maxlength="48" placeholder="My wallet" />
        </label>
        <PasswordField label="Passphrase / PIN" bind:value={passphrase} placeholder="Enter a strong credential" autocomplete="new-password" hint="Prefer a memorable passphrase over a short numeric PIN."/>
        <PasswordField label="Confirm passphrase / PIN" bind:value={confirmation} placeholder="Enter it again" autocomplete="new-password" error={confirmation && passphrase !== confirmation ? 'Passphrases do not match.' : ''}/>
      </div>
      <div class="credential-warning"><ShieldCheck size={16}/><p><strong>Keep it with your backup.</strong><span>It cannot be reset. Different words or passphrase open a different wallet.</span></p></div>
      {#if error}<p class="form-error">{error}</p>{/if}
      <Button size="large" class="full" disabled={!walletName.trim() || !passphrase || passphrase !== confirmation || busy} onclick={finishCreate}><Check size={17}/>{busy ? 'Creating…' : 'Create wallet'}</Button>
    {:else}
      <button class="back-link" onclick={() => mode = 'home'}><ArrowLeft size={16} />Back</button><span class="setup-step">RECOVERY</span><h1>Recover wallet</h1><p>Enter your 24 recovery words in order, separated by spaces.</p><label class="field"><span>Wallet name</span><input bind:value={walletName} maxlength="48" placeholder="Recovered wallet" /></label><label class="field"><span>Recovery words</span><textarea bind:value={recovery} rows="5" placeholder="word1 word2 word3 …"></textarea><small>{recovery.trim() ? recovery.trim().split(/\s+/).length : 0} of 24 words</small></label><PasswordField label="Passphrase / PIN" bind:value={passphrase} placeholder="Enter the original passphrase" autocomplete="current-password" hint="This exact credential derives and unlocks the wallet."/>{#if error}<p class="form-error">{error}</p>{/if}<Button size="large" class="full" disabled={!walletName.trim() || recovery.trim().split(/\s+/).length !== 24 || !passphrase || busy} onclick={recoverWallet}>{busy ? 'Recovering…' : 'Recover wallet'}<ArrowRight size={17}/></Button>
    {/if}
  </main>
  <footer class="onboarding-footer">Keys stay on this device · Open source</footer>
</div>
