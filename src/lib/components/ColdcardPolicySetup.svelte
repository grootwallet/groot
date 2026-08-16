<script lang="ts">
  import { AlertTriangle, Check, Download, ShieldCheck } from '@lucide/svelte';
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
    ondownload,
    onconfirm,
    onback
  } = $props<{
    wallet: MultisigWallet;
    signer: CosignerDraft;
    busy?: boolean;
    error?: string;
    ondownload?: () => void;
    onconfirm?: () => void;
    onback?: () => void;
  }>();
  let acknowledged = $state(false);
  const steps = $derived([
    'Save the public policy file below and copy it to Coldcard’s microSD card.',
    'On Coldcard, open Settings → Multisig Wallets → Import.',
    `Match ${wallet.name}, the ${wallet.threshold}-of-${wallet.cosigners.length} threshold, and every signer fingerprint.`
  ]);
</script>

<section class="signer-policy-review" aria-label="Coldcard wallet policy setup">
  <header>
    <span><ShieldCheck size={19} /></span>
    <div>
      <strong>Register this wallet on {signer.label}</strong>
      <small
        >Coldcard cannot learn this multisig policy automatically over Groot’s USB signing
        connection.</small
      >
    </div>
  </header>

  <InstructionCard title="Import once before signing" {steps}>
    <Button variant="secondary" class="full" disabled={busy} onclick={ondownload}
      ><Download size={15} />Save Coldcard policy</Button
    >
  </InstructionCard>

  <PolicySignerList
    signers={wallet.cosigners}
    currentFingerprint={signer.fingerprint}
    detail="fingerprint"
  />

  <label class="policy-review-confirmation"
    ><input type="checkbox" bind:checked={acknowledged} /><span
      ><strong>I imported and verified this policy on {signer.label}</strong><small
        >This records your on-device check for this wallet and signer fingerprint.</small
      ></span
    ></label
  >
  {#if error}<div class="hardware-inline-error" role="alert">
      <AlertTriangle size={18} /><span
        ><strong>Coldcard setup was not recorded</strong><small>{error}</small></span
      >
    </div>{/if}
  <div class="modal-footer policy-review-actions">
    {#if onback}<Button variant="secondary" disabled={busy} onclick={onback}>Back</Button>{/if}
    <Button
      disabled={!acknowledged}
      loading={busy}
      loadingLabel="Saving confirmation…"
      onclick={onconfirm}><Check size={15} />Continue to signing</Button
    >
  </div>
</section>
