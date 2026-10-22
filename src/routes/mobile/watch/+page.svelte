<script lang="ts">
  import WarningNotice from '$lib/components/WarningNotice.svelte';
  import { goto } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import { ArrowLeft, Eye, ScanLine, ShieldCheck } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import InstructionCard from '$lib/components/InstructionCard.svelte';
  import FieldCounter from '$lib/components/FieldCounter.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import UrQrScanner from '$lib/components/UrQrScanner.svelte';
  import { locale } from '$lib/i18n';
  import { localizedError, translate } from '$lib/i18n-catalog';
  import { toast } from '$lib/stores/toasts';
  import { walletService, WalletError, type ExternalSigner } from '$lib/wallet';

  let frames = $state<string[]>([]);
  let content = $state('');
  let signer = $state<ExternalSigner | null>(null);
  let name = $state('Hardware wallet');
  let pin = $state('');
  let confirmation = $state('');
  let busy = $state(false);
  let error = $state('');

  onDestroy(() => {
    pin = '';
    confirmation = '';
  });

  async function receive(frame: string) {
    frames = [...frames, frame];
    try {
      content = await walletService.decodeWatchOnlyQr(frames);
      signer = await walletService.parseExternalSignerImport(content, 'Hardware signer', 'qr');
      error = '';
      return true;
    } catch (cause) {
      if (cause instanceof WalletError && cause.code === 'qr_incomplete') return false;
      error = localizedError(cause, $locale, 'This QR could not be verified.');
      throw cause;
    }
  }

  async function create() {
    if (!signer || !name.trim() || !pin || pin !== confirmation) return;
    busy = true;
    error = '';
    try {
      await walletService.createExternalSignerWallet(name, signer, pin);
      pin = '';
      confirmation = '';
      toast({
        title: 'Watch-only wallet imported',
        description: 'This phone can monitor addresses but has no signing key.',
        tone: 'success'
      });
      await goto('/hardware');
    } catch (cause) {
      error = localizedError(cause, $locale, 'The watch-only wallet could not be imported.');
    } finally {
      pin = '';
      confirmation = '';
      busy = false;
    }
  }
</script>

<div class="page narrow-page watch-import-page">
  <header class="page-header">
    <div>
      <p class="eyebrow">{translate($locale, 'WATCH-ONLY')}</p>
      <h1>{translate($locale, 'Import a desktop hardware wallet')}</h1>
      <p class="subtitle">
        {translate(
          $locale,
          'Scan the public descriptor from desktop. No hardware seed, signing key, or Groot account is transferred.'
        )}
      </p>
    </div>
  </header>

  <InstructionCard>
    {#if signer}
      <span class="status-icon"><Eye size={22} /></span>
      <div>
        <strong>{signer.label}</strong><small>{signer.fingerprint} · {signer.derivationPath}</small>
      </div>
      <div class="security-note">
        <ShieldCheck size={18} /><span
          ><strong>{translate($locale, 'Cannot sign')}</strong><small
            >{translate(
              $locale,
              'This copy derives receive and change addresses and reveals wallet activity. Spending still requires the hardware signer.'
            )}</small
          ></span
        >
      </div>
      <label class="field"
        ><span>{translate($locale, 'Wallet name')}</span><input
          bind:value={name}
          maxlength="48"
        /><FieldCounter value={name} max={48} /></label
      >
      <PasswordField bind:value={pin} label={translate($locale, 'Local app PIN')} />
      <PasswordField bind:value={confirmation} label={translate($locale, 'Confirm PIN')} />
      {#if error}<WarningNotice
          tone="danger"
          icon
          role="alert"
          ariaLive="polite"
          body={error}
        />{/if}
      <Button
        class="full"
        loading={busy}
        disabled={!name.trim() || !pin || pin !== confirmation}
        onclick={create}>{translate($locale, 'Import watch-only wallet')}</Button
      >
    {:else}
      <span class="status-icon"><ScanLine size={22} /></span>
      <div>
        <strong>{translate($locale, 'Scan public wallet QR')}</strong><small
          >{translate(
            $locale,
            'In Groot desktop open Settings → Export & verify → Show on phone.'
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
      <UrQrScanner
        acceptedTypes={['groot-wallet']}
        prompt={translate($locale, 'Point the camera at the Groot watch-only wallet QR')}
        onframe={receive}
        onreset={() => {
          frames = [];
          error = '';
        }}
      />
    {/if}
  </InstructionCard>
  <Button variant="secondary" class="full" href="/">
    <ArrowLeft size={16} />{translate($locale, 'Back to wallet')}
  </Button>
</div>

<style>
  .watch-import-page > :global(.button) {
    margin-top: 16px;
  }
  .watch-import-page {
    padding-bottom: max(2rem, env(safe-area-inset-bottom));
  }
  .watch-import-page :global(.instruction-card > div:first-of-type) {
    display: grid;
    gap: 0.25rem;
  }
  .watch-import-page :global(.instruction-card small) {
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
    background: var(--surface-inset);
  }
  .security-note span {
    display: grid;
    gap: 0.2rem;
  }
</style>
