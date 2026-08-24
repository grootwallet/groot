<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { Maximize2 } from '@lucide/svelte';
  import type { CosignerDraft } from '$lib/multisig/policy';
  import { compactIdentifier } from '$lib/address-display';
  import IdentifierDetailsModal from './IdentifierDetailsModal.svelte';

  let {
    signers,
    currentFingerprint,
    detail = 'identity'
  } = $props<{
    signers: CosignerDraft[];
    currentFingerprint?: string;
    detail?: 'fingerprint' | 'identity';
  }>();

  let detailOpen = $state(false);
  let detailValue = $state('');
  let detailTitle = $state('');
  let detailDescription = $state('');
  let detailLabel = $state('Value');

  function inspect(value: string, title: string, description: string, label: string) {
    detailValue = value;
    detailTitle = title;
    detailDescription = description;
    detailLabel = label;
    detailOpen = true;
  }
</script>

<div class="policy-signer-list">
  {#each signers as signer, index}
    {@const current = signer.fingerprint.toLowerCase() === currentFingerprint?.toLowerCase()}
    <article class:current>
      <span class="policy-signer-number">{index + 1}</span>
      <div class="policy-signer-copy">
        <strong
          >{signer.label}{#if current}<em>{translate($locale, 'This device')}</em>{/if}</strong
        >
        {#if detail === 'fingerprint'}
          <code>{signer.fingerprint.toLowerCase()}</code>
        {:else}
          <div class="policy-signer-identifiers">
            <button
              type="button"
              onclick={() =>
                inspect(
                  signer.fingerprint.toLowerCase(),
                  `${signer.label} fingerprint`,
                  'Compare all eight hexadecimal characters with the hardware device.',
                  'Fingerprint'
                )}
              ><span>{translate($locale, 'Fingerprint')}</span><code
                >{signer.fingerprint.toLowerCase()}</code
              ><Maximize2 size={12} /></button
            >
            <button
              type="button"
              onclick={() =>
                inspect(
                  signer.derivationPath,
                  `${signer.label} derivation path`,
                  'Compare the complete BIP48 account path with the hardware device.',
                  'Derivation path'
                )}
              ><span>{translate($locale, 'Path')}</span><code>{signer.derivationPath}</code
              ><Maximize2 size={12} /></button
            >
            <button
              type="button"
              class="wide"
              onclick={() =>
                inspect(
                  signer.xpub,
                  `${signer.label} public account key (xpub)`,
                  'Compare the complete xpub across every hardware-device screen.',
                  'Public account key (xpub)'
                )}
              ><span>{translate($locale, 'Public account key (xpub)')}</span><code
                >{compactIdentifier(signer.xpub, 14, 10)}</code
              ><Maximize2 size={12} /></button
            >
          </div>
        {/if}
      </div>
    </article>
  {/each}
</div>

<IdentifierDetailsModal
  value={detailValue}
  open={detailOpen}
  title={detailTitle}
  description={detailDescription}
  label={detailLabel}
  onclose={() => (detailOpen = false)}
/>
