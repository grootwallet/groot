<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { ArrowRight, Clock3, Trash2 } from '@lucide/svelte';
  import Button from './Button.svelte';

  let {
    title,
    detail,
    href,
    locked = false,
    ondiscard
  }: {
    title: string;
    detail: string;
    href: string;
    locked?: boolean;
    ondiscard?: () => void;
  } = $props();
</script>

<section
  class="resume-setup-notice"
  class:locked
  role="status"
  aria-label={translate($locale, 'Unfinished wallet setup')}
>
  <span class="resume-setup-icon" aria-hidden="true"><Clock3 size={18} /></span>
  <span class="resume-setup-copy">
    <small>{translate($locale, 'UNFINISHED WALLET')}</small>
    <strong>{title}</strong>
    <span>{detail}</span>
  </span>
  <span class="resume-setup-actions">
    {#if ondiscard}<Button variant="danger-outline" size="small" onclick={ondiscard}
        ><Trash2 size={14} />{translate($locale, 'Discard')}</Button
      >{/if}
    <Button variant="secondary" size="small" {href}
      >{translate($locale, 'Resume setup')}<ArrowRight size={15} /></Button
    >
  </span>
</section>

<style>
  .resume-setup-notice {
    min-height: 66px;
    margin: 18px 32px -8px;
    padding: 11px 13px;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    align-items: center;
    gap: 11px;
    border: 1px solid color-mix(in srgb, var(--accent) 34%, var(--border));
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--accent-soft) 72%, var(--panel));
  }
  .resume-setup-icon {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-control);
    color: var(--accent);
    background: var(--surface-control);
  }
  .resume-setup-copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .resume-setup-copy small {
    color: var(--accent);
    font-size: var(--font-size-meta);
    font-weight: 750;
    letter-spacing: 0.08em;
  }
  .resume-setup-copy strong {
    overflow: hidden;
    color: var(--text);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .resume-setup-copy > span {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  .resume-setup-notice.locked {
    position: fixed;
    z-index: 70;
    top: var(--locked-setup-notice-top, 18px);
    right: var(--locked-setup-notice-right, 32px);
    left: var(--locked-setup-notice-left, 256px);
    margin: 0;
  }
  .resume-setup-actions {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .resume-setup-actions :global(.button) {
    font-size: var(--font-size-meta);
    font-weight: 650;
  }

  @media (max-width: 760px) {
    .resume-setup-notice {
      margin: max(76px, calc(env(safe-area-inset-top) + 64px)) 18px -62px;
      grid-template-columns: 30px minmax(0, 1fr);
      gap: 9px;
    }
    .resume-setup-icon {
      width: 29px;
      height: 29px;
    }
    .resume-setup-actions {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: auto 1fr;
    }
    .resume-setup-actions :global(a.button) {
      width: 100%;
    }
  }
</style>
