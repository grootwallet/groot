<script lang="ts">
  import MarketingFooter from '$lib/components/MarketingFooter.svelte';
  import MarketingNav from '$lib/components/MarketingNav.svelte';
  import { subtleReveal } from '$lib/marketing/motion';

  const documents = [
    ['Product specification', 'Canonical wallet behavior, supported flows, invariants, and explicit exclusions.', 'product-spec.md'],
    ['Security model', 'Assets, trust boundaries, required controls, residual risk, and current release blockers.', 'security-model.md'],
    ['Architecture', 'The Svelte, Tauri, Rust, BDK, persistence, network, and hardware boundaries.', 'architecture.md'],
    ['Implementation status', 'Capability-by-capability separation of fixture, native implementation, evidence, and release state.', 'implementation-status.md'],
    ['Mainnet checklist', 'The evidence that must exist before mainnet can be enabled.', 'mainnet-release-checklist.md'],
    ['Roadmap', 'Work ordered by security dependency rather than marketing priority.', 'roadmap.md']
  ];
</script>

<svelte:head>
  <meta name="description" content="Canonical product, security, architecture, implementation, and release documentation for Groot." />
  <meta name="theme-color" content="#F7F3E9" />
  <meta property="og:title" content="Read the system" />
  <meta property="og:description" content="Product behavior, security boundaries, implementation evidence, and release blockers." />
  <meta property="og:image" content="/marketing/social-card.png" />
  <meta name="twitter:title" content="Read the system" />
  <meta name="twitter:description" content="Product behavior, security boundaries, implementation evidence, and release blockers." />
  <meta name="twitter:image" content="/marketing/social-card.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="manifest" href="/site.webmanifest" />
</svelte:head>

<div class="marketing-surface">
  <a class="marketing-skip" href="#content">Skip to content</a>
  <MarketingNav />
  <main id="content">
    <header class="inner-hero">
      <div class="marketing-shell inner-hero-grid" in:subtleReveal>
        <p class="inner-kicker">Documentation</p>
        <div>
          <h1>Read the system.</h1>
          <p class="lede">The product, security model, architecture, evidence, and release gates are documented separately so a claim cannot quietly outrun its implementation.</p>
          <div class="release-strip"><span>Canonical documents</span><span>Versioned with the code</span><span>Claims tied to evidence</span></div>
        </div>
      </div>
    </header>

    <section class="docs-section" aria-labelledby="docs-heading">
      <div class="marketing-shell docs-grid">
        <div>
          <p class="inner-kicker">Source of truth</p>
          <h2 id="docs-heading">Start with what you need to verify.</h2>
        </div>
        <ol>
          {#each documents as document, index}
            <li>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div><h3>{document[0]}</h3><p>{document[1]}</p></div>
              <code>docs/{document[2]}</code>
            </li>
          {/each}
        </ol>
      </div>
    </section>

    <section class="reading-order" aria-labelledby="order-heading">
      <div class="marketing-shell marketing-section-grid">
        <p class="inner-kicker">Reading order</p>
        <div>
          <h2 id="order-heading">Behavior. Boundary. Evidence.</h2>
          <div class="order-steps">
            <article><span>01</span><h3>What should happen?</h3><p>Use the product specification for the promised behavior and explicit exclusions.</p></article>
            <article><span>02</span><h3>Where is trust placed?</h3><p>Use the security model and architecture for secret, persistence, hardware, and network boundaries.</p></article>
            <article><span>03</span><h3>What is proven today?</h3><p>Use implementation status and the release checklist before treating a capability as ready.</p></article>
          </div>
        </div>
      </div>
    </section>
  </main>
  <MarketingFooter />
</div>

<style>
  .docs-section { padding-block: clamp(80px, 10vw, 116px); border-bottom: 1px solid var(--marketing-line); }
  .docs-grid { display: grid; grid-template-columns: minmax(250px, .85fr) minmax(0, 1.55fr); gap: 80px; }
  .docs-grid h2 { max-width: 500px; margin-top: 24px; font-size: clamp(44px, 5.8vw, 70px); line-height: 1; letter-spacing: -.035em; }
  .docs-grid ol { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--marketing-line); }
  .docs-grid li { min-height: 130px; padding: 24px 0; display: grid; grid-template-columns: 48px minmax(0, 1fr) minmax(150px, auto); gap: 18px; align-items: start; border-bottom: 1px solid var(--marketing-line); }
  .docs-grid li > span { padding-top: 5px; color: var(--marketing-red); font-size: 11px; letter-spacing: .12em; }
  .docs-grid h3 { font-size: 28px; line-height: 1.08; }
  .docs-grid li p { max-width: 570px; margin-top: 10px; color: rgba(16, 42, 76, .72); font-size: 16px; line-height: 1.48; }
  .docs-grid li code { padding-top: 5px; color: rgba(16, 42, 76, .6); font-size: 11px; line-height: 1.45; overflow-wrap: anywhere; }
  .reading-order { padding-block: clamp(80px, 10vw, 116px); color: var(--marketing-ivory); background: var(--marketing-ink); }
  .reading-order h2 { max-width: 760px; font-size: clamp(48px, 6.5vw, 80px); line-height: .98; letter-spacing: -.04em; }
  .order-steps { margin-top: 60px; display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid rgba(247, 243, 233, .3); border-bottom: 1px solid rgba(247, 243, 233, .3); }
  .order-steps article { min-height: 270px; padding: 26px; border-right: 1px solid rgba(247, 243, 233, .3); }
  .order-steps article:last-child { border-right: 0; }
  .order-steps span { color: var(--marketing-red); font-size: 11px; }
  .order-steps h3 { margin-top: 70px; font-size: 29px; line-height: 1.08; }
  .order-steps p { margin-top: 15px; color: rgba(247, 243, 233, .72); font-size: 15px; line-height: 1.5; }
  @media (max-width: 820px) {
    .docs-grid { grid-template-columns: 1fr; gap: 46px; }
    .order-steps { grid-template-columns: 1fr; }
    .order-steps article { min-height: 210px; border-right: 0; border-bottom: 1px solid rgba(247, 243, 233, .3); }
    .order-steps article:last-child { border-bottom: 0; }
    .order-steps h3 { margin-top: 42px; }
  }
  @media (max-width: 480px) {
    .docs-grid li { grid-template-columns: 32px minmax(0, 1fr); }
    .docs-grid li code { grid-column: 2; }
  }
</style>
