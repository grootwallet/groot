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

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.send-signers):where(.send-signers) {
    margin: 0 0 14px;
    padding: 11px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-inset);
  }
  :global(.send-signers.loading):where(.send-signers) {
    position: relative;
    overflow: hidden;
  }
  :global(.send-signers.loading::after):where(.send-signers) {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    transform: translateX(-100%);
    background: linear-gradient(
      90deg,
      transparent 0%,
      color-mix(in srgb, var(--text) 12%, transparent) 48%,
      transparent 100%
    );
    animation: skeleton-shimmer 1.15s linear infinite;
  }
  :global(.send-signers):where(.send-signers) > :global(header) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }
  :global(.send-signers):where(.send-signers) > :global(header div) {
    display: flex;
    align-items: baseline;
    gap: 7px;
  }
  :global(.send-signers):where(.send-signers) > :global(header span),
  :global(.send-signers):where(.send-signers) > :global(header small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.send-signers):where(.send-signers) > :global(header strong) {
    font-size: var(--font-size-meta);
  }
  :global(.send-signer-list):where(.send-signer-list) {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 6px;
  }
  :global(.send-signer-list):where(.send-signer-list) :global(article) {
    position: relative;
    min-width: 0;
    padding: 7px 8px;
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--panel);
  }
  :global(.send-signer-list):where(.send-signer-list) :global(article.send-signer-placeholder) {
    min-height: 44px;
    color: var(--muted);
  }
  :global(.send-signer-list):where(.send-signer-list) :global(article.discardable) {
    grid-template-columns: 28px minmax(0, 1fr) 28px;
  }
  :global(.send-signer-list):where(.send-signer-list) :global(article.signed) {
    border-color: color-mix(in srgb, var(--success) 28%, var(--border));
    background: color-mix(in srgb, var(--success) 5%, var(--panel));
  }
  :global(.send-signer-icon):where(.send-signer-icon) {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-control);
    color: var(--muted);
    background: var(--surface-icon);
  }
  :global(.send-signer-list):where(.send-signer-list) :global(article.signed .send-signer-icon) {
    color: var(--success);
    background: color-mix(in srgb, var(--success) 11%, var(--surface-icon));
  }
  :global(.send-signer-list):where(.send-signer-list) :global(article > div) {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  :global(.send-signer-list):where(.send-signer-list) :global(article strong) {
    overflow: hidden;
    font-size: var(--font-size-meta);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.send-signer-list):where(.send-signer-list) :global(article small) {
    overflow: hidden;
    color: var(--muted);
    font-size: var(--font-size-meta);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.send-signer-list):where(.send-signer-list) :global(code) {
    color: var(--text-soft);
    font-size: inherit;
  }
  :global(.discard-signer-signature):where(.discard-signer-signature) {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border: 1px solid transparent;
    border-radius: var(--radius-control);
    color: var(--muted);
    background: transparent;
    cursor: pointer;
    opacity: 0.64;
    transition:
      opacity 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease,
      background 0.15s ease;
  }
  :global(.discard-signer-signature:hover):where(.discard-signer-signature),
  :global(.discard-signer-signature:focus-visible):where(.discard-signer-signature) {
    opacity: 1;
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 25%, var(--border));
    background: color-mix(in srgb, var(--danger) 7%, var(--panel));
    outline: none;
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.send-signers.loading::after):where(.send-signers) {
      display: none;
    }
  }

  @media (max-width: 760px) {
    :global(.send-signers):where(.send-signers) {
      padding: 10px;
    }
    :global(.send-signers):where(.send-signers) > :global(header) {
      margin-bottom: 7px;
    }
    :global(.send-signer-list):where(.send-signer-list) {
      display: flex;
      overflow-x: auto;
      overscroll-behavior-inline: contain;
      scrollbar-width: none;
      scroll-snap-type: x proximity;
    }
    :global(.send-signer-list::-webkit-scrollbar):where(.send-signer-list) {
      display: none;
    }
    :global(.send-signer-list):where(.send-signer-list) :global(article) {
      flex: 0 0 156px;
      scroll-snap-align: start;
    }
    :global(.send-signer-list):where(.send-signer-list) :global(article:only-child) {
      flex-basis: 100%;
    }
  }
</style>
