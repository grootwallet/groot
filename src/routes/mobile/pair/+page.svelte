<script lang="ts">
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import { Check, LockKeyhole, ScanLine, ShieldCheck, Smartphone } from '@lucide/svelte';
  import AnimatedUrQr from '$lib/components/AnimatedUrQr.svelte';
  import Button from '$lib/components/Button.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import UrQrScanner from '$lib/components/UrQrScanner.svelte';
  import { locale } from '$lib/i18n';
  import { localizedError, translate } from '$lib/i18n-catalog';
  import { toast } from '$lib/stores/toasts';
  import { walletService, type PairingResponse, type PendingMobilePairing } from '$lib/wallet';

  let stage = $state<'invite' | 'confirm' | 'response' | 'final'>('invite');
  let invitationFrames = $state<string[]>([]);
  let invitationJson = $state('');
  let walletName = $state('');
  let network = $state('');
  let threshold = $state(0);
  let signerCount = $state(0);
  let comparisonCode = $state('');
  let signerLabel = $state('My iPhone');
  let pin = $state('');
  let confirmation = $state('');
  let response = $state<PairingResponse | null>(null);
  let finalFrames = $state<string[]>([]);
  let busy = $state(false);
  let error = $state('');
  let pendingPairings = $state<PendingMobilePairing[]>([]);
  let selectedPendingSession = $state('');
  let resumePin = $state('');
  let resumeError = $state('');
  let resumeNotice = $state('');
  let pairingPage: HTMLDivElement;
  let keyboardActive = $state(false);

  function isTextEntry(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement {
    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
  }

  function centerFocusedInput(event: FocusEvent) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
    keyboardActive = true;
  }

  function finishInputFocus() {
    setTimeout(() => {
      keyboardActive =
        isTextEntry(document.activeElement) && pairingPage.contains(document.activeElement);
    }, 0);
  }

  onMount(async () => {
    try {
      pendingPairings = await walletService.pendingMobilePairings();
      selectedPendingSession = pendingPairings[0]?.sessionId ?? '';
    } catch (cause) {
      resumeError = localizedError(cause, $locale, 'Pending pairing could not be checked.');
    }
  });

  onDestroy(() => {
    pin = '';
    confirmation = '';
    resumePin = '';
  });

  async function resumePendingPairing() {
    if (!selectedPendingSession || !resumePin) return;
    busy = true;
    resumeError = '';
    resumeNotice = '';
    try {
      response = await walletService.resumePairingOnMobile(selectedPendingSession, resumePin);
      comparisonCode = response.comparisonCode;
      pin = resumePin;
      resumePin = '';
      stage = 'response';
      toast({
        title: 'Pairing resumed',
        description: 'The same invitation-bound response is ready for desktop.',
        tone: 'success'
      });
    } catch (cause) {
      resumeError = localizedError(cause, $locale, 'The pending pairing could not be resumed.');
    } finally {
      busy = false;
    }
  }

  async function cancelPendingPairing() {
    if (!selectedPendingSession) return;
    busy = true;
    resumeError = '';
    resumeNotice = '';
    try {
      await walletService.cancelPairing(selectedPendingSession);
      pendingPairings = pendingPairings.filter(
        (pairing) => pairing.sessionId !== selectedPendingSession
      );
      selectedPendingSession = pendingPairings[0]?.sessionId ?? '';
      resumePin = '';
      resumeNotice = translate(
        $locale,
        'Pending pairing cancelled. Scan a new invitation to restart.'
      );
      toast({
        title: 'Pending pairing cancelled',
        description: 'The staged phone key was removed.',
        tone: 'success'
      });
    } catch (cause) {
      resumeError = localizedError(cause, $locale, 'The pending pairing could not be cancelled.');
    } finally {
      busy = false;
    }
  }

  async function receiveInvitation(frame: string) {
    invitationFrames = [...invitationFrames, frame];
    try {
      const decoded = await walletService.decodePairingInvitation(invitationFrames);
      invitationJson = decoded.invitationJson;
      comparisonCode = decoded.comparisonCode;
      const invitation = JSON.parse(invitationJson) as {
        walletName: string;
        network: string;
        threshold: number;
        signerCount: number;
        token: string;
        sessionId: string;
      };
      walletName = invitation.walletName;
      network = invitation.network;
      threshold = invitation.threshold;
      signerCount = invitation.signerCount;
      stage = 'confirm';
      error = '';
      return true;
    } catch {
      // Multipart UR decoding is expected to be incomplete until enough unique frames arrive.
      return false;
    }
  }

  async function createSigner() {
    if (!invitationJson || pin !== confirmation || !pin || !signerLabel.trim()) return;
    busy = true;
    error = '';
    try {
      response = await walletService.acceptPairingOnMobile(invitationJson, signerLabel, pin);
      comparisonCode = response.comparisonCode;
      stage = 'response';
      toast({
        title: 'Mobile key ready',
        description: 'Compare the six digits, then let desktop scan this response.',
        tone: 'success'
      });
    } catch (cause) {
      error = localizedError(cause, $locale, 'The mobile signer could not be created.');
    } finally {
      busy = false;
    }
  }

  async function receiveFinal(frame: string) {
    finalFrames = [...finalFrames, frame];
    if (!pin) return;
    try {
      await walletService.completePairingOnMobile(finalFrames, pin);
      pin = '';
      confirmation = '';
      toast({
        title: 'Shared wallet paired',
        description: 'This phone holds one signer; desktop remains the coordinator.',
        tone: 'success'
      });
      await goto('/multisig');
      return true;
    } catch (cause) {
      const message = localizedError(cause, $locale, 'Waiting for the complete wallet QR.');
      if (!message.toLowerCase().includes('incomplete')) error = message;
      return false;
    }
  }
