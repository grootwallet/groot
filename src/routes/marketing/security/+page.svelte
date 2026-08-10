<script lang="ts">
  import MarketingFooter from '$lib/components/MarketingFooter.svelte';
  import MarketingNav from '$lib/components/MarketingNav.svelte';
  import { subtleReveal } from '$lib/marketing/motion';

  const boundaries = [
    {
      number: '01',
      title: 'Secrets stay native.',
      body: 'The webview never receives a generated mnemonic, seed, private descriptor, extended private key, or decrypted signing material. Rust creates software-wallet entropy with the operating system CSPRNG and presents recovery words through a native sheet.'
    },
    {
      number: '02',
      title: 'Storage needs two keys.',
      body: 'The mnemonic is held in an authenticated encrypted envelope. Opening it requires both the key derived from the wallet credential and a device-bound wrapping key; copying the wallet directory is not enough.'
    },
    {
      number: '03',
      title: 'The PSBT is the record.',
      body: 'Review data comes from the persisted unsigned transaction. Rust checks inputs, fees, recipient, change, wallet ownership, and proposal identity again before signing, merging, finalizing, or broadcasting.'
    },
    {
      number: '04',
      title: 'Hardware identity is checked.',
      body: 'USB operations reopen the exact signer by its validated fingerprint. Imported signatures must add valid policy signatures to the same transaction; changed or unrelated PSBTs fail closed.'
    },
    {
      number: '05',
      title: 'Your node defines the network edge.',
      body: 'Wallet balances and transaction history come from the Bitcoin Core node selected for that wallet. Remote Core requires HTTPS, or an onion service through an explicit loopback Tor proxy. There is no silent public fallback.'
    }
  ];
</script>

