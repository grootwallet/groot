<script lang="ts">
  import { CheckCircle2, KeyRound, Maximize2, Pencil, RefreshCw, ShieldCheck } from '@lucide/svelte';
  import { compactIdentifier } from '$lib/address-display';
  import { normalizeSignerLabel, signerLabelError, type CosignerDraft, type CosignerSource } from '$lib/multisig/policy';
  import type { CosignerHealthCheck } from '$lib/wallet';
  import Button from './Button.svelte';
  import HardwareActionPrompt from './HardwareActionPrompt.svelte';
  import IdentifierDetailsModal from './IdentifierDetailsModal.svelte';
  import LocalTimestamp from './LocalTimestamp.svelte';
  import Modal from './Modal.svelte';

  let { signer, health, checking, onclose, oncheck, history = [], policyStatus = null, onpolicy, onrename, accountStandard = 'BIP48' } = $props<{
    signer: CosignerDraft | null;
    health: CosignerHealthCheck | null;
    checking: boolean;
    onclose: () => void;
    oncheck: () => void;
    history?: CosignerHealthCheck[];
    policyStatus?: {
      label: string;
      description: string;
      attention: boolean;
      actionLabel?: string;
      verifiedAt?: string;
    } | null;
    onpolicy?: () => void;
    onrename?: (label: string) => Promise<void> | void;
    accountStandard?: 'BIP48' | 'BIP84';
  }>();
  let publicKeyOpen = $state(false);
  let editingName = $state(false);
  let nameDraft = $state('');
  let nameError = $state('');
  let renaming = $state(false);

  function sourceName(source: CosignerSource) {
    return ({ usb: 'USB hardware', qr: 'QR import', file: 'File import', manual: 'Manual backup', virtual: 'Virtual test device' })[source];
  }

  function healthLabel() {
    if (health?.status === 'healthy') return 'Healthy';
    if (health?.status === 'attention') return 'Attention';
    return 'Ready';
  }

  function startRenaming() {
    if (!signer || !onrename) return;
    nameDraft = signer.label;
    nameError = '';
    editingName = true;
  }

  function cancelRenaming() {
    editingName = false;
    nameDraft = '';
    nameError = '';
  }

  async function saveName() {
    if (!signer || !onrename || renaming) return;
    nameError = signerLabelError(nameDraft) ?? '';
    if (nameError) return;
    const normalized = normalizeSignerLabel(nameDraft);
    if (normalized === signer.label) {
      cancelRenaming();
      return;
    }
    renaming = true;
    try {
      await onrename(normalized);
      cancelRenaming();
    } catch (cause) {
      nameError = cause instanceof Error ? cause.message : 'Could not rename this signer.';
    } finally {
      renaming = false;
    }
  }
</script>

<Modal open={!!signer} title={signer?.label ?? 'Signer details'} description="Public identity and verification status. No private key is stored here." {onclose}>
  {#if signer}
    <div class="device-details">
      <div class="device-identity"><span><KeyRound size={20}/></span><div><strong>{sourceName(signer.source)}</strong><small>{signer.source === 'usb' || signer.source === 'virtual' ? 'Connection can be verified now' : 'Connect the signer to verify its saved key'}</small></div><span class="ready-badge" class:attention={health?.status === 'attention'}>{healthLabel()}</span></div>
      {#if onrename}
        <section class="signer-name-editor">
          {#if editingName}
            <form onsubmit={(event) => { event.preventDefault(); void saveName(); }}>
              <label><span>Signer name</span><input aria-label="Signer name" bind:value={nameDraft} maxlength="48" autocomplete="off"/></label>
              <div><Button variant="secondary" size="small" onclick={cancelRenaming}>Cancel</Button><Button size="small" type="submit" loading={renaming} loadingLabel="Saving…" disabled={Boolean(signerLabelError(nameDraft))}>Save name</Button></div>
            </form>
            {#if nameError}<p class="form-error" role="alert">{nameError}</p>{/if}
          {:else}
            <span><small>Signer name</small><strong>{signer.label}</strong></span>
            <Button variant="secondary" size="small" onclick={startRenaming}><Pencil size={13}/>Edit name</Button>
          {/if}
        </section>
      {/if}
      <dl>
        <div><dt>Master fingerprint</dt><dd><code>{signer.fingerprint}</code></dd></div>
        <div><dt>Account path</dt><dd><code>{signer.derivationPath}</code></dd></div>
        <div><dt>Key source</dt><dd>{sourceName(signer.source)}</dd></div>
        <div><dt>Connection</dt><dd>{signer.source === 'usb' || signer.source === 'virtual' ? 'Available for verification' : 'USB required for health check'}</dd></div>
        <div class="public-key-detail"><dt>Public account key (xpub)</dt><dd><button class="public-key-trigger" aria-label="View public account key (xpub)" onclick={() => publicKeyOpen = true}><code>{compactIdentifier(signer.xpub, 18, 12)}</code><Maximize2 size={14}/></button></dd></div>
      </dl>
      {#if policyStatus}
        <section class="device-policy-status" class:attention={policyStatus.attention}>
          <span><ShieldCheck size={18}/></span>
          <div>
            <strong>Wallet policy</strong>
            <small>{policyStatus.description}</small>
            {#if policyStatus.verifiedAt}<small>Last verified <LocalTimestamp value={policyStatus.verifiedAt}/></small>{/if}
          </div>
          <em>{policyStatus.label}</em>
          {#if policyStatus.actionLabel && onpolicy}
            <Button variant="secondary" size="small" onclick={onpolicy}>{policyStatus.actionLabel}</Button>
          {/if}
        </section>
      {/if}
      <section class="health-card" aria-live="polite">
        <div class="health-heading"><span class:checked={health?.status === 'healthy'} class:attention={health?.status === 'attention'}><CheckCircle2 size={18}/></span><div><strong>Device health</strong><small>{#if health?.status === 'healthy'}Last checked <LocalTimestamp value={health.checkedAt}/>{:else}Not checked in this session{/if}</small></div></div>
        {#if checking}
          <HardwareActionPrompt
            title="Checking signer key"
            detail={`Keep the signer connected and unlocked while Groot reads its ${accountStandard} account key and compares it with the saved key.`}
            label="Signer health check in progress"
          />
        {:else}
          <p>{health?.summary ?? `Connect and unlock the signer to verify that it holds the saved ${accountStandard} account key.`}</p>
          <Button variant="secondary" class="full" onclick={oncheck}><RefreshCw size={15}/>Run health check</Button>
        {/if}
      </section>
      {#if history.length}
        <section class="health-history" aria-label="Health check history">
          <div><strong>Recent checks</strong><small>This app session</small></div>
          <ol>{#each history as entry}<li class:attention={entry.status === 'attention'}><span>{entry.status === 'attention' ? 'Needs attention' : 'Healthy'}</span><LocalTimestamp value={entry.checkedAt}/><small>{entry.summary}</small></li>{/each}</ol>
        </section>
      {/if}
    </div>
  {/if}
</Modal>

{#if signer}<IdentifierDetailsModal value={signer.xpub} open={publicKeyOpen} title={`${signer.label} public account key (xpub)`} description="Extended public key used to derive this signer’s wallet addresses. It cannot sign transactions." label="Public account key (xpub)" onclose={() => publicKeyOpen = false}/>{/if}
