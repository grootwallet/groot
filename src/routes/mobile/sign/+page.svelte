<script lang="ts">
  import { onDestroy } from 'svelte';
  import { ArrowLeft, Check, QrCode, ShieldCheck } from '@lucide/svelte';
  import AnimatedUrQr from '$lib/components/AnimatedUrQr.svelte';
  import Button from '$lib/components/Button.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import UrQrScanner from '$lib/components/UrQrScanner.svelte';
  import { formatInteger, locale } from '$lib/i18n';
  import { localizedError, translate } from '$lib/i18n-catalog';
  import { toast } from '$lib/stores/toasts';
  import { walletService, type MobilePsbtReview, type SignedMobilePsbt } from '$lib/wallet';

  let frames = $state<string[]>([]);
  let reviewedPsbt = $state('');
  let review = $state<MobilePsbtReview | null>(null);
  let signed = $state<SignedMobilePsbt | null>(null);
  let pin = $state('');
  let busy = $state(false);
  let error = $state('');

  onDestroy(() => (pin = ''));

  async function receivePsbtFrame(frame: string) {
    frames = [...frames, frame];
    try {
      reviewedPsbt = await walletService.decodePsbtUr(frames);
      review = await walletService.reviewMobilePsbt(reviewedPsbt);
      error = '';
    } catch (cause) {
      const message = localizedError(cause, $locale, 'Waiting for the complete PSBT QR.');
      if (!message.toLowerCase().includes('incomplete')) error = message;
    }
  }

  async function sign() {
    if (!review || !reviewedPsbt || !pin) return;
    busy = true;
    error = '';
    try {
      signed = await walletService.signMobilePsbt(reviewedPsbt, review.revisionId, pin);
      pin = '';
      toast({
        title: 'PSBT signed on this phone',
        description: 'Let desktop scan the signed PSBT. Groot did not broadcast it.',
        tone: 'success'
      });
    } catch (cause) {
      error = localizedError(cause, $locale, 'The PSBT was not signed.');
    } finally {
      pin = '';
      busy = false;
    }
  }

  function restart() {
    frames = [];
    reviewedPsbt = '';
    review = null;
    signed = null;
    pin = '';
    error = '';
  }
</script>

<div class="page narrow-page mobile-sign-page">
  <header class="page-header">
    <div>
      <p class="eyebrow">{translate($locale, 'PHONE SIGNER')}</p>
      <h1>{translate($locale, 'Sign a desktop PSBT')}</h1>
      <p class="subtitle">
        {translate(
          $locale,
          'Review the exact transaction on this phone. Signing never broadcasts or changes the desktop proposal.'
        )}
      </p>
    </div>
  </header>

  {#if signed}
    <section class="sign-card">
      <span class="status-icon"><Check size={22} /></span>
      <div>
        <strong>{translate($locale, 'Signature ready')}</strong><small
          >{signed.signerFingerprint} · {signed.revisionId.slice(0, 12)}</small
        >
      </div>
      <AnimatedUrQr frames={signed.frames} label={translate($locale, 'Signed crypto-psbt QR')} />
      <p class="security-copy">
        {translate(
          $locale,
          'On desktop choose “Scan signed PSBT.” Desktop will reject any signature that does not match the exact reviewed proposal.'
        )}
      </p>
      <Button variant="secondary" class="full" onclick={restart}
        >{translate($locale, 'Sign another PSBT')}</Button
      >
    </section>
  {:else if review}
    <section class="sign-card">
      <button class="back-link" onclick={restart}
        ><ArrowLeft size={16} />{translate($locale, 'Scan again')}</button
      >
      <div class="review-heading">
        <ShieldCheck size={20} /><span
          ><strong>{translate($locale, 'Transaction verified')}</strong><small
            >{review.transactionId.slice(0, 16)}… · {translate($locale, '{count} inputs', {
              count: review.inputCount
            })}</small
          ></span
        >
      </div>
      <div class="review-list">
        {#each review.recipients as output}
          <div>
            <span><small>{translate($locale, 'Send')}</small><code>{output.address}</code></span
            ><strong>{formatInteger(output.amountSats, $locale)} sats</strong>
          </div>
        {/each}
        {#each review.change as output}
          <div>
            <span
              ><small>{translate($locale, 'Verified wallet change')}</small><code
                >{output.address}</code
              ></span
            ><strong>{formatInteger(output.amountSats, $locale)} sats</strong>
          </div>
        {/each}
        <div class="fee-row">
          <span>{translate($locale, 'Fee')}</span><strong
            >{formatInteger(review.feeSats, $locale)} sats</strong
          >
        </div>
      </div>
      <PasswordField bind:value={pin} label={translate($locale, 'Local app PIN')} />
      {#if error}<p class="inline-error" role="alert">{error}</p>{/if}
      <Button class="full" loading={busy} disabled={!pin} onclick={sign}
        >{translate($locale, 'Sign this exact PSBT')}</Button
      >
    </section>
  {:else}
    <section class="sign-card">
      <span class="status-icon"><QrCode size={22} /></span>
      <div>
        <strong>{translate($locale, 'Scan unsigned PSBT from desktop')}</strong><small
          >{translate(
            $locale,
            'Only Blockchain Commons crypto-psbt UR frames are accepted.'
          )}</small
        >
      </div>
      {#if error}<p class="inline-error" role="alert">{error}</p>{/if}
      <UrQrScanner onframe={receivePsbtFrame} />
    </section>
  {/if}
</div>

<style>
  .mobile-sign-page {
    padding-bottom: max(2rem, env(safe-area-inset-bottom));
  }
  .sign-card {
    display: grid;
    gap: 1rem;
    padding: 1.25rem;
    border: 1px solid var(--border);
    border-radius: 1rem;
    background: var(--surface);
  }
  .sign-card > div:first-of-type,
  .review-heading,
  .review-heading span {
    display: grid;
    gap: 0.25rem;
  }
  .sign-card small {
    color: var(--muted);
  }
  .status-icon {
    width: 2.75rem;
    height: 2.75rem;
    display: grid;
    place-items: center;
    border-radius: 0.8rem;
    color: var(--link);
    background: color-mix(in srgb, var(--link) 12%, transparent);
  }
  .review-heading {
    grid-template-columns: auto 1fr;
    align-items: center;
    column-gap: 0.75rem;
  }
  .review-list {
    display: grid;
    gap: 0.75rem;
  }
  .review-list > div {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    padding: 0.8rem 0;
    border-bottom: 1px solid var(--border);
  }
  .review-list span {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }
  .review-list code {
    overflow-wrap: anywhere;
    color: var(--muted);
    font-size: 0.76rem;
  }
  .review-list strong {
    white-space: nowrap;
  }
  .security-copy {
    color: var(--muted);
    margin: 0;
  }
  .inline-error {
    color: var(--danger);
    margin: 0;
  }
</style>
