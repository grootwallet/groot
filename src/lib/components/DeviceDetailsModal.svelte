<script lang="ts">
  import { CheckCircle2, Copy, KeyRound, RefreshCw } from '@lucide/svelte';
  import type { CosignerDraft, CosignerSource } from '$lib/multisig/policy';
  import type { CosignerHealthCheck } from '$lib/wallet';
  import Button from './Button.svelte';
  import HardwareActionPrompt from './HardwareActionPrompt.svelte';
  import LocalTimestamp from './LocalTimestamp.svelte';
  import Modal from './Modal.svelte';

  let { signer, health, checking, onclose, oncheck, oncopy, history = [] } = $props<{
    signer: CosignerDraft | null;
    health: CosignerHealthCheck | null;
    checking: boolean;
    onclose: () => void;
    oncheck: () => void;
    oncopy: () => void;
    history?: CosignerHealthCheck[];
  }>();

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
        <div class="public-key-detail"><dt>Public account key</dt><dd><code>{signer.xpub}</code><button aria-label="Copy public account key" onclick={oncopy}><Copy size={14}/></button></dd></div>
      </dl>
      <section class="health-card" aria-live="polite">
        <div class="health-heading"><span class:checked={!!health && health.status !== 'attention'} class:attention={health?.status === 'attention'}><CheckCircle2 size={18}/></span><div><strong>Device health</strong><small>{#if health}Last checked <LocalTimestamp value={health.checkedAt}/>{:else}Not checked in this session{/if}</small></div></div>
        {#if checking}
          <HardwareActionPrompt
            title={signer.source === 'usb' || signer.source === 'virtual' ? 'Checking signer identity' : 'Checking saved signer record'}
            detail={signer.source === 'usb' || signer.source === 'virtual' ? 'Keep the signer connected and unlocked while Satchel matches its saved fingerprint.' : 'Satchel is validating the saved public record; physical device presence is not checked.'}
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
