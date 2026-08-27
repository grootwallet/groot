<script lang="ts">
  import { goto } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import { Check, LockKeyhole, ScanLine, ShieldCheck, Smartphone } from '@lucide/svelte';
  import AnimatedUrQr from '$lib/components/AnimatedUrQr.svelte';
  import Button from '$lib/components/Button.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import UrQrScanner from '$lib/components/UrQrScanner.svelte';
  import { locale } from '$lib/i18n';
  import { localizedError, translate } from '$lib/i18n-catalog';
  import { toast } from '$lib/stores/toasts';
  import { walletService, type PairingResponse } from '$lib/wallet';

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

  onDestroy(() => {
    pin = '';
    confirmation = '';
  });

  async function receiveInvitation(frame: string) {
    invitationFrames = [...invitationFrames, frame];
    try {
      invitationJson = await walletService.decodePairingInvitation(invitationFrames);
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
    } catch {
      // Multipart UR decoding is expected to be incomplete until enough unique frames arrive.
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
    } catch (cause) {
      const message = localizedError(cause, $locale, 'Waiting for the complete wallet QR.');
      if (!message.toLowerCase().includes('incomplete')) error = message;
    }
  }
</script>

<div class="page narrow-page pairing-page">
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
        label={translate($locale, 'Encrypted mobile signer QR')}
      />
      <div class="comparison" aria-label={translate($locale, 'Pairing comparison code')}>
        <small>{translate($locale, 'Both devices must show')}</small><strong
          >{comparisonCode}</strong
        >
      </div>
      <div class="identity">
        <Check size={16} /><span>{response.fingerprint} · {response.xpubChecksum}</span>
      </div>
      <Button class="full" onclick={() => (stage = 'final')}
        >{translate($locale, 'Desktop accepted it')}</Button
      >
    </section>
  {:else}
    <section class="pairing-card">
      <span class="step-icon"><ScanLine size={22} /></span>
      <div>
        <strong>{translate($locale, 'Scan the final wallet policy')}</strong><small
          >{translate(
            $locale,
            'Compare the threshold and first address shown on desktop before completing.'
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
  .pairing-card {
    display: grid;
    gap: 1rem;
    padding: 1.25rem;
    border: 1px solid var(--border);
    border-radius: 1rem;
    background: var(--surface);
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
  .inline-error {
    color: var(--danger);
    margin: 0;
  }
</style>
