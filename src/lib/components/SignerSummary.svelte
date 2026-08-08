<script lang="ts">
  import { Check, Cpu, KeyRound } from '@lucide/svelte';

  type SignerItem = {
    label: string;
    fingerprint?: string | null;
    detail: string;
    software?: boolean;
  };

  let { signers, required = 1, signedFingerprints = [], collecting = false } = $props<{
    signers: SignerItem[];
    required?: number;
    signedFingerprints?: string[];
    collecting?: boolean;
  }>();

  const shortenedFingerprint = (value?: string | null) => value ? value.toLowerCase().slice(0, 8) : 'Not recorded';
  const signedCount = $derived(signers.filter((signer: SignerItem) => signer.fingerprint && signedFingerprints.includes(signer.fingerprint)).length);
</script>

<section class="send-signers" aria-label="Payment signers">
  <header><div><span>Signing with</span><strong>{required} of {signers.length}</strong></div><small>{collecting ? `${signedCount} of ${required} collected` : required === 1 ? 'One signature required' : `${required} signatures required`}</small></header>
  <div class="send-signer-list">
    {#each signers as signer}
      {@const signed = Boolean(signer.fingerprint && signedFingerprints.includes(signer.fingerprint))}
      <article class:signed>
        <span class="send-signer-icon">{#if signed}<Check size={15} strokeWidth={2.5} />{:else if signer.software}<KeyRound size={15} />{:else}<Cpu size={15} />{/if}</span>
        <div><strong>{signer.label}</strong><small>{signer.detail}{#if signer.fingerprint} · <code>{shortenedFingerprint(signer.fingerprint)}</code>{/if}</small></div>
      </article>
    {/each}
  </div>
</section>
