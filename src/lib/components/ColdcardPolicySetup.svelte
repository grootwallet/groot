<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { AlertTriangle, Check, ChevronRight, Download, ShieldCheck } from '@lucide/svelte';
  import type { CosignerDraft } from '$lib/multisig/policy';
  import type { MultisigWallet } from '$lib/wallet';
  import Button from './Button.svelte';
  import InstructionCard from './InstructionCard.svelte';
  import PolicySignerList from './PolicySignerList.svelte';

  let {
    wallet,
    signer,
    busy = false,
    error = '',
    completionLabel = 'Continue to signing',
    ondownload,
    onconfirm,
    onback
  } = $props<{
    wallet: MultisigWallet;
    signer: CosignerDraft;
    busy?: boolean;
    error?: string;
    completionLabel?: string;
    ondownload?: () => void;
    onconfirm?: () => void;
    onback?: () => void;
  }>();
  let acknowledged = $state(false);
  let signerDetailsOpen = $state(false);
  const steps = $derived([
    'Save the public policy file and copy it to Coldcard’s microSD card or enabled Virtual Disk.',
    'On Coldcard, open Settings → Multisig Wallets → Import.',
    `Match ${wallet.name}, the ${wallet.threshold}-of-${wallet.cosigners.length} threshold, and every signer fingerprint.`
  ]);
</script>

<section
  class="signer-policy-review"
  aria-label={translate($locale, 'Coldcard wallet policy setup')}
>
  <header>
    <span><ShieldCheck size={19} /></span>
    <div>
      <strong>{translate($locale, 'Register this wallet on')} {signer.label}</strong>
      <small
        >{translate(
          $locale,
          'Coldcard cannot learn this multisig policy automatically over Groot’s USB signing\n        connection.'
        )}</small
      >
    </div>
  </header>

  <InstructionCard title={translate($locale, 'Import once before signing')} {steps}>
    <Button variant="secondary" class="full" disabled={busy} onclick={ondownload}
      ><Download size={15} />{translate($locale, 'Save Coldcard policy')}</Button
    >
  </InstructionCard>

  <details class="policy-signer-details" bind:open={signerDetailsOpen}>
    <summary
      ><span
        ><strong>{translate($locale, 'Review all signer public keys')}</strong><small
          >{translate($locale, 'Inspect fingerprints, paths, and xpubs before approving.')}</small
        ></span
      ><span class="policy-signer-details-state"
        ><em>{translate($locale, signerDetailsOpen ? 'Hide' : 'Review')}</em><ChevronRight
          class="policy-signer-details-chevron"
          size={15}
          aria-hidden="true"
        /></span
      ></summary
    >
    <PolicySignerList signers={wallet.cosigners} currentFingerprint={signer.fingerprint} />
  </details>

  <label class="policy-review-confirmation"
    ><input type="checkbox" bind:checked={acknowledged} /><span
      ><strong>{translate($locale, 'I imported and verified this policy on')} {signer.label}</strong
      ><small
        >{translate(
          $locale,
          'This records your on-device check for this wallet and signer fingerprint.'
        )}</small
      ></span
    ></label
  >
  {#if error}<div class="hardware-inline-error" role="alert">
      <AlertTriangle size={18} /><span
        ><strong>{translate($locale, 'Coldcard setup was not recorded')}</strong><small
          >{error}</small
        ></span
      >
    </div>{/if}
  <div class="modal-footer policy-review-actions">
    {#if onback}<Button variant="secondary" disabled={busy} onclick={onback}
        >{translate($locale, 'Back')}</Button
      >{/if}
    <Button
      disabled={!acknowledged}
      loading={busy}
      loadingLabel={translate($locale, 'Saving confirmation…')}
      onclick={onconfirm}><Check size={15} />{translate($locale, completionLabel)}</Button
    >
  </div>
</section>