<svelte:head>
  <meta name="description" content="The key, transaction, storage, hardware, and Bitcoin network boundaries behind Groot." />
  <meta name="theme-color" content="#F7F3E9" />
  <meta property="og:title" content="Security starts at the boundary" />
  <meta property="og:description" content="The concrete trust boundaries behind a Bitcoin self-custody wallet." />
  <meta property="og:image" content="/marketing/social-card.png" />
  <meta name="twitter:title" content="Security starts at the boundary" />
  <meta name="twitter:description" content="The concrete trust boundaries behind a Bitcoin self-custody wallet." />
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
        <p class="inner-kicker">Security model</p>
        <div>
          <h1>Trust the smallest possible boundary.</h1>
          <p class="lede">The interface is not the wallet core. Keys, policy, transaction truth, persistence, and broadcast stay behind a typed native boundary.</p>
          <div class="release-strip"><span>Test-network implementation</span><span>Mainnet disabled</span><span>External review pending</span></div>
        </div>
      </div>
    </header>

    <section class="marketing-section" aria-labelledby="flow-heading">
      <div class="marketing-shell marketing-section-grid">
        <p class="inner-kicker">Trust map</p>
        <div>
          <h2 id="flow-heading">Public interface. Native authority.</h2>
          <p class="section-intro">Svelte displays public wallet data and collects intent. A typed Tauri boundary carries that intent into Rust, where BDK, Miniscript, SQLite, Bitcoin Core RPC, and HWI sit behind narrow adapters.</p>
          <ol class="trust-flow" aria-label="Wallet trust boundary">
            <li><span>Public</span><strong>SvelteKit interface</strong><small>Presentation and intent</small></li>
            <li><span>Typed</span><strong>WalletPort + Tauri IPC</strong><small>Explicit operations and stable errors</small></li>
            <li><span>Trusted</span><strong>Rust wallet core</strong><small>Keys, descriptors, PSBTs, persistence</small></li>
            <li><span>External</span><strong>Core + hardware signers</strong><small>Adversarial data, verified identities</small></li>
          </ol>
        </div>
      </div>
    </section>

    <section class="boundary-section" aria-labelledby="boundary-heading">
      <div class="marketing-shell">
        <div class="boundary-heading">
          <p class="inner-kicker">Controls</p>
          <h2 id="boundary-heading">Mechanisms, not reassurance.</h2>
        </div>
        <div class="boundary-list">
          {#each boundaries as boundary}
            <article>
              <span>{boundary.number}</span>
              <h3>{boundary.title}</h3>
              <p>{boundary.body}</p>
            </article>
          {/each}
        </div>
      </div>
    </section>

    <section class="limits" aria-labelledby="limits-heading">
      <div class="marketing-shell marketing-section-grid">
        <p class="inner-kicker">Current limits</p>
        <div>
          <h2 id="limits-heading">What is not proven yet.</h2>
          <ul>
            <li>Physical hardware and camera certification is incomplete.</li>
            <li>Android and Windows secure-storage certification remains open.</li>
            <li>Remote TLS and Tor deployments still require real-environment evidence.</li>
            <li>The desktop package is not yet reproducibility-certified, signed, or notarized.</li>
            <li>Mainnet remains compile-time disabled pending independent review and the complete release checklist.</li>
          </ul>
          <a class="document-link" href="/marketing/docs">Find the canonical security model →</a>
        </div>
      </div>
    </section>
  </main>

  <MarketingFooter />
</div>

<style>
  .trust-flow { margin: 52px 0 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); list-style: none; border: 1px solid var(--marketing-line); }
  .trust-flow li { min-height: 180px; padding: 22px; display: flex; flex-direction: column; border-right: 1px solid var(--marketing-line); }
  .trust-flow li:last-child { border-right: 0; }
  .trust-flow span { color: var(--marketing-red); font-size: 11px; letter-spacing: 0.13em; text-transform: uppercase; }
  .trust-flow strong { margin-top: auto; font-family: 'Source Serif 4', Georgia, serif; font-size: 24px; line-height: 1.1; font-weight: 400; }
  .trust-flow small { margin-top: 10px; color: rgba(16, 42, 76, 0.66); font-size: 12px; line-height: 1.4; }
  .boundary-section { padding-block: clamp(80px, 10vw, 116px); color: var(--marketing-ivory); background: var(--marketing-ink); }
  .boundary-heading { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(0, 2.2fr); gap: 64px; }
  .boundary-heading h2 { max-width: 760px; font-size: clamp(48px, 6.5vw, 80px); line-height: 0.98; letter-spacing: -0.04em; }
  .boundary-list { margin-top: 72px; border-top: 1px solid rgba(247, 243, 233, 0.3); }
  .boundary-list article { min-height: 160px; padding-block: 32px; display: grid; grid-template-columns: 70px minmax(240px, .9fr) minmax(300px, 1.2fr); gap: 30px; border-bottom: 1px solid rgba(247, 243, 233, 0.3); }
  .boundary-list article > span { padding-top: 4px; color: var(--marketing-red); font-size: 12px; }
  .boundary-list h3 { font-size: clamp(27px, 3vw, 38px); line-height: 1.08; }
  .boundary-list p { max-width: 560px; color: rgba(247, 243, 233, 0.76); font-size: 17px; line-height: 1.55; }
  .limits { padding-block: clamp(80px, 10vw, 116px); }
  .limits h2 { max-width: 700px; font-size: clamp(44px, 6vw, 72px); line-height: 1; letter-spacing: -0.035em; }
  .limits ul { max-width: 720px; margin: 34px 0 0; padding: 0; list-style: none; border-top: 1px solid var(--marketing-line); }
  .limits li { padding: 18px 0 18px 28px; position: relative; border-bottom: 1px solid var(--marketing-line); font-size: 17px; line-height: 1.48; }
  .limits li::before { content: ''; position: absolute; left: 2px; top: 27px; width: 8px; height: 8px; border: 1px solid var(--marketing-red); }
  .document-link { min-height: 44px; margin-top: 30px; display: inline-flex; align-items: center; color: inherit; text-underline-offset: 4px; }
  @media (max-width: 900px) {
    .trust-flow { grid-template-columns: 1fr; }
    .trust-flow li { min-height: 140px; border-right: 0; border-bottom: 1px solid var(--marketing-line); }
    .trust-flow li:last-child { border-bottom: 0; }
    .boundary-heading { grid-template-columns: 1fr; gap: 30px; }
    .boundary-list article { min-height: 0; grid-template-columns: 32px minmax(0, 1fr); gap: 12px; }
    .boundary-list p { grid-column: 2; }
  }
</style>
