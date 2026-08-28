<script lang="ts">
  import { goto } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import { KeyRound, ScanLine, ShieldCheck } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import UrQrScanner from '$lib/components/UrQrScanner.svelte';
  import { locale } from '$lib/i18n';
  import { localizedError, translate } from '$lib/i18n-catalog';
  import { toast } from '$lib/stores/toasts';
  import { walletService, WalletError, type MobileRecoveryRecord } from '$lib/wallet';

  let frames = $state<string[]>([]);
  let record = $state<MobileRecoveryRecord | null>(null);
  let pin = $state('');
  let confirmation = $state('');
  let busy = $state(false);
  let error = $state('');

  onDestroy(() => {
    pin = '';
    confirmation = '';
  });

  async function receive(frame: string) {
    const nextFrames = [...frames, frame];
    frames = nextFrames;
    try {
      record = await walletService.inspectMobileRecoveryRecord(nextFrames);
      error = '';
      return true;
    } catch (cause) {
      if (cause instanceof WalletError && cause.code === 'invalid_coordination_qr') return false;
      error = localizedError(cause, $locale, 'This recovery QR could not be verified.');
      return false;
    }
  }

  async function recover() {
    if (!record || !pin || pin !== confirmation) return;
    busy = true;
    error = '';
    try {
      const wallet = await walletService.recoverMobileSigner(frames, pin);
      pin = '';
      confirmation = '';
      toast({
        title: translate($locale, 'Phone signer restored'),
        description: translate($locale, '{wallet} matched the words and exact desktop policy.', {
          wallet: wallet.name
        }),
        tone: 'success'
      });
      await goto('/multisig');
    } catch (cause) {
      error = localizedError(cause, $locale, 'The phone signer could not be restored.');
    } finally {
      pin = '';
      confirmation = '';
      busy = false;
    }
  }
</script>

<div class="page narrow-page mobile-recovery-page">
  <header class="page-header">
    <div>
      <p class="eyebrow">{translate($locale, 'PHONE SIGNER')}</p>
      <h1>{translate($locale, 'Restore a shared wallet')}</h1>
      <p class="subtitle">
        {translate(
          $locale,
          'Scan the recovery QR from desktop, then enter this phone signer’s original 24 words.'
        )}
      </p>
    </div>
  </header>

  <section class="recovery-card">
    {#if record}
      <span class="status-icon"><ShieldCheck size={22} /></span>
      <div class="record-summary">
        <strong>{record.walletName}</strong>
        <small>{record.threshold} of {record.signerCount} · {record.mobileSignerFingerprint}</small>
      </div>
      <div class="security-note">
        <KeyRound size={18} />
        <span>
          <strong>{translate($locale, 'Exact match required')}</strong>
          <small
            >{translate(
              $locale,
              'Groot restores only if the words reproduce this signer and the complete wallet policy.'
            )}</small
          >
        </span>
      </div>
      <PasswordField bind:value={pin} label={translate($locale, 'New local app PIN')} />
      <PasswordField bind:value={confirmation} label={translate($locale, 'Confirm PIN')} />
      {#if error}<p class="inline-error" role="alert">{error}</p>{/if}
      <Button
        class="full"
        loading={busy}
        loadingLabel={translate($locale, 'Verifying recovery…')}
        disabled={!pin || pin !== confirmation}
        onclick={recover}>{translate($locale, 'Enter 24 words and restore')}</Button
      >
    {:else}
      <span class="status-icon"><ScanLine size={22} /></span>
      <div class="record-summary">
        <strong>{translate($locale, 'Scan desktop recovery QR')}</strong>
        <small
          >{translate(
            $locale,
            'On desktop, open the shared wallet menu and choose Restore Groot phone.'
          )}</small
        >
      </div>
      {#if error}<p class="inline-error" role="alert">{error}</p>{/if}
      <UrQrScanner
        acceptedTypes={['groot-wallet']}
        prompt={translate($locale, 'Point the camera at the desktop recovery QR')}
        onframe={receive}
      />
    {/if}
  </section>

  <Button class="full" variant="secondary" href="/welcome?add=1"
    >{translate($locale, 'Back to wallets')}</Button
  >
</div>

<style>
  .mobile-recovery-page {
    padding-bottom: max(2rem, env(safe-area-inset-bottom));
  }
  .recovery-card {
    display: grid;
    gap: 1rem;
    padding: 1.25rem;
    border: 1px solid var(--border);
    border-radius: 1rem;
    background: var(--surface);
  }
  .record-summary {
    display: grid;
    gap: 0.25rem;
  }
  .record-summary small,
  .security-note small {
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
  .security-note {
    display: flex;
    gap: 0.75rem;
    padding: 0.9rem;
    border-radius: 0.8rem;
    background: var(--surface-raised);
  }
  .security-note > span {
    display: grid;
    gap: 0.2rem;
  }
  .inline-error {
    margin: 0;
    color: var(--danger);
  }
</style>
