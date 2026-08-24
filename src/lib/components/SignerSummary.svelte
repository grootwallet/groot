<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { Check, Cpu, KeyRound, X } from '@lucide/svelte';

  type SignerItem = {
    label: string;
    fingerprint?: string | null;
    detail: string;
    software?: boolean;
  };

  let {
    signers,
    required = 1,
    signedFingerprints = [],
    collecting = false,
    loading = false,
    ondiscard
  } = $props<{
    signers: SignerItem[];
    required?: number;
    signedFingerprints?: string[];
    collecting?: boolean;
    loading?: boolean;
    ondiscard?: (signer: SignerItem) => void;
  }>();

  const shortenedFingerprint = (value?: string | null) =>
    value ? value.toLowerCase().slice(0, 8) : translate($locale, 'Not recorded');
  const signedCount = $derived(
    signers.filter(
      (signer: SignerItem) => signer.fingerprint && signedFingerprints.includes(signer.fingerprint)
    ).length
  );
</script>

<section
  class="send-signers"
  class:loading
  aria-label={translate($locale, 'Payment signers')}
  aria-busy={loading}
>
  <header>
    <div>
      <span>{translate($locale, 'Signing with')}</span><strong
        >{loading
          ? translate($locale, 'Checking…')
          : translate($locale, '{required} of {total}', {
              required,
              total: signers.length
            })}</strong
      >
    </div>
    <small
      >{translate(
        $locale,
        loading
          ? translate($locale, 'Loading wallet signer')
          : collecting
            ? translate($locale, '{signed} of {required} collected', {
                signed: signedCount,
                required
              })
            : required === 1
              ? 'One signature required'
              : `${required} signatures required`
      )}</small
    >
  </header>
  <div class="send-signer-list">
    {#if loading}
      <article class="send-signer-placeholder" aria-hidden="true">
        <span class="send-signer-icon"><Cpu size={15} /></span>
        <div>
          <strong>{translate($locale, 'Loading signer')}</strong><small
            >{translate($locale, 'Checking wallet identity…')}</small
          >
        </div>
      </article>
    {:else}
      {#each signers as signer}
        {@const signed = Boolean(
          signer.fingerprint && signedFingerprints.includes(signer.fingerprint)
        )}
        <article class:signed class:discardable={signed && Boolean(ondiscard)}>
          <span class="send-signer-icon"
            >{#if signed}<Check size={15} strokeWidth={2.5} />{:else if signer.software}<KeyRound
                size={15}
              />{:else}<Cpu size={15} />{/if}</span
          >
          <div>
            <strong>{signer.label}</strong><small
              >{translate($locale, signer.detail)}{#if signer.fingerprint}{' · '}<code
                  >{shortenedFingerprint(signer.fingerprint)}</code
                >{/if}</small
            >
          </div>
          {#if signed && ondiscard}<button
              type="button"
              class="discard-signer-signature"
              aria-label={translate($locale, 'Discard {signer} local signature', {
                signer: signer.label
              })}
              title={translate($locale, 'Discard local signature')}
              onclick={() => ondiscard?.(signer)}><X size={14} /></button
            >{/if}
        </article>
      {/each}
    {/if}
  </div>
</section>
