<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate, localizedError } from '$lib/i18n-catalog';
  import {
    ArrowLeft,
    ArrowRight,
    Check,
    Cpu,
    Eye,
    EyeOff,
    KeyRound,
    Network,
    ShieldCheck,
    X
  } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import FieldCounter from '$lib/components/FieldCounter.svelte';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import BrandLockup from '$lib/components/BrandLockup.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import SetupProgress from '$lib/components/SetupProgress.svelte';
  import { toast } from '$lib/stores/toasts';
  import { defaultConfig, networkName } from '$lib/config';
  import {
    MAX_SUPPLEMENTAL_COIN_FLIPS,
    MAX_SUPPLEMENTAL_DICE_ROLLS,
    MIN_SUPPLEMENTAL_COIN_FLIPS,
    MIN_SUPPLEMENTAL_DICE_ROLLS,
    walletService,
    type NetworkSetupSource,
    type SupplementalEntropyInput
  } from '$lib/wallet';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onDestroy, onMount } from 'svelte';
  import {
    MAX_WALLET_PASSPHRASE_BYTES,
    recoveryOrderMatches,
    shuffledRecoveryWords,
    utf8ByteLength,
    type RecoveryWord
  } from '$lib/mnemonic-verification';
  let mode = $state<'home' | 'choose' | 'create' | 'words' | 'verify' | 'passphrase' | 'recover'>(
    'home'
  );
  let revealed = $state(false);
  let passphrase = $state('');
  let confirmation = $state('');
  let words = $state<string[]>([]);
  let nativeBackup = $state(false);
  let busy = $state(false);
  let error = $state('');
  let walletName = $state('My wallet');
  let hasExistingWallet = $state(false);
  let backupAcknowledged = $state(false);
  let backupVerified = $state(false);
  let verificationWords = $state<RecoveryWord[]>([]);
  let selectedWords = $state<RecoveryWord[]>([]);
  let verificationError = $state('');
  let draggedWord = $state<RecoveryWord | null>(null);
  let supplementalSource = $state<'none' | 'coin' | 'dice'>('none');
  let supplementalOutcomes = $state('');
  let networkSetupSource = $state<NetworkSetupSource | null>(null);
  let reuseNetworkSetup = $state(true);
  const softwareSteps = ['Generate', 'Back up', 'Protect'];
  let passphraseError = $derived(
    utf8ByteLength(passphrase) > MAX_WALLET_PASSPHRASE_BYTES
      ? 'The wallet passphrase is too long.'
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
    hasExistingWallet = await walletService.exists();
    if (hasExistingWallet && page.url.searchParams.get('add') !== '1') await goto('/unlock');
    if (hasExistingWallet) {
      try {
        networkSetupSource = (await walletService.networkSetupSources())[0] ?? null;
      } catch {
        networkSetupSource = null;
      }
    }
  });
  onDestroy(() => {
    void walletService.cancelOnboarding();
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

  async function adoptNetworkSetup(credential: string) {
    if (!reuseNetworkSetup || !networkSetupSource) return true;
    try {
      await walletService.adoptNetworkSetup(networkSetupSource.walletId, credential);
      return true;
    } catch {
      return false;
    }
  }

  async function finishCreate() {
    busy = true;
    error = '';
    try {
      await walletService.createWallet(walletName, passphrase, backupVerified);
      const networkSetupCopied = await adoptNetworkSetup(passphrase);
      words = [];
      passphrase = '';
      confirmation = '';
      backupAcknowledged = false;
      toast({
        title: 'Wallet created',
        description: !networkSetupCopied
          ? 'Network setup was not copied. Configure it in Settings.'
          : backupVerified
            ? 'Your regtest wallet is ready.'
            : 'Your wallet is ready. Verify its recovery backup soon.',
        tone: networkSetupCopied ? 'success' : 'default'
      });
      await goto('/');
    } catch (cause) {
      error = localizedError(cause, $locale, 'Could not create wallet.');
    } finally {
      passphrase = '';
      confirmation = '';
      words = [];
      busy = false;
    }
  }

  async function recoverWallet() {
    busy = true;
    error = '';
    try {
      await walletService.recoverWallet(walletName, passphrase);
      const networkSetupCopied = await adoptNetworkSetup(passphrase);
      passphrase = '';
      toast({
        title: 'Wallet recovered',
        description: networkSetupCopied
          ? 'Sync to restore transaction history.'
          : 'Network setup was not copied. Configure it in Settings.',
        tone: networkSetupCopied ? 'success' : 'default'
      });
      await goto('/');
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

<div class="onboarding-overlay">
  <header class="onboarding-brand">
    <span class="onboarding-brand-lockup"><BrandLockup /></span><small
      >{networkName(defaultConfig.network).toUpperCase()}</small
    >{#if hasExistingWallet}<button
        class="onboarding-exit"
        aria-label={translate($locale, 'Close wallet setup')}
        onclick={returnToWallet}><X size={17} /></button
      >{/if}
  </header>
  <main class="onboarding-card" class:wallet-choice-card={mode === 'choose'}>
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
          <span class="wallet-type-meta">{translate($locale, 'On this device')}</span>
          <ArrowRight class="wallet-type-arrow" size={17} />
        </button>
        <a class="wallet-type-card hardware" href="/hardware/new">
          <span class="wallet-type-icon"><Cpu size={20} /></span>
          <span class="wallet-type-copy"
            ><strong>{translate($locale, 'Hardware wallet')}</strong><small
              >{translate($locale, 'Connect a device you already trust.')}</small
            ></span
          >
          <span class="wallet-type-meta">{translate($locale, 'Separate device')}</span>
          <ArrowRight class="wallet-type-arrow" size={17} />
        </a>
        <a class="wallet-type-card multisig" href="/multisig/new">
          <span class="wallet-type-icon"><ShieldCheck size={20} /></span>
          <span class="wallet-type-copy"
            ><strong>{translate($locale, 'Multisig wallet')}</strong><small
              >{translate(
                $locale,
                'Custom spending, recovery, inheritance, or shared control.'
              )}</small
            ></span
          >
          <span class="wallet-type-meta">{translate($locale, 'Flexible security')}</span>
          <ArrowRight class="wallet-type-arrow" size={17} />
        </a>
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
            ><Eye size={16} />{translate($locale, 'I’m private — reveal words')}</Button
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
      {#if !backupVerified}<div class="backup-unverified-note" role="status">
          <ShieldCheck size={17} /><span
            ><strong>{translate($locale, 'Backup not verified yet')}</strong><small
              >{translate(
                $locale,
                'You can use the wallet now, but Groot will keep reminding you to verify the written\n              words.'
              )}</small
            ></span
          >
        </div>{/if}
      <div class="credential-form">
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
            'Keep it with your recovery words. It also unlocks Groot on this device.'
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
              'I understand this exact passphrase is required with my 24 words. It cannot be reset; a\n            different passphrase opens a different wallet.'
            )}</span
          >
        </p></label
      >
      {#if networkSetupSource}<label class="credential-warning credential-ack"
          ><input type="checkbox" bind:checked={reuseNetworkSetup} /><Network size={16} />
          <p>
            <strong
              >{translate($locale, 'Use')}
              {networkSetupSource.walletName}{translate($locale, '’s network setup.')}</strong
            ><span
              >{translate(
                $locale,
                'Copies its node and sync method. This wallet protects its own copy.'
              )}</span
            >
          </p></label
        >{/if}
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
      />{#if networkSetupSource}<label class="credential-warning credential-ack"
          ><input type="checkbox" bind:checked={reuseNetworkSetup} /><Network size={16} />
          <p>
            <strong
              >{translate($locale, 'Use')}
              {networkSetupSource.walletName}{translate($locale, '’s network setup.')}</strong
            ><span
              >{translate(
                $locale,
                'Copies its node and sync method. This wallet protects its own copy.'
              )}</span
            >
          </p></label
        >{/if}{#if error}<p class="form-error" role="alert">
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
  <footer class="onboarding-footer">
    {translate($locale, 'Keys stay on this device · Open source')}
  </footer>
</div>
