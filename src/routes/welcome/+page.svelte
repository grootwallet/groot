<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate, localizedError } from '$lib/i18n-catalog';
  import {
    ArrowLeft,
    ArrowRight,
    Check,
    ChevronRight,
    Copy,
    Cpu,
    Eye,
    EyeOff,
    KeyRound,
    Settings,
    ShieldCheck,
    Smartphone,
    RotateCcw,
    X
  } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import FieldCounter from '$lib/components/FieldCounter.svelte';
  import InsightTip from '$lib/components/InsightTip.svelte';
  import ReadableIdentifier from '$lib/components/ReadableIdentifier.svelte';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import BrandLockup from '$lib/components/BrandLockup.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import SetupProgress from '$lib/components/SetupProgress.svelte';
  import { copyText } from '$lib/clipboard';
  import { combineDescriptorBranches } from '$lib/descriptors';
  import { toast } from '$lib/stores/toasts';
  import { defaultConfig, networkName } from '$lib/config';
  import {
    MAX_SUPPLEMENTAL_COIN_FLIPS,
    MAX_SUPPLEMENTAL_DICE_ROLLS,
    MIN_SUPPLEMENTAL_COIN_FLIPS,
    MIN_SUPPLEMENTAL_DICE_ROLLS,
    walletService,
    type RuntimePlatform,
    type SupplementalEntropyInput
  } from '$lib/wallet';
  import { beforeNavigate, goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onDestroy, onMount, tick } from 'svelte';
  import {
    MAX_WALLET_PASSPHRASE_BYTES,
    MIN_NEW_WALLET_PASSPHRASE_CHARACTERS,
    recoveryOrderMatches,
    shuffledRecoveryWords,
    unicodeCharacterLength,
    utf8ByteLength,
    type RecoveryWord
  } from '$lib/mnemonic-verification';
  let mode = $state<
    'home' | 'choose' | 'create' | 'words' | 'verify' | 'passphrase' | 'created' | 'recover'
  >('home');
  let revealed = $state(false);
  let passphrase = $state('');
  let confirmation = $state('');
  let words = $state<string[]>([]);
  let nativeBackup = $state(false);
  let busy = $state(false);
  let error = $state('');
  let walletName = $state('');
  let hasExistingWallet = $state(false);
  let backupAcknowledged = $state(false);
  let backupVerified = $state(false);
  let verificationWords = $state<RecoveryWord[]>([]);
  let selectedWords = $state<RecoveryWord[]>([]);
  let verificationError = $state('');
  let draggedWord = $state<RecoveryWord | null>(null);
  let supplementalSource = $state<'none' | 'coin' | 'dice'>('none');
  let supplementalOutcomes = $state('');
  let runtimeIdentity = $state<RuntimePlatform | null>(null);
  let createdMasterFingerprint = $state('');
  let createdWalletDescriptor = $state('');
  let fingerprintCopied = $state(false);
  let descriptorCopied = $state(false);
  let createdWalletDetailsOpen = $state(false);
  const softwareSteps = ['Generate', 'Back up', 'Protect'];
  let passphraseError = $derived(
    utf8ByteLength(passphrase) > MAX_WALLET_PASSPHRASE_BYTES
      ? 'The wallet passphrase is too long.'
      : mode === 'passphrase' &&
          passphrase &&
          unicodeCharacterLength(passphrase) < MIN_NEW_WALLET_PASSPHRASE_CHARACTERS
        ? translate($locale, 'Use at least 16 characters. Letters-only passphrases are allowed.')
        : ''
  );
  let supplementalMinimum = $derived(
    supplementalSource === 'coin' ? MIN_SUPPLEMENTAL_COIN_FLIPS : MIN_SUPPLEMENTAL_DICE_ROLLS
  );
  let supplementalMaximum = $derived(
    supplementalSource === 'coin' ? MAX_SUPPLEMENTAL_COIN_FLIPS : MAX_SUPPLEMENTAL_DICE_ROLLS
  );
  let supplementalReady = $derived(
    supplementalSource === 'none' || supplementalOutcomes.length >= supplementalMinimum
  );

  onMount(async () => {
    runtimeIdentity = await walletService.runtimePlatform();
    hasExistingWallet = await walletService.exists();
    if (hasExistingWallet && page.url.searchParams.get('add') !== '1') await goto('/unlock');
  });
  beforeNavigate(() => undefined);
  onDestroy(() => {
    void walletService.cancelOnboarding(false);
    words = [];
    passphrase = '';
    confirmation = '';
    supplementalOutcomes = '';
    backupAcknowledged = false;
    backupVerified = false;
  });

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
    busy = true;
    error = '';
    const supplementalEntropy: SupplementalEntropyInput | undefined =
      supplementalSource === 'none'
        ? undefined
        : { source: supplementalSource, outcomes: supplementalOutcomes };
    supplementalOutcomes = '';
    try {
      const presentation = await walletService.generateMnemonic(supplementalEntropy);
      if (presentation.mode === 'fixture') {
        words = presentation.words;
        backupVerified = false;
        verificationWords = shuffledRecoveryWords(words);
        selectedWords = [];
        mode = 'words';
      } else {
        words = [];
        backupVerified = presentation.backupVerified;
        nativeBackup = true;
        revealed = true;
        mode = 'passphrase';
      }
    } catch (cause) {
      error = localizedError(cause, $locale, 'Could not generate recovery words.');
    } finally {
      busy = false;
    }
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
      verificationError =
        'That order does not match your recovery words. Check your written backup and try again.';
      return;
    }
    selectedWords = [];
    verificationWords = [];
    backupVerified = true;
    mode = 'passphrase';
    toast({
      title: 'Recovery backup verified',
      description: 'Your written words matched this wallet.',
      tone: 'success'
    });
  }

  function verifyLater() {
    selectedWords = [];
    verificationWords = [];
    backupVerified = false;
    mode = 'passphrase';
  }

  function backFromPassphrase() {
    if (nativeBackup) {
      mode = 'create';
      return;
    }
    verificationWords = shuffledRecoveryWords(words);
    selectedWords = [];
    mode = 'words';
  }

  function beginExternalWalletSetup(next: '/hardware/new' | '/multisig/new') {
    void goto(next);
  }

  async function finishCreate() {
    busy = true;
    error = '';
    // Let the loading state reach the screen before native key derivation and
    // persistence begin. Some WebKit builds otherwise paint only after IPC.
    await tick();
    try {
      const creation = await walletService.createWallet(walletName, passphrase, backupVerified);
      createdMasterFingerprint = creation.masterFingerprint;
      createdWalletDescriptor =
        combineDescriptorBranches(creation.externalDescriptor, creation.internalDescriptor) ??
        creation.externalDescriptor;
      mode = 'created';
      words = [];
      passphrase = '';
      confirmation = '';
      backupAcknowledged = false;
      toast({
        title: 'Wallet created',
        description: !creation.networkSetupCopied
          ? 'Network setup was not copied. Configure it in Settings.'
          : backupVerified
            ? translate($locale, 'Your {network} wallet is ready.', {
                network: networkName(defaultConfig.network)
              })
            : 'Your wallet is ready. Verify its recovery backup soon.',
        tone: creation.networkSetupCopied ? 'success' : 'default'
      });
    } catch (cause) {
      error = localizedError(cause, $locale, 'Could not create wallet.');
    } finally {
      passphrase = '';
      confirmation = '';
      words = [];
      busy = false;
    }
  }

  async function copyCreatedFingerprint() {
    await copyText(createdMasterFingerprint, 'identifier');
    fingerprintCopied = true;
    toast({ title: translate($locale, 'Master fingerprint copied'), tone: 'success' });
    setTimeout(() => (fingerprintCopied = false), 1_500);
  }

  async function copyCreatedDescriptor() {
    await copyText(createdWalletDescriptor, 'public-wallet-data');
    descriptorCopied = true;
    toast({
      title: translate($locale, 'Wallet descriptor copied'),
      description: 'Public watch-only descriptor copied.',
      tone: 'success'
    });
    setTimeout(() => (descriptorCopied = false), 1_500);
  }

  async function recoverWallet() {
    busy = true;
    error = '';
    try {
      await walletService.recoverWallet(walletName, passphrase);
      passphrase = '';
      toast({
        title: 'Wallet recovered',
        description: 'Approve the history scan to restore transaction history.',
        tone: 'success'
      });
      await goto('/?initial=recovered');
    } catch (cause) {
      error = localizedError(cause, $locale, 'Could not recover wallet.');
    } finally {
      passphrase = '';
      busy = false;
    }
  }

  async function returnToWallet() {
    const registry = await walletService.profiles();
    const selected = registry.wallets.find((wallet) => wallet.id === registry.selectedWalletId);
    await goto(selected?.kind === 'multisig' ? '/multisig' : '/');
  }
