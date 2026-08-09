<script lang="ts">
  import { ArrowLeft, ArrowRight, Check, Cpu, Eye, EyeOff, KeyRound, ShieldCheck, Users, X } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import SetupProgress from '$lib/components/SetupProgress.svelte';
  import { toast } from '$lib/stores/toasts';
  import { defaultConfig, networkName } from '$lib/config';
  import { MAX_SUPPLEMENTAL_COIN_FLIPS, MAX_SUPPLEMENTAL_DICE_ROLLS, MIN_SUPPLEMENTAL_COIN_FLIPS, MIN_SUPPLEMENTAL_DICE_ROLLS, walletService, WalletError, type SupplementalEntropyInput } from '$lib/wallet';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onDestroy, onMount } from 'svelte';
  import { MAX_WALLET_PASSPHRASE_BYTES, recoveryOrderMatches, shuffledRecoveryWords, utf8ByteLength, type RecoveryWord } from '$lib/mnemonic-verification';
  let mode = $state<'home'|'choose'|'create'|'words'|'verify'|'passphrase'|'recover'>('home');
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
  let backupAcknowledged = $state(false);
  let verificationWords = $state<RecoveryWord[]>([]);
  let selectedWords = $state<RecoveryWord[]>([]);
  let verificationError = $state('');
  let draggedWord = $state<RecoveryWord | null>(null);
  let supplementalSource = $state<'none' | 'coin' | 'dice'>('none');
  let supplementalOutcomes = $state('');
  const softwareSteps = ['Generate', 'Back up', 'Protect'];
  let passphraseError = $derived(utf8ByteLength(passphrase) > MAX_WALLET_PASSPHRASE_BYTES ? 'The wallet passphrase is too long.' : '');
  let supplementalMinimum = $derived(supplementalSource === 'coin' ? MIN_SUPPLEMENTAL_COIN_FLIPS : MIN_SUPPLEMENTAL_DICE_ROLLS);
  let supplementalMaximum = $derived(supplementalSource === 'coin' ? MAX_SUPPLEMENTAL_COIN_FLIPS : MAX_SUPPLEMENTAL_DICE_ROLLS);
  let supplementalReady = $derived(supplementalSource === 'none' || supplementalOutcomes.length >= supplementalMinimum);

  onMount(async () => {
    hasExistingWallet = await walletService.exists();
    if (hasExistingWallet && page.url.searchParams.get('add') !== '1') await goto('/unlock');
  });
  onDestroy(() => { void walletService.cancelOnboarding(); words = []; recovery = ''; passphrase = ''; confirmation = ''; supplementalOutcomes = ''; backupAcknowledged = false; });

  function chooseSupplementalSource(source: 'none' | 'coin' | 'dice') {
    supplementalSource = source;
    supplementalOutcomes = '';
    error = '';
  }

  function recordSupplementalOutcome(outcome: string) {
    if (supplementalSource === 'none' || supplementalOutcomes.length >= supplementalMaximum) return;
    supplementalOutcomes += outcome;
    error = '';
  }

  async function generate() {
    busy = true; error = '';
    const supplementalEntropy: SupplementalEntropyInput | undefined = supplementalSource === 'none'
      ? undefined
      : { source: supplementalSource, outcomes: supplementalOutcomes };
    supplementalOutcomes = '';
    try {
      const presentation = await walletService.generateMnemonic(supplementalEntropy);
      if (presentation.mode === 'fixture') {
        words = presentation.words;
        verificationWords = shuffledRecoveryWords(words);
        selectedWords = [];
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

  function beginVerification() {
    revealed = false;
    selectedWords = [];
    verificationError = '';
    mode = 'verify';
  }

  function selectRecoveryWord(word: RecoveryWord) {
    if (selectedWords.some(({ id }) => id === word.id)) return;
    selectedWords = [...selectedWords, word];
    verificationError = '';
  }

  function removeRecoveryWord(position: number) {
    selectedWords = selectedWords.filter((_, index) => index !== position);
    verificationError = '';
  }

  function dropRecoveryWord(position: number) {
    if (!draggedWord) return;
    const withoutDragged = selectedWords.filter(({ id }) => id !== draggedWord?.id);
    withoutDragged.splice(Math.min(position, withoutDragged.length), 0, draggedWord);
    selectedWords = withoutDragged;
    verificationError = '';
    draggedWord = null;
  }

  function confirmRecoveryOrder() {
    if (!recoveryOrderMatches(selectedWords, words.length)) {
      verificationError = 'That order does not match your recovery words. Check your written backup and try again.';
      return;
    }
    selectedWords = [];
    verificationWords = [];
    mode = 'passphrase';
  }

  async function finishCreate() {
    busy = true; error = '';
    try {
      await walletService.createWallet(walletName, passphrase);
      words = []; passphrase = ''; confirmation = ''; backupAcknowledged = false;
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
      <span class="hero-mark">₿</span><h1>{hasExistingWallet ? 'Add a wallet' : 'Your bitcoin.\nSimply held.'}</h1><p>{hasExistingWallet ? 'Choose how this wallet will be secured.' : 'Create a new wallet or recover one you already own.'}</p><div class="onboarding-actions simple"><Button size="large" class="full" onclick={() => mode = 'choose'}>Create new wallet<ArrowRight size={17} /></Button><Button size="large" variant="secondary" class="full" onclick={() => mode = 'recover'}>Recover wallet</Button></div><div class="trust-line"><ShieldCheck size={15} />Non-custodial · Onchain only</div>
    {:else if mode === 'choose'}
      <button class="back-link" onclick={() => mode = 'home'}><ArrowLeft size={16} />Back</button>
      <span class="setup-step wallet-choice-step">NEW WALLET</span>
      <h1>Choose wallet type</h1>
      <p>How do you want to secure it?</p>
      <div class="wallet-type-grid">
        <button class="wallet-type-card recommended" onclick={() => mode = 'create'}>
          <span class="wallet-type-icon"><KeyRound size={20} /></span>
          <span class="wallet-type-copy"><strong>Software wallet</strong><small>24 recovery words on this device</small></span>
          <span class="wallet-type-meta">Simple</span>
          <ArrowRight class="wallet-type-arrow" size={17} />
        </button>
        <a class="wallet-type-card" href="/hardware/new">
          <span class="wallet-type-icon"><Cpu size={20} /></span>
          <span class="wallet-type-copy"><strong>Hardware wallet</strong><small>One key stays on your signer</small></span>
          <span class="wallet-type-meta">External key</span>
          <ArrowRight class="wallet-type-arrow" size={17} />
        </a>
        <a class="wallet-type-card" href="/multisig/new">
          <span class="wallet-type-icon"><Users size={20} /></span>
          <span class="wallet-type-copy"><strong>Shared or recovery</strong><small>Multiple keys or a recovery path</small></span>
          <span class="wallet-type-meta">Advanced</span>
          <ArrowRight class="wallet-type-arrow" size={17} />
        </a>
      </div>
    {:else if mode === 'create'}
      <button class="back-link" onclick={() => { chooseSupplementalSource('none'); mode = 'choose'; }}><ArrowLeft size={16} />Back</button>
      <SetupProgress steps={softwareSteps} current={1} label="Software wallet setup progress" context="SOFTWARE WALLET"/>
      <h1>Generate wallet</h1>
      <p>Satchel will generate 24 recovery words securely on this device. Write them down in order and keep them offline.</p>
      <div class="setup-points"><div><ShieldCheck size={18}/><span><strong>You control the keys</strong><small>No account, email, or cloud backup.</small></span></div><div><KeyRound size={18}/><span><strong>Recovery words are the backup</strong><small>Anyone with them can spend your funds.</small></span></div></div>
      <details class="supplemental-entropy">
        <summary>Advanced: add physical randomness</summary>
        <p>Optional. Satchel always requires 256-bit operating-system randomness. Physical results are mixed in only as an additional input.</p>
        <div class="entropy-source-options" role="group" aria-label="Supplemental entropy source">
          <button class:active={supplementalSource === 'none'} aria-pressed={supplementalSource === 'none'} onclick={() => chooseSupplementalSource('none')}>None</button>
          <button class:active={supplementalSource === 'coin'} aria-pressed={supplementalSource === 'coin'} onclick={() => chooseSupplementalSource('coin')}>Coin flips</button>
          <button class:active={supplementalSource === 'dice'} aria-pressed={supplementalSource === 'dice'} onclick={() => chooseSupplementalSource('dice')}>Six-sided die</button>
        </div>
        {#if supplementalSource !== 'none'}
          <div class="entropy-entry">
            <div class="entropy-progress">
              <span>{supplementalSource === 'coin' ? 'Flip a physical coin and record each result.' : 'Roll a physical six-sided die and record each result.'}</span>
              <strong>{supplementalOutcomes.length} / {supplementalMinimum} minimum</strong>
            </div>
            <div class="entropy-outcomes" aria-live="polite">
              <code>{supplementalOutcomes.slice(-32) || 'No results recorded'}</code>
              {#if supplementalOutcomes.length > 32}<small>Showing the latest 32</small>{/if}
            </div>
            <div class:coin={supplementalSource === 'coin'} class="entropy-result-buttons" role="group" aria-label="Record physical result">
              {#if supplementalSource === 'coin'}
                <button aria-label="Record heads" disabled={supplementalOutcomes.length >= supplementalMaximum} onclick={() => recordSupplementalOutcome('H')}>Heads</button>
                <button aria-label="Record tails" disabled={supplementalOutcomes.length >= supplementalMaximum} onclick={() => recordSupplementalOutcome('T')}>Tails</button>
              {:else}
                {#each ['1', '2', '3', '4', '5', '6'] as result}
                  <button aria-label={`Record die result ${result}`} disabled={supplementalOutcomes.length >= supplementalMaximum} onclick={() => recordSupplementalOutcome(result)}>{result}</button>
                {/each}
              {/if}
            </div>
            <div class="entropy-edit-actions">
              <button disabled={!supplementalOutcomes} onclick={() => supplementalOutcomes = supplementalOutcomes.slice(0, -1)}>Undo last</button>
              <button disabled={!supplementalOutcomes} onclick={() => supplementalOutcomes = ''}>Clear</button>
            </div>
            <p class="entropy-caution"><strong>Use real physical results.</strong> This cannot protect a wallet created on a compromised device, and the operating-system source never becomes optional.</p>
          </div>
        {/if}
      </details>
      {#if error}<p class="form-error" role="alert">{error}</p>{/if}
      <Button size="large" class="full" disabled={!supplementalReady} loading={busy} loadingLabel="Generating securely…" onclick={generate}>Generate 24 recovery words</Button>
    {:else if mode === 'words'}
      <button class="back-link" onclick={() => mode = 'create'}><ArrowLeft size={16} />Back</button><SetupProgress steps={softwareSteps} current={2} label="Software wallet setup progress" context="SOFTWARE WALLET"/><h1>Recovery words</h1><p>Write these down in order. Never store them in a screenshot or password manager.</p>
      {#if revealed}
        <div class="mnemonic-grid" aria-label="Recovery words">{#each words as word, i}<div><span>{i+1}</span><strong>{word}</strong></div>{/each}</div>
        <button class="reveal-button" onclick={() => revealed = false}><EyeOff size={16}/>Hide words</button>
      {:else}
        <div class="recovery-reveal-gate">
          <span class="recovery-reveal-icon"><EyeOff size={20}/></span>
          <div><strong>Check your surroundings</strong><p>Only reveal your recovery words in a private place. Make sure no person, camera, or screen sharing can see them.</p></div>
          <Button variant="secondary" class="full" onclick={() => revealed = true}><Eye size={16}/>I’m private — reveal words</Button>
        </div>
      {/if}
      <Button size="large" class="full" disabled={!revealed} onclick={beginVerification}>I wrote them down<ArrowRight size={17}/></Button>
    {:else if mode === 'verify'}
      <button class="back-link" onclick={() => { selectedWords = []; verificationError = ''; mode = 'words'; }}><ArrowLeft size={16} />Back</button>
      <SetupProgress steps={softwareSteps} current={2} label="Software wallet setup progress" context="SOFTWARE WALLET"/>
      <h1>Confirm your backup</h1>
      <p>Choose every word in order. This proves your written backup can reconstruct the wallet.</p>
      <div class="mnemonic-verification" aria-label="Recovery word order verification">
        <ol class="mnemonic-slots" aria-label="Your recovery word sequence">
          {#each Array(words.length) as _, position}
            <li
              class:filled={!!selectedWords[position]}
              ondragover={(event) => event.preventDefault()}
              ondrop={() => dropRecoveryWord(position)}
            >
              <span>{position + 1}</span>
              {#if selectedWords[position]}
                <button
                  draggable="true"
                  ondragstart={() => draggedWord = selectedWords[position]}
                  onclick={() => removeRecoveryWord(position)}
                  aria-label={`Remove ${selectedWords[position].word} from position ${position + 1}`}
                >{selectedWords[position].word}</button>
              {:else}<small>Empty</small>{/if}
            </li>
          {/each}
        </ol>
        <div class="mnemonic-pool" role="group" aria-label="Shuffled recovery words" ondragover={(event) => event.preventDefault()} ondrop={() => { if (draggedWord) removeRecoveryWord(selectedWords.findIndex(({ id }) => id === draggedWord?.id)); draggedWord = null; }}>
          {#each verificationWords as word (word.id)}
            <button
              disabled={selectedWords.some(({ id }) => id === word.id)}
              draggable={!selectedWords.some(({ id }) => id === word.id)}
              ondragstart={() => draggedWord = word}
              onclick={() => selectRecoveryWord(word)}
            >{word.word}</button>
          {/each}
        </div>
      </div>
      <p class="verification-hint">Tap a placed word to return it. You can also drag words between the pool and sequence.</p>
      {#if verificationError}<p class="form-error" role="alert">{verificationError}</p>{/if}
      <Button size="large" class="full" disabled={selectedWords.length !== words.length} onclick={confirmRecoveryOrder}>Confirm order<ArrowRight size={17}/></Button>
    {:else if mode === 'passphrase'}
      <button class="back-link" onclick={() => mode = nativeBackup ? 'create' : 'words'}><ArrowLeft size={16} />Back</button>
      <SetupProgress steps={softwareSteps} current={3} label="Software wallet setup progress" context="SOFTWARE WALLET"/>
      <h1>Protect your wallet</h1>
      <p class="credential-intro">Choose the BIP39 wallet passphrase that completes this backup. The same passphrase unlocks Satchel.</p>
      <div class="credential-form">
        <label class="field">
          <span>Wallet name</span>
          <input bind:value={walletName} maxlength="48" placeholder="My wallet" />
        </label>
        <PasswordField label="Wallet passphrase" bind:value={passphrase} placeholder="Enter a strong passphrase" autocomplete="new-password" hint="Keep it with your recovery words. It also unlocks Satchel on this device." error={passphraseError}/>
        <PasswordField label="Confirm wallet passphrase" bind:value={confirmation} placeholder="Enter it again" autocomplete="new-password" error={confirmation && passphrase !== confirmation ? 'Passphrases do not match.' : ''}/>
      </div>
      <label class="credential-warning credential-ack"><input type="checkbox" bind:checked={backupAcknowledged}/><ShieldCheck size={16}/><p><strong>Keep it with your backup.</strong><span>I understand this exact passphrase is required with my 24 words. It cannot be reset; a different passphrase opens a different wallet.</span></p></label>
      {#if error}<p class="form-error" role="alert">{error.replace('passphrase / PIN', 'wallet passphrase')}</p>{/if}
      <Button size="large" class="full" disabled={!walletName.trim() || !passphrase || !!passphraseError || passphrase !== confirmation || !backupAcknowledged} loading={busy} loadingLabel="Creating wallet…" onclick={finishCreate}><Check size={17}/>Create wallet</Button>
    {:else}
      <button class="back-link" onclick={() => mode = 'home'}><ArrowLeft size={16} />Back</button><span class="setup-step">RECOVERY</span><h1>Recover wallet</h1><p>Enter your 24 recovery words in order, separated by spaces.</p><label class="field"><span>Wallet name</span><input bind:value={walletName} maxlength="48" placeholder="Recovered wallet" /></label><label class="field"><span>Recovery words</span><textarea bind:value={recovery} rows="5" placeholder="word1 word2 word3 …"></textarea><small>{recovery.trim() ? recovery.trim().split(/\s+/).length : 0} of 24 words</small></label><PasswordField label="Wallet passphrase" bind:value={passphrase} placeholder="Enter the original wallet passphrase" autocomplete="current-password" hint="This exact BIP39 passphrase is required with the recovery words and also unlocks Satchel." error={passphraseError}/>{#if error}<p class="form-error" role="alert">{error.replace('passphrase / PIN', 'wallet passphrase')}</p>{/if}<Button size="large" class="full" disabled={!walletName.trim() || recovery.trim().split(/\s+/).length !== 24 || !passphrase || !!passphraseError} loading={busy} loadingLabel="Recovering wallet…" onclick={recoverWallet}>Recover wallet<ArrowRight size={17}/></Button>
    {/if}
  </main>
  <footer class="onboarding-footer">Keys stay on this device · Open source</footer>
</div>
