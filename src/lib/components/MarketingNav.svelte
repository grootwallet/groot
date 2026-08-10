<script lang="ts">
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import BrandLockup from './BrandLockup.svelte';

  let { reversed = false, overlay = false }: { reversed?: boolean; overlay?: boolean } = $props();
  let hidden = $state(false);
  let scrolled = $state(false);
  let menuOpen = $state(false);
  let activeSection = $state<'product' | 'principles' | null>(null);

  function active(key: 'product' | 'principles' | 'security' | 'docs' | 'status') {
    const path = page.url.pathname.replace(/\/$/, '') || '/';
    if (path === '/marketing') {
      if (key === 'product' || key === 'principles') return activeSection ? activeSection === key : page.url.hash === `#${key}`;
      return false;
    }
    return path === `/marketing/${key}`;
  }

  onMount(() => {
    let lastY = window.scrollY;
    let frame = 0;
    let allowHide = false;
    const readyTimer = window.setTimeout(() => { allowHide = true; }, 900);
    const update = () => {
      frame = 0;
      const nextY = window.scrollY;
      const delta = nextY - lastY;
      scrolled = nextY > 12;

      if (!allowHide || nextY < 88 || menuOpen) hidden = false;
      else if (delta > 2) hidden = true;
      else if (delta < -2) hidden = false;

      if (hidden) menuOpen = false;
      lastY = nextY;
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    window.addEventListener('scroll', onScroll, { passive: true });

    const sections = ['product', 'principles']
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));
    const sectionObserver = sections.length
      ? new IntersectionObserver(
          (entries) => {
            const visible = entries
              .filter((entry) => entry.isIntersecting)
              .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
            if (visible?.target.id === 'product' || visible?.target.id === 'principles') activeSection = visible.target.id;
          },
          { rootMargin: '-28% 0px -56% 0px', threshold: [0.01, 0.2, 0.5] }
        )
      : null;
    sections.forEach((section) => sectionObserver?.observe(section));

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(readyTimer);
      if (frame) window.cancelAnimationFrame(frame);
      sectionObserver?.disconnect();
    };
  });
</script>

{#if !overlay}<div class="nav-slot" aria-hidden="true"></div>{/if}
<nav class:reversed class:scrolled class:hidden class="marketing-nav" aria-label="Primary navigation">
  <div class="nav-inner">
    <a class="mark-link" href="/marketing" aria-label="Groot marketing home"><BrandLockup variant={reversed && !scrolled ? 'reversed' : 'ink'} /></a>

    <div class="desktop-links">
      <a class:active={active('product')} aria-current={active('product') ? 'page' : undefined} href="/marketing/#product">Product</a>
      <a class:active={active('principles')} aria-current={active('principles') ? 'page' : undefined} href="/marketing/#principles">Principles</a>
      <a class:active={active('security')} aria-current={active('security') ? 'page' : undefined} href="/marketing/security">Security</a>
      <a class:active={active('docs')} aria-current={active('docs') ? 'page' : undefined} href="/marketing/docs">Documentation</a>
      <a class:active={active('status')} aria-current={active('status') ? 'page' : undefined} class="nav-action" href="/marketing/status">Development status</a>
    </div>

    <details class="mobile-menu" bind:open={menuOpen}>
      <summary aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}>{menuOpen ? 'Close' : 'Menu'}</summary>
      <div>
        <a class:active={active('product')} aria-current={active('product') ? 'page' : undefined} href="/marketing/#product">Product</a>
        <a class:active={active('principles')} aria-current={active('principles') ? 'page' : undefined} href="/marketing/#principles">Principles</a>
        <a class:active={active('security')} aria-current={active('security') ? 'page' : undefined} href="/marketing/security">Security model</a>
        <a class:active={active('docs')} aria-current={active('docs') ? 'page' : undefined} href="/marketing/docs">Documentation</a>
        <a class:active={active('status')} aria-current={active('status') ? 'page' : undefined} href="/marketing/status">Development status</a>
      </div>
    </details>
  </div>
</nav>