</script>

<div class="onboarding-overlay" class:welcome-home={mode === 'home'}>
  <header class="onboarding-brand">
    <span class="onboarding-brand-lockup"><BrandLockup /></span><small
      >{networkName(defaultConfig.network).toUpperCase()}</small
    ><a class="onboarding-settings" href="/settings" aria-label={translate($locale, 'Settings')}
      ><Settings size={17} /></a
    >{#if hasExistingWallet}<button
        class="onboarding-exit"
        aria-label={translate($locale, 'Close wallet setup')}
        onclick={returnToWallet}><X size={17} /></button
      >{/if}
  </header>
  <main
    class="onboarding-card"
    class:home-card={mode === 'home'}
    class:wallet-choice-card={mode === 'choose'}
  >
    {#if mode === 'home'}
      <span class="hero-mark"><BrandMark size={34} /></span>
      <h1>
        {translate($locale, hasExistingWallet ? 'Add a wallet' : 'Your bitcoin.\nSimply held.')}
      </h1>
      <p>
        {translate(
          $locale,
          'Create in Groot, connect existing hardware, or recover a software wallet.'
        )}
      </p>
      <div class="onboarding-actions simple">
        <Button size="large" class="full" onclick={() => (mode = 'choose')}
          >{translate($locale, 'Add wallet')}<ArrowRight size={17} /></Button
        ><Button size="large" variant="secondary" class="full" onclick={() => (mode = 'recover')}
          >{translate($locale, 'Recover software wallet')}</Button
        >
      </div>
      <div class="trust-line">
        <ShieldCheck size={15} />{translate($locale, 'Non-custodial · Onchain only')}
      </div>
    {:else if mode === 'choose'}
      <button class="back-link" onclick={() => (mode = 'home')}
        ><ArrowLeft size={16} />{translate($locale, 'Back')}</button
      >
      <span class="setup-step wallet-choice-step">{translate($locale, 'WALLET SETUP')}</span>
      <h1>{translate($locale, 'Choose your wallet')}</h1>
      <p>
        {translate($locale, 'Start with what feels right. You can always add another.')}
      </p>
      <div class="wallet-type-grid">
        <button class="wallet-type-card software" onclick={() => (mode = 'create')}>
          <span class="wallet-type-icon"><KeyRound size={20} /></span>
          <span class="wallet-type-copy"
            ><strong>{translate($locale, 'Software wallet')}</strong><small
              >{translate($locale, 'Create and back up your keys in Groot.')}</small
            ></span
          >
          <span class="wallet-type-footer"
            ><span class="wallet-type-meta">{translate($locale, 'On this device')}</span><ArrowRight
              class="wallet-type-arrow"
              size={17}
            /></span
          >
        </button>
        {#if runtimeIdentity?.mobile && defaultConfig.network !== 'mainnet'}<a
            class="wallet-type-card multisig"
            href="/mobile/pair"
          >
            <span class="wallet-type-icon"><Smartphone size={20} /></span>
            <span class="wallet-type-copy"
              ><strong>{translate($locale, 'Connect desktop app')}</strong><small
                >{translate($locale, 'Add this phone as one signer in a shared wallet.')}</small
              ></span
            >
            <span class="wallet-type-footer"
              ><span class="wallet-type-meta">{translate($locale, 'No account')}</span>
              <ArrowRight class="wallet-type-arrow" size={17} /></span
            >
          </a>
          <a class="wallet-type-card multisig" href="/mobile/recover">
            <span class="wallet-type-icon"><RotateCcw size={20} /></span>
            <span class="wallet-type-copy"
              ><strong>{translate($locale, 'Restore phone signer')}</strong><small
                >{translate(
                  $locale,
                  'Recover a shared wallet from desktop and its 24 words.'
                )}</small
              ></span
            >
            <span class="wallet-type-footer"
              ><span class="wallet-type-meta">{translate($locale, 'Replacement phone')}</span>
              <ArrowRight class="wallet-type-arrow" size={17} /></span
            >
          </a>
          <a class="wallet-type-card hardware" href="/mobile/watch">
            <span class="wallet-type-icon"><Eye size={20} /></span>
            <span class="wallet-type-copy"
              ><strong>{translate($locale, 'Watch desktop wallet')}</strong><small
                >{translate($locale, 'Import a hardware wallet without its signing key.')}</small
              ></span
            >
            <span class="wallet-type-footer"
              ><span class="wallet-type-meta">{translate($locale, 'Watch-only')}</span>
              <ArrowRight class="wallet-type-arrow" size={17} /></span
            >
          </a>{/if}
        <button
          class="wallet-type-card hardware"
          onclick={() => beginExternalWalletSetup('/hardware/new')}
        >
          <span class="wallet-type-icon"><Cpu size={20} /></span>
          <span class="wallet-type-copy"
            ><strong>{translate($locale, 'Hardware signer')}</strong><small
              >{translate($locale, 'Connect a device you already trust.')}</small
            ></span
          >
          <span class="wallet-type-footer"
            ><span class="wallet-type-meta">{translate($locale, 'Separate device')}</span
            ><ArrowRight class="wallet-type-arrow" size={17} /></span
          >
        </button>
        <button
          class="wallet-type-card multisig"
          onclick={() => beginExternalWalletSetup('/multisig/new')}
        >
          <span class="wallet-type-icon"><ShieldCheck size={20} /></span>
          <span class="wallet-type-copy"
            ><strong>{translate($locale, 'Multisig wallet')}</strong><small
              >{translate(
                $locale,
                'Custom spending, recovery, inheritance, or shared control.'
              )}</small
            ></span
          >
          <span class="wallet-type-footer"
            ><span class="wallet-type-meta">{translate($locale, 'Flexible security')}</span
            ><ArrowRight class="wallet-type-arrow" size={17} /></span
          >
        </button>
      </div>
    {:else if mode === 'create'}
      <button
        class="back-link"
        onclick={() => {
          chooseSupplementalSource('none');
          mode = 'choose';
        }}><ArrowLeft size={16} />{translate($locale, 'Back')}</button
      >
      <SetupProgress
        steps={softwareSteps}
        current={1}
        label={translate($locale, 'Software wallet setup progress')}
        context="SOFTWARE WALLET"
      />
      <h1>{translate($locale, 'Generate wallet')}</h1>
      <p>
        {translate(
          $locale,
          'Groot will generate 24 recovery words securely on this device. Write them down in order and\n        keep them offline.'
        )}
      </p>
      <div class="setup-points">
        <div>
          <ShieldCheck size={18} /><span
            ><strong>{translate($locale, 'You control the keys')}</strong><small
              >{translate($locale, 'No account, email, or cloud backup.')}</small
            ></span
          >
        </div>
        <div>
          <KeyRound size={18} /><span
            ><strong>{translate($locale, 'Recovery words are the backup')}</strong><small
              >{translate($locale, 'Anyone with them can spend your funds.')}</small
            ></span
          >
        </div>
      </div>
      <details class="supplemental-entropy">
        <summary>{translate($locale, 'Advanced: add physical randomness')}</summary>
        <p>
          {translate(
            $locale,
            'Optional. Groot always requires 256-bit operating-system randomness. Physical results are\n          mixed in only as an additional input.'
          )}
        </p>
        <div
          class="entropy-source-options"
          role="group"
          aria-label={translate($locale, 'Supplemental entropy source')}
        >
          <button
            class:active={supplementalSource === 'none'}
            aria-pressed={supplementalSource === 'none'}
            onclick={() => chooseSupplementalSource('none')}>{translate($locale, 'None')}</button
          >
          <button
            class:active={supplementalSource === 'coin'}
            aria-pressed={supplementalSource === 'coin'}
            onclick={() => chooseSupplementalSource('coin')}
            >{translate($locale, 'Coin flips')}</button
          >
          <button
            class:active={supplementalSource === 'dice'}
            aria-pressed={supplementalSource === 'dice'}
            onclick={() => chooseSupplementalSource('dice')}
            >{translate($locale, 'Six-sided die')}</button
          >
        </div>
        {#if supplementalSource !== 'none'}
          <div class="entropy-entry">
            <div class="entropy-progress">
              <span
                >{translate(
                  $locale,
                  supplementalSource === 'coin'
                    ? 'Flip a physical coin and record each result.'
                    : 'Roll a physical six-sided die and record each result.'
                )}</span
              >
              <strong
                >{supplementalOutcomes.length} / {supplementalMinimum}
                {translate($locale, 'minimum')}</strong
              >
            </div>
            <div class="entropy-outcomes" aria-live="polite">
              <code
                >{translate(
                  $locale,
                  supplementalOutcomes.slice(-32) || 'No results recorded'
                )}</code
              >
              {#if supplementalOutcomes.length > 32}<small
                  >{translate($locale, 'Showing the latest 32')}</small
                >{/if}
            </div>
            <div
              class:coin={supplementalSource === 'coin'}
              class="entropy-result-buttons"
              role="group"
              aria-label={translate($locale, 'Record physical result')}
            >
              {#if supplementalSource === 'coin'}
                <button
                  aria-label={translate($locale, 'Record heads')}
                  disabled={supplementalOutcomes.length >= supplementalMaximum}
                  onclick={() => recordSupplementalOutcome('H')}
                  >{translate($locale, 'Heads')}</button
                >
                <button
                  aria-label={translate($locale, 'Record tails')}
                  disabled={supplementalOutcomes.length >= supplementalMaximum}
                  onclick={() => recordSupplementalOutcome('T')}
                  >{translate($locale, 'Tails')}</button
                >
              {:else}
                {#each ['1', '2', '3', '4', '5', '6'] as result}
                  <button
                    aria-label={translate($locale, 'Record die result {result}', { result })}
                    disabled={supplementalOutcomes.length >= supplementalMaximum}
                    onclick={() => recordSupplementalOutcome(result)}>{result}</button
                  >
                {/each}
              {/if}
            </div>
            <div class="entropy-edit-actions">
              <button
                disabled={!supplementalOutcomes}
                onclick={() => (supplementalOutcomes = supplementalOutcomes.slice(0, -1))}
                >{translate($locale, 'Undo last')}</button
              >
              <button disabled={!supplementalOutcomes} onclick={() => (supplementalOutcomes = '')}
                >{translate($locale, 'Clear')}</button
              >
            </div>
            <p class="entropy-caution">
              <strong>{translate($locale, 'Use real physical results.')}</strong>
              {translate(
                $locale,
                'This cannot protect a wallet created on a compromised\n              device, and the operating-system source never becomes optional.'
              )}
            </p>
          </div>
        {/if}
      </details>
      {#if error}<p class="form-error" role="alert">{error}</p>{/if}
      <Button
        size="large"
        class="full"
        disabled={!supplementalReady}
        loading={busy}
        loadingLabel={translate($locale, 'Generating securely…')}
        onclick={generate}>{translate($locale, 'Generate 24 recovery words')}</Button
      >
    {:else if mode === 'words'}
      <button class="back-link" onclick={() => (mode = 'create')}
        ><ArrowLeft size={16} />{translate($locale, 'Back')}</button
      ><SetupProgress
        steps={softwareSteps}
        current={2}
        label={translate($locale, 'Software wallet setup progress')}
        context="SOFTWARE WALLET"
      />
      <h1>{translate($locale, 'Recovery words')}</h1>
      <p>
        {translate(
          $locale,
          'Write these down in order. Never store them in a screenshot or password manager.'
        )}
      </p>
      {#if revealed}
        <div class="mnemonic-grid" aria-label={translate($locale, 'Recovery words')}>
          {#each words as word, i}<div><span>{i + 1}</span><strong>{word}</strong></div>{/each}
        </div>
        <button class="reveal-button" onclick={() => (revealed = false)}
          ><EyeOff size={16} />{translate($locale, 'Hide words')}</button
        >
      {:else}
        <div class="recovery-reveal-gate">
          <span class="recovery-reveal-icon"><EyeOff size={20} /></span>
          <div>
            <strong>{translate($locale, 'Check your surroundings')}</strong>
            <p>
              {translate(
                $locale,
                'Only reveal your recovery words in a private place. Make sure no person, camera, or\n              screen sharing can see them.'
              )}
            </p>
          </div>
          <Button variant="secondary" class="full" onclick={() => (revealed = true)}
            ><Eye size={16} />{translate($locale, 'I’m private. Reveal words')}</Button
          >
        </div>
      {/if}
      <Button size="large" class="full" disabled={!revealed} onclick={beginVerification}
        >{translate($locale, 'I wrote them down')}<ArrowRight size={17} /></Button
      >
    {:else if mode === 'verify'}
      <button
        class="back-link"
        onclick={() => {
          selectedWords = [];
          verificationError = '';
          mode = 'words';
        }}><ArrowLeft size={16} />{translate($locale, 'Back')}</button
      >
      <SetupProgress
        steps={softwareSteps}
        current={2}
        label={translate($locale, 'Software wallet setup progress')}
        context="SOFTWARE WALLET"
      />
      <h1>{translate($locale, 'Confirm your backup')}</h1>
      <p>
        {translate(
          $locale,
          'Choose every word in order. This proves your written backup can reconstruct the wallet.'
        )}
      </p>
      <div
        class="mnemonic-verification"
        aria-label={translate($locale, 'Recovery word order verification')}
      >
        <ol class="mnemonic-slots" aria-label={translate($locale, 'Your recovery word sequence')}>
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
                  ondragstart={() => (draggedWord = selectedWords[position])}
                  onclick={() => removeRecoveryWord(position)}
                  aria-label={translate($locale, 'Remove {word} from position {position}', {
                    word: selectedWords[position].word,
                    position: position + 1
                  })}>{selectedWords[position].word}</button
                >
              {:else}<small>{translate($locale, 'Empty')}</small>{/if}
            </li>
          {/each}
        </ol>
        <div
          class="mnemonic-pool"
          role="group"
          aria-label={translate($locale, 'Shuffled recovery words')}
          ondragover={(event) => event.preventDefault()}
          ondrop={() => {
            if (draggedWord)
              removeRecoveryWord(selectedWords.findIndex(({ id }) => id === draggedWord?.id));
            draggedWord = null;
          }}
        >
          {#each verificationWords as word (word.id)}
            <button
              disabled={selectedWords.some(({ id }) => id === word.id)}
              draggable={!selectedWords.some(({ id }) => id === word.id)}
              ondragstart={() => (draggedWord = word)}
              onclick={() => selectRecoveryWord(word)}>{word.word}</button
            >
          {/each}
        </div>
      </div>
      <p class="verification-hint">
        {translate(
          $locale,
          'Tap a placed word to return it. You can also drag words between the pool and sequence.'
        )}
      </p>
      {#if verificationError}<p class="form-error" role="alert">{verificationError}</p>{/if}
      <Button
        size="large"
        class="full"
        disabled={selectedWords.length !== words.length}
        onclick={confirmRecoveryOrder}
        >{translate($locale, 'Confirm order')}<ArrowRight size={17} /></Button
      >
      <Button size="large" variant="secondary" class="full" onclick={verifyLater}
        >{translate($locale, 'Verify later')}</Button
      >
    {:else if mode === 'passphrase'}
      <button class="back-link" onclick={backFromPassphrase}
        ><ArrowLeft size={16} />{translate($locale, 'Back')}</button
      >
      <SetupProgress
        steps={softwareSteps}
        current={3}
        label={translate($locale, 'Software wallet setup progress')}
        context="SOFTWARE WALLET"
      />
      <h1>{translate($locale, 'Protect your wallet')}</h1>
      <p class="credential-intro">
        {translate(
          $locale,
          'Choose the BIP39 wallet passphrase that completes this backup. The same passphrase unlocks\n        Groot.'
        )}
      </p>
      <div class="credential-form software-credential-form">
        <label class="field">
          <span>{translate($locale, 'Wallet name')}</span>
          <input
            bind:value={walletName}
            maxlength="48"
            placeholder={translate($locale, 'My wallet')}
          />
          <FieldCounter value={walletName} max={48} />
        </label>
        <PasswordField
          label={translate($locale, 'Wallet passphrase')}
          bind:value={passphrase}
          placeholder={translate($locale, 'Enter a strong passphrase')}
          autocomplete="new-password"
          hint={translate(
            $locale,
            'Use at least 16 characters. Letters-only passphrases are allowed.'
          )}
          error={passphraseError}
        />
        <PasswordField
          label={translate($locale, 'Confirm wallet passphrase')}
          bind:value={confirmation}
          placeholder={translate($locale, 'Enter it again')}
          autocomplete="new-password"
          error={confirmation && passphrase !== confirmation ? 'Passphrases do not match.' : ''}
        />
      </div>
      <label class="credential-warning credential-ack"
        ><input type="checkbox" bind:checked={backupAcknowledged} /><ShieldCheck size={16} />
        <p>
          <strong>{translate($locale, 'Keep it with your backup.')}</strong><span
            >{translate(
              $locale,
              'I understand this exact passphrase is required with my 24 words. It cannot be reset; a different passphrase opens a different wallet.'
            )}</span
          >
        </p></label
      >

      {#if error}<p class="form-error" role="alert">
          {error.replace('passphrase / PIN', 'wallet passphrase')}
        </p>{/if}
      <Button
        size="large"
        class="full"
        disabled={!walletName.trim() ||
          !passphrase ||
          !!passphraseError ||
          passphrase !== confirmation ||
          !backupAcknowledged}
        loading={busy}
        loadingLabel={translate($locale, 'Creating wallet…')}
        onclick={finishCreate}><Check size={17} />{translate($locale, 'Create wallet')}</Button
      >
    {:else if mode === 'created'}
      <SetupProgress
        steps={softwareSteps}
        current={3}
        label={translate($locale, 'Software wallet setup progress')}
        context="SOFTWARE WALLET"
      />
      <div class="wallet-created-confirmation">
        <span class="wallet-created-icon"><Check size={24} /></span>
        <h1>{translate($locale, 'Wallet created')}</h1>
        <p>
          {translate(
            $locale,
            'Record this master fingerprint with your recovery words. It identifies the wallet produced by your 24 words and exact passphrase.'
          )}
        </p>
        <div class="master-fingerprint-result">
          <div class="master-fingerprint-label">
            <span>{translate($locale, 'Master fingerprint')}</span>
            <InsightTip
              label={translate($locale, 'About the master fingerprint')}
              text={translate(
                $locale,
                'A master fingerprint is a public 8-character identifier derived from your recovery words and passphrase. Match it after recovery to confirm you opened the same wallet; it cannot restore the wallet or spend bitcoin.'
              )}
            />
          </div>
          <ReadableIdentifier
            value={createdMasterFingerprint}
            label={translate($locale, 'Master fingerprint')}
            copied={fingerprintCopied}
            showHint={false}
            oncopy={copyCreatedFingerprint}
          />
        </div>
        <p class="fingerprint-check-note">
          {translate(
            $locale,
            'When restoring elsewhere, a matching fingerprint confirms that the recovery words and passphrase opened the same wallet.'
          )}
        </p>
        <details
          bind:open={createdWalletDetailsOpen}
          class="proposal-review-details created-wallet-details"
        >
          <summary
            ><ChevronRight size={14} class={createdWalletDetailsOpen ? 'rotated' : ''} />{translate(
              $locale,
              createdWalletDetailsOpen ? 'View less details' : 'View more details'
            )}</summary
          >
          <div class="created-wallet-export">
            <p>
              {translate(
                $locale,
                'Technical recovery tools can import this public descriptor to watch the same wallet.'
              )}
            </p>
            <Button variant="secondary" class="full" onclick={copyCreatedDescriptor}
              >{#if descriptorCopied}<Check size={16} />{:else}<Copy size={16} />{/if}{translate(
                $locale,
                'Copy wallet descriptor'
              )}</Button
            >
            <span>
              {translate(
                $locale,
                'This public watch-only descriptor cannot spend, but it reveals every address in the wallet.'
              )}
            </span>
          </div>
        </details>
        <Button size="large" class="full" onclick={() => goto('/?initial=new')}
          >{translate($locale, 'Open wallet')}<ArrowRight size={17} /></Button
        >
      </div>
    {:else}
      <button class="back-link" onclick={() => (mode = 'home')}
        ><ArrowLeft size={16} />{translate($locale, 'Back')}</button
      ><span class="setup-step">{translate($locale, 'RECOVERY')}</span>
      <h1>{translate($locale, 'Recover wallet')}</h1>
      <p>
        {translate(
          $locale,
          'Your 24 recovery words are entered in a native system window so they never enter Groot’s web\n        interface.'
        )}
      </p>
      <label class="field"
        ><span>{translate($locale, 'Wallet name')}</span><input
          bind:value={walletName}
          maxlength="48"
          placeholder={translate($locale, 'Recovered wallet')}
        /><FieldCounter value={walletName} max={48} /></label
      ><PasswordField
        label={translate($locale, 'Wallet passphrase')}
        bind:value={passphrase}
        placeholder={translate($locale, 'Enter the original wallet passphrase')}
        autocomplete="current-password"
        hint={translate(
          $locale,
          'This exact BIP39 passphrase is required with the recovery words and also unlocks Groot.'
        )}
        error={passphraseError}
      />{#if error}<p class="form-error" role="alert">
          {error.replace('passphrase / PIN', 'wallet passphrase')}
        </p>{/if}<Button
        size="large"
        class="full"
        disabled={!walletName.trim() || !passphrase || !!passphraseError}
        loading={busy}
        loadingLabel={translate($locale, 'Recovering wallet…')}
        onclick={recoverWallet}
        >{translate($locale, 'Enter recovery words securely')}<ArrowRight size={17} /></Button
      >
    {/if}
  </main>
</div>

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.credential-ack):where(.credential-ack) :global(input) {
    width: 15px;
    height: 15px;
    margin: 1px 0 0;
    accent-color: var(--accent);
  }
  :global(.credential-ack):where(.credential-ack) :global(p) {
    min-width: 0;
    margin: 0;
  }
  :global(.onboarding-brand):where(.onboarding-brand) {
    height: 72px;
    flex-shrink: 0;
    padding: 0 28px;
    display: flex;
    align-items: center;
    gap: 9px;
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
  }
  :global(.onboarding-brand-lockup):where(.onboarding-brand-lockup) {
    width: 104px;
    flex: 0 0 104px;
    display: inline-flex;
    line-height: 0;
  }
  :global(.onboarding-brand):where(.onboarding-brand) :global(small) {
    margin-left: auto;
    color: var(--muted-2);
    font-size: var(--font-size-meta);
    letter-spacing: 0.15em;
  }
  :global(.onboarding-settings):where(.onboarding-settings),
  :global(.onboarding-exit):where(.onboarding-exit) {
    width: 34px;
    height: 34px;
    margin-left: 7px;
    display: grid;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    color: var(--muted);
    background: var(--panel);
    cursor: pointer;
  }
  :global(.onboarding-settings:hover):where(.onboarding-settings),
  :global(.onboarding-exit:hover):where(.onboarding-exit) {
    color: var(--text);
    border-color: var(--border-strong);
  }
  :global(.onboarding-settings:focus-visible):where(.onboarding-settings),
  :global(.onboarding-exit:focus-visible):where(.onboarding-exit) {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  :global(.hero-mark):where(.hero-mark) {
    width: 46px;
    height: 46px;
    background: var(--brand-tile);
    color: var(--brand-mark);
    border-radius: var(--radius-inset);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  :global(.onboarding-actions):where(.onboarding-actions) {
    display: grid;
    gap: 9px;
  }
  :global(.wallet-type-grid):where(.wallet-type-grid) {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }
  :global(.wallet-type-card):where(.wallet-type-card) {
    position: relative;
    min-width: 0;
    min-height: 194px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 17px;
    color: var(--text);
    background: var(--surface-control);
    border: 1px solid var(--control-border);
    border-radius: var(--radius-inset);
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    overflow: hidden;
    transition:
      transform 0.15s ease,
      border-color 0.15s ease,
      background 0.15s ease,
      box-shadow 0.15s ease;
  }
  :global(.wallet-type-card::before):where(.wallet-type-card) {
    content: '';
    position: absolute;
    width: 92px;
    height: 92px;
    top: -48px;
    right: -42px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--wallet-type-accent, var(--fr-blue)) 12%, transparent);
    transition:
      opacity 0.18s ease,
      transform 0.18s ease;
  }
  :global(.wallet-type-card:hover):where(.wallet-type-card) {
    transform: translateY(-3px);
    border-color: color-mix(
      in srgb,
      var(--wallet-type-accent, var(--fr-blue)) 70%,
      var(--control-border)
    );
    background: var(--panel-2);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.11);
  }
  :global(.wallet-type-card:hover::before):where(.wallet-type-card) {
    opacity: 0.8;
    transform: scale(1.14);
  }
  :global(.wallet-type-card:focus-visible):where(.wallet-type-card) {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  :global(.wallet-type-card.software):where(.wallet-type-card) {
    --wallet-type-accent: var(--accent);
  }
  :global(.wallet-type-card.hardware):where(.wallet-type-card) {
    --wallet-type-accent: var(--fr-blue);
  }
  :global(.wallet-type-card.multisig):where(.wallet-type-card) {
    --wallet-type-accent: var(--success);
  }
  :global(.wallet-type-icon):where(.wallet-type-icon) {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    color: var(--wallet-type-accent, var(--fr-blue));
    background: color-mix(in srgb, var(--wallet-type-accent, var(--fr-blue)) 12%, transparent);
    border-radius: var(--radius-control);
    transition:
      transform 0.18s ease,
      background-color 0.18s ease;
  }
  :global(.wallet-type-card:hover):where(.wallet-type-card) :global(.wallet-type-icon) {
    transform: translateY(-1px) scale(1.04);
    background: color-mix(in srgb, var(--wallet-type-accent, var(--fr-blue)) 17%, transparent);
  }
  :global(.wallet-type-copy):where(.wallet-type-copy) {
    min-width: 0;
    display: grid;
    gap: 8px;
  }
  :global(.wallet-type-copy):where(.wallet-type-copy) :global(strong) {
    font-size: 13px;
    line-height: 1.3;
  }
  :global(.wallet-type-copy):where(.wallet-type-copy) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.45;
  }
  :global(.wallet-type-footer):where(.wallet-type-footer) {
    margin-top: auto;
    width: 100%;
    min-width: 0;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 10px;
  }
  :global(.wallet-type-meta):where(.wallet-type-meta) {
    min-width: 0;
    color: var(--muted-2);
    font-size: var(--font-size-meta);
    font-weight: 650;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  :global(.wallet-type-card:hover):where(.wallet-type-card) :global(.wallet-type-arrow) {
    color: var(--wallet-type-accent, var(--fr-blue));
    transform: translateX(3px);
  }
  :global(.trust-line):where(.trust-line) {
    color: var(--muted-2);
    font-size: var(--font-size-meta);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-top: 25px;
  }
  :global(.back-link):where(.back-link) {
    border: 0;
    background: none;
    color: var(--muted);
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    font-size: var(--font-size-meta);
    cursor: pointer;
  }
  :global(.setup-points):where(.setup-points) {
    display: grid;
    gap: 17px;
    margin-bottom: 27px;
  }
  :global(.setup-points):where(.setup-points) > :global(div) {
    display: flex;
    gap: 12px;
    color: var(--muted);
  }
  :global(.setup-points):where(.setup-points) :global(span) {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  :global(.setup-points):where(.setup-points) :global(strong) {
    color: var(--text-soft);
    font-size: var(--font-size-meta);
  }
  :global(.setup-points):where(.setup-points) :global(small) {
    font-size: var(--font-size-meta);
  }
  :global(.supplemental-entropy):where(.supplemental-entropy) {
    margin: 0 0 18px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-control);
  }
  :global(.supplemental-entropy):where(.supplemental-entropy) :global(summary) {
    padding: 13px 0;
    color: var(--text-soft);
    font-size: var(--font-size-meta);
    font-weight: 650;
    cursor: pointer;
  }
  :global(.supplemental-entropy):where(.supplemental-entropy) > :global(p) {
    margin: 0 0 13px;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.55;
  }
  :global(.entropy-source-options):where(.entropy-source-options) {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    margin-bottom: 14px;
  }
  :global(.entropy-source-options):where(.entropy-source-options) :global(button),
  :global(.entropy-result-buttons):where(.entropy-result-buttons) :global(button) {
    min-height: 34px;
    border: 1px solid var(--control-border);
    border-radius: 6px;
    color: var(--muted);
    background: var(--panel);
    font-size: var(--font-size-meta);
    cursor: pointer;
  }
  :global(.entropy-source-options):where(.entropy-source-options) :global(button.active) {
    color: var(--link);
    border-color: var(--fr-blue);
    background: var(--fr-blue-soft);
  }
  :global(.entropy-entry):where(.entropy-entry) {
    display: grid;
    gap: 10px;
    padding: 12px 0 14px;
    border-top: 1px solid var(--border);
  }
  :global(.entropy-progress):where(.entropy-progress) {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 12px;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.45;
  }
  :global(.entropy-progress):where(.entropy-progress) :global(strong) {
    flex: none;
    color: var(--text-soft);
    font-size: var(--font-size-meta);
    font-variant-numeric: tabular-nums;
  }
  :global(.entropy-outcomes):where(.entropy-outcomes) {
    min-height: 37px;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--panel-2);
  }
  :global(.entropy-outcomes):where(.entropy-outcomes) :global(code) {
    overflow: hidden;
    color: var(--text-soft);
    font:
      9px/1.3 'SFMono-Regular',
      Consolas,
      ui-monospace,
      monospace;
    letter-spacing: 0.08em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.entropy-outcomes):where(.entropy-outcomes) :global(small) {
    flex: none;
    color: var(--muted-2);
    font-size: 11px;
  }
  :global(.entropy-result-buttons):where(.entropy-result-buttons) {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
  }
  :global(.entropy-result-buttons.coin):where(.entropy-result-buttons) {
    grid-template-columns: repeat(2, 1fr);
  }
  :global(.entropy-result-buttons):where(.entropy-result-buttons)
    :global(button:hover:not(:disabled)) {
    color: var(--link);
    border-color: var(--fr-blue);
  }
  :global(.entropy-result-buttons):where(.entropy-result-buttons) :global(button:disabled) {
    opacity: 0.45;
    cursor: not-allowed;
  }
  :global(.entropy-edit-actions):where(.entropy-edit-actions) {
    display: flex;
    gap: 12px;
  }
  :global(.entropy-edit-actions):where(.entropy-edit-actions) :global(button) {
    padding: 0;
    border: 0;
    color: var(--muted);
    background: transparent;
    font-size: var(--font-size-meta);
    cursor: pointer;
  }
  :global(.entropy-edit-actions):where(.entropy-edit-actions) :global(button:disabled) {
    opacity: 0.4;
    cursor: not-allowed;
  }
  :global(.supplemental-entropy):where(.supplemental-entropy) :global(.entropy-caution) {
    margin: 0;
    color: var(--muted-2);
    font-size: var(--font-size-meta);
    line-height: 1.5;
  }
  :global(.entropy-caution):where(.entropy-caution) :global(strong) {
    color: var(--text-soft);
  }
  :global(.mnemonic-grid):where(.mnemonic-grid) {
    display: grid;
    grid-auto-flow: column;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: repeat(8, auto);
    gap: 7px;
    margin-bottom: 12px;
  }
  :global(.mnemonic-grid):where(.mnemonic-grid) > :global(div) {
    height: 39px;
    color: var(--text);
    background: var(--surface-control);
    display: grid;
    grid-template-columns: 25px minmax(0, 1fr);
    align-items: center;
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0 11px;
  }
  :global(.mnemonic-grid):where(.mnemonic-grid) :global(span) {
    color: var(--muted-2);
    font-family: 'SFMono-Regular', Consolas, ui-monospace, monospace;
    font-size: var(--font-size-meta);
    font-variant-numeric: tabular-nums;
    line-height: 1;
    text-align: right;
    transform: translateY(1px);
  }
  :global(.mnemonic-grid):where(.mnemonic-grid) :global(strong) {
    color: var(--text);
    min-width: 0;
    margin-left: 12px;
    font-family: 'SFMono-Regular', Consolas, ui-monospace, monospace;
    font-size: var(--font-size-meta);
    font-weight: 500;
    line-height: 1;
    text-align: left;
    transform: translateY(1px);
  }
  :global(.mnemonic-verification):where(.mnemonic-verification) {
    display: grid;
    gap: 16px;
    margin: 20px 0 10px;
  }
  :global(.mnemonic-slots):where(.mnemonic-slots) {
    display: grid;
    grid-auto-flow: column;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: repeat(8, 36px);
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  :global(.mnemonic-slots):where(.mnemonic-slots) :global(li) {
    min-width: 0;
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    align-items: center;
    padding: 0 8px;
    color: var(--muted-2);
    background: var(--panel-2);
    border: 1px dashed var(--border-strong);
    border-radius: 6px;
    font:
      8px/1 'SFMono-Regular',
      Consolas,
      ui-monospace,
      monospace;
  }
  :global(.mnemonic-slots):where(.mnemonic-slots) :global(li.filled) {
    color: var(--text);
    background: var(--fr-blue-soft);
    border-style: solid;
    border-color: color-mix(in srgb, var(--fr-blue) 50%, var(--border));
  }
  :global(.mnemonic-slots):where(.mnemonic-slots) :global(li > span) {
    text-align: right;
  }
  :global(.mnemonic-slots):where(.mnemonic-slots) :global(li > small) {
    margin-left: 8px;
    color: var(--muted-2);
    font-size: var(--font-size-meta);
  }
  :global(.mnemonic-slots):where(.mnemonic-slots) :global(li > button) {
    min-width: 0;
    overflow: hidden;
    margin-left: 8px;
    padding: 0;
    border: 0;
    color: inherit;
    background: transparent;
    font:
      500 9px/1 'SFMono-Regular',
      Consolas,
      ui-monospace,
      monospace;
    text-align: left;
    text-overflow: ellipsis;
    cursor: grab;
  }
  :global(.mnemonic-pool):where(.mnemonic-pool) {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-height: 78px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-control);
  }
  :global(.mnemonic-pool):where(.mnemonic-pool) :global(button) {
    min-height: 28px;
    padding: 0 10px;
    border: 1px solid var(--control-border);
    border-radius: 6px;
    color: var(--text-soft);
    background: var(--panel);
    font:
      500 9px/1 'SFMono-Regular',
      Consolas,
      ui-monospace,
      monospace;
    cursor: grab;
  }
  :global(.mnemonic-pool):where(.mnemonic-pool) :global(button:disabled) {
    visibility: hidden;
  }
  :global(.verification-hint):where(.verification-hint) {
    margin: 0 0 14px !important;
    color: var(--muted-2) !important;
    font-size: var(--font-size-meta) !important;
  }
  :global(.recovery-reveal-gate):where(.recovery-reveal-gate) {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 12px;
    margin: 18px 0 14px;
    padding: 18px;
    background: var(--surface-control);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
  }
  :global(.recovery-reveal-icon):where(.recovery-reveal-icon) {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    color: var(--fr-red);
    background: color-mix(in srgb, var(--fr-red) 9%, transparent);
    border-radius: var(--radius-control);
  }
  :global(.recovery-reveal-gate):where(.recovery-reveal-gate) :global(strong) {
    display: block;
    margin: 1px 0 4px;
    color: var(--text);
    font-size: var(--font-size-meta);
  }
  :global(.recovery-reveal-gate):where(.recovery-reveal-gate) :global(p) {
    margin: 0 !important;
    color: var(--muted) !important;
    font-size: var(--font-size-meta) !important;
    line-height: 1.5 !important;
  }
  :global(.recovery-reveal-gate):where(.recovery-reveal-gate) :global(.button) {
    grid-column: 1 / -1;
    margin-top: 4px;
  }
  :global(.reveal-button):where(.reveal-button) {
    border: 0;
    background: transparent;
    color: var(--muted);
    font-size: var(--font-size-meta);
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 auto 21px;
  }
  :global(.credential-intro):where(.credential-intro) {
    margin-bottom: 22px !important;
  }
  :global(.credential-form):where(.credential-form) {
    display: grid;
    gap: 15px;
  }
  :global(.credential-form):where(.credential-form) :global(.field) {
    margin: 0;
  }
  :global(.software-credential-form):where(.software-credential-form)
    > :global(.field:nth-child(2)) {
    margin-top: 7px;
  }
  :global(.credential-form):where(.credential-form) :global(.field small) {
    min-height: 14px;
  }
  :global(.wallet-created-confirmation):where(.wallet-created-confirmation) {
    display: grid;
    justify-items: center;
    gap: 14px;
    margin-top: 24px;
    text-align: center;
  }
  :global(.wallet-created-confirmation):where(.wallet-created-confirmation) > :global(h1),
  :global(.wallet-created-confirmation):where(.wallet-created-confirmation) > :global(p) {
    margin: 0;
  }
  :global(.wallet-created-confirmation):where(.wallet-created-confirmation) > :global(h1) {
    font-size: 24px;
    line-height: 1.2;
    letter-spacing: -0.03em;
  }
  :global(.wallet-created-confirmation):where(.wallet-created-confirmation) > :global(p) {
    max-width: 390px;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.5;
  }
  :global(.wallet-created-icon):where(.wallet-created-icon) {
    display: grid;
    width: 46px;
    height: 46px;
    place-items: center;
    border-radius: var(--radius-inset);
    background: color-mix(in srgb, var(--success) 10%, transparent);
    color: var(--success);
  }
  :global(.master-fingerprint-result):where(.master-fingerprint-result) {
    display: grid;
    width: 100%;
    gap: 8px;
  }
  :global(.master-fingerprint-label):where(.master-fingerprint-label) > :global(span),
  :global(.fingerprint-check-note):where(.fingerprint-check-note) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.master-fingerprint-label):where(.master-fingerprint-label) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
  }
  :global(.master-fingerprint-result):where(.master-fingerprint-result)
    :global(.readable-address-block) {
    width: 100%;
  }
  :global(.master-fingerprint-result):where(.master-fingerprint-result) :global(.readable-address) {
    min-height: 58px;
  }
  :global(.master-fingerprint-result):where(.master-fingerprint-result)
    :global(.readable-address-groups) {
    gap: 12px;
    font-size: 22px;
    font-weight: 750;
    letter-spacing: 0.08em;
  }
  :global(.fingerprint-check-note):where(.fingerprint-check-note) {
    line-height: 1.5;
  }
  :global(.created-wallet-export):where(.created-wallet-export) {
    width: 100%;
    display: grid;
    gap: 7px;
  }
  :global(.created-wallet-details):where(.created-wallet-details) {
    width: 100%;
    text-align: left;
  }
  :global(.created-wallet-details):where(.created-wallet-details) > :global(summary) {
    display: flex;
    align-items: center;
    gap: 5px;
    width: fit-content;
    padding-block: 7px;
  }
  :global(.created-wallet-details):where(.created-wallet-details) > :global(summary::marker),
  :global(.created-wallet-details):where(.created-wallet-details)
    > :global(summary::-webkit-details-marker) {
    display: none;
    content: '';
  }
  :global(.created-wallet-details):where(.created-wallet-details) > :global(summary svg) {
    transition: transform 0.15s ease;
  }
  :global(.created-wallet-details):where(.created-wallet-details) > :global(summary svg.rotated) {
    transform: rotate(90deg);
  }
  :global(.created-wallet-details[open]):where(.created-wallet-details) > :global(summary) {
    margin-bottom: 9px;
  }
  :global(.created-wallet-export):where(.created-wallet-export) > :global(p) {
    margin: 0;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.45;
  }
  :global(.created-wallet-export):where(.created-wallet-export) > :global(span) {
    color: var(--muted-2);
    font-size: var(--font-size-meta);
    line-height: 1.45;
  }
  :global(.credential-form):where(.credential-form) :global(.field-error) {
    color: var(--danger);
  }

  @media (max-width: 760px), (pointer: coarse) {
    :global(.welcome-home) :global(.onboarding-brand-lockup) {
      display: none;
    }
    :global(.onboarding-settings):where(.onboarding-settings),
    :global(.onboarding-exit):where(.onboarding-exit) {
      width: 44px;
      height: 44px;
    }
  }

  @media (max-width: 760px) {
    :global(.onboarding-brand):where(.onboarding-brand) {
      padding: 0 18px;
    }
    :global(.wallet-type-grid):where(.wallet-type-grid) {
      grid-template-columns: 1fr;
    }
    :global(.wallet-type-card):where(.wallet-type-card) {
      min-height: 108px;
      display: grid;
      grid-template-columns: 38px minmax(0, 1fr) auto;
      grid-template-rows: auto auto;
      align-items: start;
      column-gap: 13px;
      row-gap: 8px;
      padding: 13px 14px;
    }
    :global(.wallet-type-icon):where(.wallet-type-icon) {
      grid-row: 1 / 3;
      margin-top: 2px;
    }
    :global(.wallet-type-copy):where(.wallet-type-copy) {
      grid-column: 2 / 4;
      grid-row: 1;
      padding-right: 17px;
    }
    :global(.wallet-type-footer):where(.wallet-type-footer) {
      grid-column: 2 / 4;
      grid-row: 2;
      margin: 0;
    }
    :global(.entropy-source-options):where(.entropy-source-options) {
      grid-template-columns: 1fr;
    }
    :global(.entropy-source-options):where(.entropy-source-options) :global(button),
    :global(.entropy-result-buttons):where(.entropy-result-buttons) :global(button) {
      min-height: 44px;
    }
    :global(.entropy-progress):where(.entropy-progress),
    :global(.entropy-outcomes):where(.entropy-outcomes) {
      display: grid;
    }
    :global(.mnemonic-grid):where(.mnemonic-grid) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: repeat(12, auto);
    }
    :global(.mnemonic-slots):where(.mnemonic-slots) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: repeat(12, 36px);
    }
  }
</style>
