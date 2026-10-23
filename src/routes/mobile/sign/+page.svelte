<script lang="ts">
  import WarningNotice from '$lib/components/WarningNotice.svelte';
  import { onDestroy } from 'svelte';
  import { useWalletShellContext } from '$lib/wallet/shell-context';
  import { ArrowLeft, Check, QrCode, ShieldCheck } from '@lucide/svelte';
  import AnimatedUrQr from '$lib/components/AnimatedUrQr.svelte';
  import Button from '$lib/components/Button.svelte';
  import Amount from '$lib/components/Amount.svelte';
  import ReadableAddress from '$lib/components/ReadableAddress.svelte';
  import { copyText } from '$lib/clipboard';
  import InstructionCard from '$lib/components/InstructionCard.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import UrQrScanner from '$lib/components/UrQrScanner.svelte';
  import { formatInteger, locale } from '$lib/i18n';
  import { localizedError, translate } from '$lib/i18n-catalog';
  import { toast } from '$lib/stores/toasts';
  import {
    walletService,
    WalletError,
    type MobilePsbtReview,
    type SignedMobilePsbt
  } from '$lib/wallet';

  let frames = $state<string[]>([]);
  let reviewedPsbt = $state('');
  let review = $state<MobilePsbtReview | null>(null);
  let signed = $state<SignedMobilePsbt | null>(null);
  let pin = $state('');
  let busy = $state(false);
  let error = $state('');

  const walletShell = useWalletShellContext();
  let scanRevision = 0;
  let active = true;
  function currentAttempt() {
    const revision = scanRevision;
    const walletId = walletShell.selectedWalletId();
    return () => active && revision === scanRevision && walletId === walletShell.selectedWalletId();
  }
  onDestroy(() => {
    active = false;
    restart();
  });

  async function receivePsbtFrame(frame: string) {
    const current = currentAttempt();
    frames = [...frames, frame];
    try {
      const decoded = await walletService.decodePsbtUr(frames);
      if (!current()) return false;
      const result = await walletService.reviewMobilePsbt(decoded);
      if (!current()) return false;
      reviewedPsbt = decoded;
      review = result;
      error = '';
      return true;
    } catch (cause) {
      if (!current()) return false;
      if (cause instanceof WalletError && cause.code === 'qr_incomplete') return false;
      error = localizedError(cause, $locale, 'This QR could not be verified.');
      throw cause;
    }
  }

  async function sign() {
    if (!review || !reviewedPsbt || !pin || busy) return;
    const current = currentAttempt();
    busy = true;
    error = '';
    try {
      const pending = walletService.signMobilePsbt(reviewedPsbt, review.revisionId, pin);
      pin = '';
      const result = await pending;
      if (!current()) return;
      signed = result;
      toast({
        title: 'PSBT signed on this phone',
        description: 'Let desktop scan the signed PSBT. Groot did not broadcast it.',
        tone: 'success'
      });
    } catch (cause) {
      if (current()) error = localizedError(cause, $locale, 'The PSBT was not signed.');
    } finally {
      if (current()) {
        pin = '';
        busy = false;
      }
    }
  }

  function restart() {
    scanRevision += 1;
    busy = false;
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
    <InstructionCard>
      <span class="status-icon"><Check size={22} /></span>
      <div class="signature-heading">
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
    </InstructionCard>
  {:else if review}
    <InstructionCard>
      <Button variant="ghost" size="small" onclick={restart}
        ><ArrowLeft size={16} />{translate($locale, 'Scan again')}</Button
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
      <div class="phone-outputs">
        {#each review.recipients as output}
          <div class="output-row">
            <div class="output-heading">
              <small>{translate($locale, 'Send')}</small><Amount value={output.amountSats} />
            </div>
            <ReadableAddress
              address={output.address}
              oncopy={() => copyText(output.address, 'bitcoin-address')}
            />
          </div>
        {/each}
        {#each review.change as output}
          <div class="output-row">
            <div class="output-heading">
              <small>{translate($locale, 'Verified wallet change')}</small><Amount
                value={output.amountSats}
              />
            </div>
            <ReadableAddress
              address={output.address}
              oncopy={() => copyText(output.address, 'bitcoin-address')}
            />
          </div>
        {/each}
        <div class="fee-row">
          <span>{translate($locale, 'Fee')}</span><strong
            >{formatInteger(review.feeSats, $locale)} sats</strong
          >
        </div>
      </div>
      <dl class="details-list">
        <div>
          <dt>{translate($locale, 'Fee rate')}</dt>
          <dd>{review.feeRateSatVb} {translate($locale, 'sat/vB')}</dd>
        </div>
        <div>
          <dt>{translate($locale, 'Estimated size')}</dt>
          <dd>{review.estimatedVbytes} {translate($locale, 'vB')}</dd>
        </div>
        <div>
          <dt>{translate($locale, 'Locktime')}</dt>
          <dd>{review.lockTime}</dd>
        </div>
        <div>
          <dt>{translate($locale, 'RBF')}</dt>
          <dd>{translate($locale, review.replaceable ? 'Yes' : 'No')}</dd>
        </div>
        <div>
          <dt>{translate($locale, 'Already signed')}</dt>
          <dd>{review.alreadySignedBy.join(', ') || '—'}</dd>
        </div>
      </dl>
      <PasswordField bind:value={pin} label={translate($locale, 'Local app PIN')} />
      {#if error}<WarningNotice
          tone="danger"
          icon
          role="alert"
          ariaLive="polite"
          body={error}
        />{/if}
      <Button class="full" loading={busy} disabled={!pin} onclick={sign}
        >{translate($locale, 'Sign this exact PSBT')}</Button
      >
    </InstructionCard>
  {:else}
    <InstructionCard>
      <span class="status-icon"><QrCode size={22} /></span>
      <div class="scan-heading">
        <strong>{translate($locale, 'Scan unsigned PSBT from desktop')}</strong><small
          >{translate(
            $locale,
            'Only Blockchain Commons crypto-psbt UR frames are accepted.'
          )}</small
        >
      </div>
      {#if error}<WarningNotice
          tone="danger"
          icon
          role="alert"
          ariaLive="polite"
          body={error}
        />{/if}
      <UrQrScanner onframe={receivePsbtFrame} onreset={restart} />
    </InstructionCard>
  {/if}
</div>

<style>
  .mobile-sign-page {
    padding-bottom: max(2rem, env(safe-area-inset-bottom));
  }
  .review-heading,
  .review-heading span {
    display: grid;
    gap: 0.25rem;
  }
  .mobile-sign-page :global(.instruction-card small) {
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
  .signature-heading,
  .scan-heading,
  .phone-outputs {
    display: grid;
    gap: 0.75rem;
  }
  .signature-heading,
  .scan-heading {
    gap: 0.25rem;
    overflow-wrap: anywhere;
  }
  .output-heading,
  .fee-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
  }
  .output-row {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
    padding: 0.8rem 0;
    border-bottom: 1px solid var(--border);
  }
  .security-copy {
    color: var(--muted);
    margin: 0;
  }
</style>
