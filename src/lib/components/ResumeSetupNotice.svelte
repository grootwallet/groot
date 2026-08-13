<script lang="ts">
  import { ArrowRight, Clock3 } from '@lucide/svelte';

  let {
    title,
    detail,
    href
  }: {
    title: string;
    detail: string;
    href: string;
  } = $props();
</script>

<section class="resume-setup-notice" role="status" aria-label="Unfinished wallet setup">
  <span class="resume-setup-icon" aria-hidden="true"><Clock3 size={18}/></span>
  <span class="resume-setup-copy">
    <small>UNFINISHED WALLET</small>
    <strong>{title}</strong>
    <span>{detail}</span>
  </span>
  <a {href}>Resume setup<ArrowRight size={15}/></a>
</section>

<style>
  .resume-setup-notice { min-height: 66px; margin: 18px 32px -8px; padding: 11px 13px; display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 11px; border: 1px solid color-mix(in srgb, var(--accent) 34%, var(--border)); border-radius: 9px; background: color-mix(in srgb, var(--accent-soft) 72%, var(--panel)); }
  .resume-setup-icon { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 8px; color: var(--accent); background: var(--surface-control); }
  .resume-setup-copy { min-width: 0; display: grid; gap: 2px; }
  .resume-setup-copy small { color: var(--accent); font-size: 8px; font-weight: 750; letter-spacing: .08em; }
  .resume-setup-copy strong { overflow: hidden; color: var(--text); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .resume-setup-copy > span { color: var(--muted); font-size: 9px; }
  a { min-height: 34px; padding: 0 11px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid var(--border-strong); border-radius: 7px; color: var(--text); background: var(--surface-control); font-size: 10px; font-weight: 650; white-space: nowrap; }
  a:hover { background: var(--surface-hover); }

  @media (max-width: 760px) {
    .resume-setup-notice { margin: max(76px, calc(env(safe-area-inset-top) + 64px)) 18px -62px; grid-template-columns: 30px minmax(0, 1fr); gap: 9px; }
    .resume-setup-icon { width: 29px; height: 29px; }
    a { grid-column: 1 / -1; width: 100%; }
  }
</style>
