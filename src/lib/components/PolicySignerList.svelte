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
    detailMode = 'identity'
  } = $props<{
    signers: CosignerDraft[];
    currentFingerprint?: string;
    detailMode?: 'fingerprint' | 'identity';
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
        {#if detailMode === 'fingerprint'}
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

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.policy-signer-list):where(.policy-signer-list) {
    display: grid;
    gap: 8px;
  }
  :global(.policy-signer-list):where(.policy-signer-list) :global(article) {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    align-items: start;
    gap: 10px;
    padding: 11px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--panel);
  }
  :global(.policy-signer-list):where(.policy-signer-list) :global(article.current) {
    border-color: color-mix(in srgb, var(--fr-blue) 52%, var(--border));
    background: color-mix(in srgb, var(--fr-blue) 6%, var(--panel));
  }
  :global(.policy-signer-number):where(.policy-signer-number) {
    display: grid;
    width: 36px;
    height: 36px;
    place-items: center;
    border-radius: var(--radius-control);
    color: var(--muted);
    background: var(--surface-icon);
    font: 700 10px var(--font-mono);
  }
  :global(.policy-signer-copy):where(.policy-signer-copy) {
    display: grid;
    gap: 7px;
    min-width: 0;
  }
  :global(.policy-signer-copy):where(.policy-signer-copy) > :global(strong) {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-meta);
  }
  :global(.policy-signer-copy):where(.policy-signer-copy) > :global(strong em) {
    color: var(--link);
    font-size: var(--font-size-meta);
    font-style: normal;
  }
  :global(.policy-signer-copy):where(.policy-signer-copy) > :global(code) {
    color: var(--text-soft);
    font-size: var(--font-size-meta);
  }
  :global(.policy-signer-identifiers):where(.policy-signer-identifiers) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  :global(.policy-signer-identifiers):where(.policy-signer-identifiers) :global(button) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 3px 7px;
    min-width: 0;
    padding: 7px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    color: var(--text);
    background: var(--surface-control);
    text-align: left;
    cursor: pointer;
  }
  :global(.policy-signer-identifiers):where(.policy-signer-identifiers) :global(button:hover) {
    border-color: var(--border-strong);
    background: var(--surface-hover);
  }
  :global(.policy-signer-identifiers):where(.policy-signer-identifiers) :global(button span) {
    grid-column: 1 / -1;
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.policy-signer-identifiers):where(.policy-signer-identifiers) :global(button code) {
    min-width: 0;
    overflow: hidden;
    color: var(--text-soft);
    font-size: var(--font-size-meta);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.policy-signer-identifiers):where(.policy-signer-identifiers) :global(button svg) {
    color: var(--muted);
  }
  :global(.policy-signer-identifiers):where(.policy-signer-identifiers) :global(.wide) {
    grid-column: 1 / -1;
  }
</style>
