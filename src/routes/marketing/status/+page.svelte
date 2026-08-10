<script lang="ts">
  import MarketingFooter from '$lib/components/MarketingFooter.svelte';
  import MarketingNav from '$lib/components/MarketingNav.svelte';
  import { subtleReveal } from '$lib/marketing/motion';

  const working = [
    ['Single-key wallet', 'Create, recover, receive, label, select coins, review, sign, broadcast, and rescan on regtest.'],
    ['Descriptor multisig', 'Standard BIP48 sortedmulti policies, persistent PSBT proposals, signature collection, and descriptor recovery drills.'],
    ['Hardware boundary', 'HWI enumeration, fingerprint matching, signing, and device-address comparison are integration-ready.'],
    ['Bitcoin Core', 'Per-wallet local, direct HTTPS, or Tor-onion Core configuration with no silent backend or fee fallback.'],
    ['Interchange', 'Public BSMS descriptor records plus bounded PSBT file, text, and UR v2 exchange.'],
    ['Multiple wallets', 'Isolated wallet profiles, databases, credentials, sessions, node configuration, and deletion.']
  ];

  const blockers = [
    ['Hardware matrix', 'Testnet4 evidence across Coldcard, Trezor, Ledger, BitBox02, and Jade with real devices and firmware records.'],
    ['Platform hardening', 'Mobile lifecycle, physical camera flows, and Android and Windows secure-storage certification.'],
    ['Recovery evidence', 'Large-history progress, extended-gap recovery, and independent descriptor-wallet round trips.'],
    ['Network evidence', 'Real remote Bitcoin Core deployments over TLS and Tor, including failure and privacy tests.'],
    ['Release evidence', 'Matching clean-build hashes, signed and notarized packages, SBOM and provenance, and independent review.']
  ];
</script>

<svelte:head>
  <meta name="description" content="What works in Groot today, what evidence exists, and what still blocks mainnet." />
  <meta name="theme-color" content="#F7F3E9" />
  <meta property="og:title" content="Built on regtest. Not ready for mainnet." />
  <meta property="og:description" content="A plain development ledger for the Bitcoin self-custody wallet." />
  <meta property="og:image" content="/marketing/social-card.png" />
  <meta name="twitter:title" content="Built on regtest. Not ready for mainnet." />
  <meta name="twitter:description" content="A plain development ledger for the Bitcoin self-custody wallet." />
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
        <p class="inner-kicker">Development status</p>
        <div>
          <h1>Built on regtest. Not ready for mainnet.</h1>
          <p class="lede">Much of the wallet is implemented through the real Rust and Tauri boundary. Physical certification, release provenance, platform hardening, and independent review still stand between this build and real funds.</p>
          <div class="release-strip"><span>Rust/Tauri implementation</span><span>Automated evidence tracked</span><span>Mainnet gate locked in CI</span></div>
        </div>
      </div>
    </header>

    <section class="status-section" aria-labelledby="working-heading">
      <div class="marketing-shell status-grid">
        <div>
          <p class="inner-kicker">Working now</p>
          <h2 id="working-heading">Implemented for test networks.</h2>
          <p>“Implemented” means the capability crosses the real native boundary. It does not mean every device, platform, or failure mode is certified.</p>
        </div>
        <div class="status-list">
          {#each working as item}
            <article><span>Implemented</span><h3>{item[0]}</h3><p>{item[1]}</p></article>
          {/each}
        </div>
      </div>
    </section>

    <section class="status-section blockers" aria-labelledby="blockers-heading">
      <div class="marketing-shell status-grid">
        <div>
          <p class="inner-kicker">Release blockers</p>
          <h2 id="blockers-heading">Evidence before access.</h2>
          <p>Mainnet remains compile-time disabled until every required artifact is reviewed and the dedicated release gate is replaced deliberately.</p>
        </div>
        <div class="status-list">
          {#each blockers as item}
            <article><span>Open</span><h3>{item[0]}</h3><p>{item[1]}</p></article>
          {/each}
        </div>
      </div>
    </section>

    <section class="source-band">
      <div class="marketing-shell">
        <p class="inner-kicker">Source of truth</p>
        <h2>The ledger is public and specific.</h2>
        <p>Every capability is separated into browser fixture, Rust/Tauri implementation, automated evidence, and release status. Canonical records remain versioned with the repository.</p>
        <div class="source-actions">
          <a href="/marketing/docs">Documentation map →</a>
          <a href="/marketing/security">Security model →</a>
        </div>
      </div>
    </section>
  </main>
  <MarketingFooter />
</div>

<style>
  .status-section { padding-block: clamp(80px, 10vw, 116px); border-bottom: 1px solid var(--marketing-line); }
  .status-grid { display: grid; grid-template-columns: minmax(280px, .9fr) minmax(0, 1.5fr); gap: 82px; align-items: start; }
  .status-grid > div:first-child { position: sticky; top: 30px; }
  .status-section h2 { margin-top: 24px; font-size: clamp(44px, 5.5vw, 68px); line-height: 1; letter-spacing: -0.035em; }
  .status-section .status-grid > div:first-child > p:last-child { max-width: 460px; margin-top: 24px; font-size: 17px; line-height: 1.52; }
  .status-list { border-top: 1px solid var(--marketing-line); }
  .status-list article { padding: 28px 0; display: grid; grid-template-columns: 110px minmax(180px, .75fr) minmax(260px, 1.2fr); gap: 24px; border-bottom: 1px solid var(--marketing-line); }
  .status-list span { padding-top: 5px; color: #23704d; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; font-weight: 600; }
  .status-list h3 { font-size: 27px; line-height: 1.08; }
  .status-list p { color: rgba(16, 42, 76, .74); font-size: 16px; line-height: 1.5; }
  .blockers { color: var(--marketing-ivory); background: var(--marketing-ink); }
  .blockers .status-list, .blockers .status-list article { border-color: rgba(247, 243, 233, .3); }
  .blockers .status-list span { color: #ef8490; }
  .blockers .status-list p { color: rgba(247, 243, 233, .72); }
  .source-band { padding-block: clamp(80px, 10vw, 116px); }
  .source-band h2 { max-width: 850px; margin-top: 24px; font-size: clamp(48px, 7vw, 84px); line-height: .98; letter-spacing: -.04em; }
  .source-band > div > p:not(.inner-kicker) { max-width: 620px; margin-top: 26px; font-size: 18px; line-height: 1.5; }
  .source-actions { margin-top: 38px; display: flex; flex-wrap: wrap; gap: 18px 32px; }
  .source-actions a { min-height: 44px; display: inline-flex; align-items: center; color: inherit; text-underline-offset: 4px; }
  @media (max-width: 1120px) {
    .status-grid { grid-template-columns: 1fr; gap: 44px; }
    .status-grid > div:first-child { position: static; }
  }
  @media (max-width: 600px) {
    .status-list article { grid-template-columns: 1fr; gap: 10px; }
    .status-list span { padding-top: 0; }
  }
</style>