<style>
  .nav-slot { height: 84px; }
  .marketing-nav { --active-color: #2459a9; position: fixed; z-index: 1000; isolation: isolate; inset: 0 0 auto; min-height: 84px; color: #102a4c; background: #f7f3e9; border-bottom: 1px solid rgba(16, 42, 76, 0.2); transform: translate3d(0, 0, 0); will-change: transform; transition: transform 260ms cubic-bezier(.22, 1, .36, 1), background-color 180ms ease, color 180ms ease, border-color 180ms ease, box-shadow 180ms ease; animation: nav-enter 420ms cubic-bezier(.22, 1, .36, 1) both; font-family: 'Source Sans 3', ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .marketing-nav.scrolled { background: rgba(247, 243, 233, 0.66); border-bottom-color: rgba(16, 42, 76, 0.16); box-shadow: 0 8px 28px rgba(4, 16, 30, 0.06); -webkit-backdrop-filter: blur(12px) saturate(110%); backdrop-filter: blur(12px) saturate(110%); }
  .marketing-nav.hidden { transform: translate3d(0, calc(-100% - 2px), 0); }
  .marketing-nav.reversed:not(.scrolled) { --active-color: #f7f3e9; color: #f7f3e9; background: transparent; border-bottom-color: rgba(247, 243, 233, 0.38); }
  .nav-inner { width: min(calc(100% - 48px), 1160px); min-height: 84px; margin-inline: auto; display: flex; align-items: center; justify-content: space-between; gap: 32px; }
  a { color: inherit; text-decoration: none; }
  a:focus-visible, summary:focus-visible { outline: 2px solid currentColor; outline-offset: 4px; }
  .mark-link { width: 116px; min-height: 44px; display: inline-flex; align-items: center; }
  .desktop-links { display: flex; align-items: center; gap: clamp(16px, 2.15vw, 28px); font-size: 14px; }
  .desktop-links a { position: relative; min-height: 44px; display: inline-flex; align-items: center; transition: opacity 180ms ease, color 180ms ease; }
  .desktop-links a:hover { opacity: 0.7; }
  .desktop-links a.active { color: var(--active-color); font-weight: 700; opacity: 1; }
  .desktop-links a.active::after { content: ''; position: absolute; right: 0; bottom: 4px; left: 0; height: 2px; background: currentColor; }
  .mobile-menu { display: none; position: relative; }
  .mobile-menu summary { min-width: 64px; min-height: 44px; display: inline-flex; align-items: center; justify-content: flex-end; cursor: pointer; list-style: none; font-size: 14px; }
  .mobile-menu summary::-webkit-details-marker { display: none; }
  .mobile-menu > div { position: absolute; z-index: 10; top: 52px; right: 0; width: min(300px, calc(100vw - 32px)); padding: 10px; color: #102a4c; background: #f7f3e9; border: 1px solid rgba(16, 42, 76, 0.24); box-shadow: 0 16px 36px rgba(4, 16, 30, 0.18); animation: menu-enter 180ms cubic-bezier(.22, 1, .36, 1) both; }
  .mobile-menu a { min-height: 48px; padding: 0 12px; display: flex; align-items: center; border-left: 3px solid transparent; border-bottom: 1px solid rgba(16, 42, 76, 0.14); }
  .mobile-menu a:last-child { border-bottom: 0; }
  .mobile-menu a.active { color: #2459a9; background: rgba(36, 89, 169, 0.07); border-left-color: #d3293a; font-weight: 700; }

  @keyframes nav-enter { from { opacity: 0; } to { opacity: 1; } }
  @keyframes menu-enter { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }

  @media (max-width: 980px) {
    .desktop-links { display: none; }
    .mobile-menu { display: block; }
  }

  @media (max-width: 760px) {
    .nav-slot { height: 68px; }
    .marketing-nav, .nav-inner { min-height: 68px; }
    .nav-inner { width: min(calc(100% - 32px), 1160px); }
  }

  @media (prefers-reduced-motion: reduce) {
    .marketing-nav, .desktop-links a, .mobile-menu > div { animation: none; transition: none; }
  }
</style>