</script>

<div
  bind:this={pairingPage}
  class="page narrow-page pairing-page"
  class:keyboard-active={keyboardActive}
  onfocusin={centerFocusedInput}
  onfocusout={finishInputFocus}
>
  <header class="page-header">
    <div>
      <p class="eyebrow">{translate($locale, 'PHONE SIGNER')}</p>
      <h1>{translate($locale, 'Join a shared wallet')}</h1>
      <p class="subtitle">
        {translate(
          $locale,
          'No account or cloud connection. Keep both devices together until the two QR rounds finish.'
        )}
      </p>
    </div>
  </header>

  {#if stage === 'invite'}
    {#if pendingPairings.length > 0}
      <section class="pairing-card pending-card">
        <span class="step-icon"><LockKeyhole size={22} /></span>
        <div>
          <strong>{translate($locale, 'Finish an interrupted pairing')}</strong><small
            >{translate(
              $locale,
              'Enter the same local PIN to restore the exact response QR. No key leaves this phone.'
            )}</small
          >
        </div>
        {#if pendingPairings.length > 1}
          <label class="field"
            ><span>{translate($locale, 'Pending session')}</span><select
              bind:value={selectedPendingSession}
              disabled={busy}
            >
              {#each pendingPairings as pairing}
                <option value={pairing.sessionId}>{pairing.sessionId.slice(0, 8)}</option>
              {/each}
            </select></label
          >
        {/if}
        <PasswordField bind:value={resumePin} label={translate($locale, 'Local app PIN')} />
        {#if resumeError}<p class="inline-error" role="alert">{resumeError}</p>{/if}
        <div class="pending-actions">
          <Button
            class="full"
            loading={busy}
            disabled={!selectedPendingSession || !resumePin}
            onclick={resumePendingPairing}>{translate($locale, 'Resume pairing')}</Button
          >
          <Button
            variant="secondary"
            class="full"
            disabled={busy || !selectedPendingSession}
            onclick={cancelPendingPairing}>{translate($locale, 'Cancel pending pairing')}</Button
          >
        </div>
      </section>
    {/if}
    {#if resumeNotice}<p class="inline-success" role="status">{resumeNotice}</p>{/if}
    <section class="pairing-card">
      <span class="step-icon"><ScanLine size={22} /></span>
      <div>
        <strong>{translate($locale, 'Scan the desktop invitation')}</strong><small
          >{translate(
            $locale,
            'The invitation expires in 15 minutes and can add one phone.'
          )}</small
        >
      </div>
      <UrQrScanner
        acceptedTypes={['groot-invite']}
        prompt={translate($locale, 'Point the camera at the Groot desktop invitation')}
        onframe={receiveInvitation}
      />
    </section>
  {:else if stage === 'confirm'}
    <section class="pairing-card">
      <span class="step-icon"><Smartphone size={22} /></span>
      <div>
        <strong>{walletName}</strong><small>{network} · {threshold} of {signerCount}</small>
      </div>
      <div class="security-note">
        <ShieldCheck size={18} /><span
          ><strong>{translate($locale, 'Words-only recovery')}</strong><small
            >{translate(
              $locale,
              'The 24 words derive this BIP48 key with no BIP39 passphrase. Your app PIN only unlocks the encrypted copy on this phone.'
            )}</small
          ></span
        >
      </div>
      <div class="comparison" aria-label={translate($locale, 'Pairing comparison code')}>
        <small>{translate($locale, 'Both devices must show')}</small><strong
          >{comparisonCode}</strong
        >
      </div>
      <label class="field"
        ><span>{translate($locale, 'Phone name')}</span><input
          bind:value={signerLabel}
          maxlength="48"
          autocomplete="off"
        /></label
      >
      <PasswordField bind:value={pin} label={translate($locale, 'Local app PIN')} />
      <PasswordField bind:value={confirmation} label={translate($locale, 'Confirm PIN')} />
      {#if error}<p class="inline-error" role="alert">{error}</p>{/if}
      <Button
        class="full"
        loading={busy}
        disabled={!pin || pin !== confirmation || !signerLabel.trim()}
        onclick={createSigner}>{translate($locale, 'Create phone key')}</Button
      >
    </section>
  {:else if stage === 'response' && response}
    <section class="pairing-card">
      <span class="step-icon"><LockKeyhole size={22} /></span>
      <div>
        <strong>{translate($locale, 'Let desktop scan this response')}</strong><small
          >{translate(
            $locale,
            'The account xpub is encrypted and signed for this invitation.'
          )}</small
        >
      </div>
      <AnimatedUrQr
        frames={response.frames}
        intervalMs={1400}
        expandable
        label={translate($locale, 'Encrypted mobile signer QR')}
      />
      <p class="qr-guidance">
        {translate(
          $locale,
          'Turn up screen brightness, hold the phone steady, or tap the QR to enlarge it.'
        )}
      </p>
      <div class="comparison" aria-label={translate($locale, 'Pairing comparison code')}>
        <small>{translate($locale, 'Both devices must show')}</small><strong
          >{comparisonCode}</strong
        >
      </div>
      <div class="identity">
        <Check size={16} /><span>{response.fingerprint} · {response.xpubChecksum}</span>
      </div>
      <Button class="full" onclick={() => (stage = 'final')}
        >{translate($locale, 'Phone key added on desktop')}</Button
      >
    </section>
  {:else}
    <section class="pairing-card">
      <span class="step-icon"><ScanLine size={22} /></span>
      <div>
        <strong>{translate($locale, 'Finish wallet setup on desktop')}</strong><small
          >{translate(
            $locale,
            'Desktop is finishing setup. It will show one final wallet QR next. Keep this screen ready to scan it.'
          )}</small
        >
      </div>
      {#if error}<p class="inline-error" role="alert">{error}</p>{/if}
      <UrQrScanner
        acceptedTypes={['groot-wallet']}
        prompt={translate($locale, 'Point the camera at the final Groot wallet QR')}
        onframe={receiveFinal}
      />
    </section>
  {/if}
</div>

<style>
  .pairing-page {
    padding-bottom: max(2rem, env(safe-area-inset-bottom));
  }
  .pairing-page.keyboard-active {
    padding-bottom: max(45dvh, env(safe-area-inset-bottom));
  }
  .pairing-page :global(input:focus),
  .pairing-page :global(textarea:focus) {
    scroll-margin-block: 35dvh;
  }
  .pairing-page :global(input),
  .pairing-page :global(textarea),
  .pairing-page :global(select) {
    font-size: 16px;
  }
  .pairing-card {
    display: grid;
    gap: 1rem;
    padding: 1.25rem;
    border: 1px solid var(--border);
    border-radius: 1rem;
    background: var(--surface);
  }
  .pending-card {
    margin-bottom: 1rem;
  }
  .pending-actions {
    display: grid;
    gap: 0.65rem;
  }
  .pairing-card > div:first-of-type {
    display: grid;
    gap: 0.25rem;
  }
  .pairing-card small {
    color: var(--muted);
  }
  .step-icon {
    width: 2.75rem;
    height: 2.75rem;
    display: grid;
    place-items: center;
    border-radius: 0.8rem;
    color: var(--link);
    background: color-mix(in srgb, var(--link) 12%, transparent);
  }
  .security-note {
    display: flex;
    gap: 0.75rem;
    padding: 0.9rem;
    border-radius: 0.8rem;
    background: var(--surface-raised);
  }
  .security-note span {
    display: grid;
    gap: 0.2rem;
  }
  .comparison {
    display: grid;
    justify-items: center;
    gap: 0.25rem;
    padding: 0.8rem;
    border: 1px solid var(--border);
    border-radius: 0.8rem;
  }
  .comparison strong {
    font-size: 1.7rem;
    letter-spacing: 0.18em;
    font-variant-numeric: tabular-nums;
  }
  .identity {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    color: var(--muted);
    font-family: var(--font-mono);
  }
  .qr-guidance {
    margin: -0.25rem 0 0;
    color: var(--muted);
    font-size: 0.82rem;
    line-height: 1.45;
    text-align: center;
  }
  .inline-error {
    color: var(--danger);
    margin: 0;
  }
  .inline-success {
    color: var(--success);
    margin: 0 0 1rem;
  }
</style>
