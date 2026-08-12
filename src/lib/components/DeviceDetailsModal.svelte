<script lang="ts">
  import { CheckCircle2, KeyRound, Maximize2, RefreshCw, ShieldCheck } from '@lucide/svelte';
  import { compactIdentifier } from '$lib/address-display';
  import type { CosignerDraft, CosignerSource } from '$lib/multisig/policy';
  import type { CosignerHealthCheck } from '$lib/wallet';
  import Button from './Button.svelte';
  import HardwareActionPrompt from './HardwareActionPrompt.svelte';
  import IdentifierDetailsModal from './IdentifierDetailsModal.svelte';
  import LocalTimestamp from './LocalTimestamp.svelte';
  import Modal from './Modal.svelte';

  let { signer, health, checking, onclose, oncheck, history = [], policyStatus = null, onpolicy } = $props<{
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
  }>();
  let publicKeyOpen = $state(false);

  function sourceName(source: CosignerSource) {
    return ({ usb: 'USB hardware', qr: 'QR import', file: 'File import', manual: 'Manual backup', virtual: 'Virtual test device' })[source];
  }

  function healthLabel() {
    if (health?.status === 'healthy') return 'Healthy';
    if (health?.status === 'record_valid') return 'Record valid';
    if (health?.status === 'attention') return 'Attention';
    return 'Ready';
  }
</script>

<Modal open={!!signer} title={signer?.label ?? 'Cosigner details'} description="Public identity and coordinator health. No private key is stored here." {onclose}>
  {#if signer}
    <div class="device-details">
      <div class="device-identity"><span><KeyRound size={20}/></span><div><strong>{sourceName(signer.source)}</strong><small>{signer.source === 'usb' || signer.source === 'virtual' ? 'Connection can be verified now' : 'Offline public-key record'}</small></div><span class="ready-badge" class:attention={health?.status === 'attention'}>{healthLabel()}</span></div>
      <dl>
        <div><dt>Master fingerprint</dt><dd><code>{signer.fingerprint}</code></dd></div>
        <div><dt>Account path</dt><dd><code>{signer.derivationPath}</code></dd></div>
        <div><dt>Key source</dt><dd>{sourceName(signer.source)}</dd></div>
        <div><dt>Connection</dt><dd>{signer.source === 'usb' || signer.source === 'virtual' ? 'Available for verification' : 'Offline by design'}</dd></div>
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
        <div class="health-heading"><span class:checked={!!health && health.status !== 'attention'} class:attention={health?.status === 'attention'}><CheckCircle2 size={18}/></span><div><strong>Device health</strong><small>{#if health}Last checked <LocalTimestamp value={health.checkedAt}/>{:else}Not checked in this session{/if}</small></div></div>
        {#if checking}
          <HardwareActionPrompt
            title={signer.source === 'usb' || signer.source === 'virtual' ? 'Checking signer identity' : 'Checking saved signer record'}
            detail={signer.source === 'usb' || signer.source === 'virtual' ? 'Keep the signer connected and unlocked while Groot matches its saved fingerprint.' : 'Groot is validating the saved public record; physical device presence is not checked.'}
            label="Signer health check in progress"
          />
        {:else}
          <p>{health?.summary ?? 'Run a check to verify the saved identity and current connection where available.'}</p>
          <Button variant="secondary" class="full" onclick={oncheck}><RefreshCw size={15}/>Run health check</Button>
        {/if}
      </section>
      {#if history.length}
        <section class="health-history" aria-label="Health check history">
          <div><strong>Recent checks</strong><small>This app session</small></div>
          <ol>{#each history as entry}<li class:attention={entry.status === 'attention'}><span>{entry.status === 'attention' ? 'Needs attention' : entry.status === 'record_valid' ? 'Record valid' : 'Healthy'}</span><LocalTimestamp value={entry.checkedAt}/><small>{entry.summary}</small></li>{/each}</ol>
        </section>
      {/if}
    </div>
  {/if}
</Modal>

{#if signer}<IdentifierDetailsModal value={signer.xpub} open={publicKeyOpen} title={`${signer.label} public account key (xpub)`} description="Extended public key used to derive this signer’s wallet addresses. It cannot sign transactions." label="Public account key (xpub)" onclose={() => publicKeyOpen = false}/>{/if}
