<script lang="ts">
  import { onMount } from 'svelte';
  import MarketingNav from '$lib/components/MarketingNav.svelte';
  import { subtleReveal } from '$lib/marketing/motion';

  let pageElement: HTMLDivElement;

  const proofs = [
    {
      index: '01',
      title: 'Protect bitcoin with multiple keys.',
      body: 'Create a standard 2-of-3 multisig wallet across independent hardware vendors. Inspect every public key and export the descriptor needed to recover without this app.',
      image: '/marketing/wallet-policy.png',
      mobileImage: '/marketing/wallet-policy-mobile.png',
      alt: 'Current wallet policy screen showing a two-of-three multisignature setup',
      detail: 'Current wallet UI · unchanged layout',
      evidence: 'Browser fixture · virtual test devices'
    },
    {
      index: '02',
      title: 'Know before you sign.',
      body: 'Before bitcoin moves, review the destination, amount, fee, selected coins, change, and signatures still required. The review comes from the actual unsigned transaction.',
      image: '/marketing/wallet-review.png',
      mobileImage: '/marketing/wallet-review-mobile.png',
      alt: 'Current wallet transaction review screen with disposable regtest data',
      detail: 'Current wallet UI · disposable data',
      evidence: 'Browser fixture · regtest transaction'
    },
    {
      index: '03',
      title: 'Recover anywhere.',
      body: 'Export a standard public descriptor, verify that it rebuilds the same wallet, and rehearse recovery before you need it. Your backup is not tied to this app.',
      image: '/marketing/wallet-backup.png',
      mobileImage: '/marketing/wallet-backup-mobile.png',
      alt: 'Current wallet backup and recovery drill screen',
      detail: 'Current wallet UI · public descriptor workflow',
      evidence: 'Browser fixture'
    },
    {
      index: '04',
      title: 'Use your own Bitcoin node.',
      body: 'Choose the Bitcoin Core node that provides wallet balances and transaction history. Remote access requires HTTPS or Tor, and the wallet never silently falls back to a public server.',
      image: '/marketing/wallet-settings.png',
      mobileImage: '/marketing/wallet-settings-mobile.png',
      alt: 'Current wallet settings screen showing Bitcoin Core connection controls',
      detail: 'Current wallet UI · disposable endpoint',
      evidence: 'Browser fixture · regtest'
    }
  ];

  const principles = [
    'Your keys remain your authority.',
    'Every security claim comes with evidence.',
    'Recovery works beyond this app.',
    'Privacy protects your security.',
    'Every dependency has an exit.'
  ];

  const securityLayers = [
    {
      index: '01',
      title: 'Keys stay out of the interface.',
      body: 'Mnemonic words, seeds, private descriptors, and decrypted signing material never enter the webview. Software-wallet secrets are created and used inside the native Rust boundary.'
    },
    {
      index: '02',
      title: 'Every transaction is checked in Rust.',
      body: 'Review data comes from the persisted unsigned transaction. Inputs, fees, recipient, change, and wallet-owned outputs are validated again before signing or broadcast.'
    },
    {
      index: '03',
      title: 'Recovery does not depend on this app.',
      body: 'Standard BIP84 and BIP48 descriptors, PSBTs, and BSMS records keep wallet policy portable across compatible Bitcoin tools.'
    },
    {
      index: '04',
      title: 'Your node is the network boundary.',
      body: 'Each wallet connects to a Bitcoin Core node you choose. Local connections stay on loopback; remote connections require HTTPS or an explicit Tor proxy. There is no silent public fallback.'
    }
  ];

  onMount(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    pageElement.classList.add('motion-ready');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );

    pageElement.querySelectorAll<HTMLElement>('[data-reveal]').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  });
</script>

<svelte:head>
  <meta name="description" content="Groot is a Bitcoin self-custody wallet built for verifiable signing and portable recovery." />
  <meta name="theme-color" content="#102a4c" />
  <meta property="og:title" content="Groot · Hold your own" />
  <meta property="og:description" content="Bitcoin self-custody, with proof at every step." />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="/marketing/social-card.png" />
  <meta name="twitter:title" content="Groot · Hold your own" />
  <meta name="twitter:description" content="Bitcoin self-custody, with proof at every step." />
  <meta name="twitter:image" content="/marketing/social-card.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="preload" as="image" href="/marketing/hero-mountain.jpg" fetchpriority="high" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="manifest" href="/site.webmanifest" />
</svelte:head>

<div class="marketing-page" bind:this={pageElement}>
  <a class="skip-link" href="#content">Skip to content</a>
  <MarketingNav reversed overlay />

  <header class="hero" id="top">
    <div class="hero-overlay" aria-hidden="true"></div>

    <div class="hero-content shell" in:subtleReveal={{ distance: 18 }}>
      <p class="kicker"><span aria-hidden="true"></span>Bitcoin. In your hands.</p>
      <h1>Hold your own.</h1>
      <p class="hero-copy">Hold bitcoin on your terms. Know exactly what you’re signing. Know you can recover without us.</p>
      <div class="actions">
        <a class="button primary" href="#product">See the product</a>
        <a class="text-link" href="#security">Read the security model</a>
      </div>
    </div>

    <div class="hero-footer shell">
      <span>Self-custody, with proof at every step.</span>
      <span>Test-network release. Mainnet is not enabled.</span>
    </div>
  </header>

  <main id="content">
    <section class="position" id="position" aria-labelledby="position-heading">
      <div class="shell position-grid" data-reveal>
        <p class="kicker ink"><span aria-hidden="true"></span>The position</p>
        <div>
          <h2 id="position-heading">Freedom needs structure.</h2>
          <p>Bitcoin lets you hold money without asking anyone’s permission. That freedom only works when the keys, spending rules, backups, and recovery plan are truly yours. This wallet makes each one visible, verifiable, and portable.</p>
        </div>
      </div>
    </section>

    <section class="proofs" id="product" aria-labelledby="proof-heading">
      <div class="shell proof-intro" data-reveal>
        <p class="kicker ink"><span aria-hidden="true"></span>Product proof</p>
        <h2 id="proof-heading">Your Bitcoin wallet should show its work.</h2>
      </div>

      {#each proofs as proof}
        <article class="proof">
          <div class="shell">
            <div class="proof-copy" data-reveal>
              <p class="proof-index">{proof.index}</p>
              <h3>{proof.title}</h3>
              <p>{proof.body}</p>
            </div>
            <figure data-reveal>
              <picture>
                <source media="(max-width: 760px)" srcset={proof.mobileImage} />
                <img src={proof.image} alt={proof.alt} width="1180" height="780" loading="lazy" />
              </picture>
              <figcaption><span>{proof.detail}</span><span>{proof.evidence}</span></figcaption>
            </figure>
          </div>
        </article>
      {/each}
    </section>

    <section class="security" id="security" aria-labelledby="security-heading">
      <div class="shell security-intro" data-reveal>
        <p class="kicker"><span aria-hidden="true"></span>Security architecture</p>
        <div>
          <h2 id="security-heading">Security starts at the boundary.</h2>
          <p>Critical decisions stay in the native wallet core. The interface asks, displays, and confirms. It does not hold the keys or invent transaction truth.</p>
        </div>
      </div>

      <div class="shell security-layers">
        {#each securityLayers as layer}
          <article data-reveal>
            <span>{layer.index}</span>
            <h3>{layer.title}</h3>
            <p>{layer.body}</p>
          </article>
        {/each}
      </div>

      <div class="shell stack" data-reveal>
        <p>Current stack</p>
        <ul aria-label="Wallet technology stack">
          <li>SvelteKit</li>
          <li>Tauri 2</li>
          <li>Rust</li>
          <li>BDK + Miniscript</li>
          <li>SQLite</li>
          <li>Bitcoin Core RPC</li>
          <li>HWI</li>
        </ul>
        <p class="stack-note">Test-network implementation. Physical-device and reproducible-release certification remain open.</p>
      </div>
    </section>

    <section class="principles" id="principles" aria-labelledby="principles-heading">
      <div class="shell principles-grid">
        <div data-reveal>
          <p class="kicker"><span aria-hidden="true"></span>Principles</p>
          <h2 id="principles-heading">Everything important is explicit.</h2>
        </div>
        <ol data-reveal>
          {#each principles as principle, index}
            <li><span>{String(index + 1).padStart(2, '0')}</span><strong>{principle}</strong></li>
          {/each}
        </ol>
      </div>
    </section>

    <section class="closing" id="status" aria-labelledby="closing-heading">
      <div class="shell" data-reveal>
        <p class="kicker ink"><span aria-hidden="true"></span>The mission</p>
        <h2 id="closing-heading">Make self-custody the standard.</h2>
        <p>Hold bitcoin with keys you control, transactions you verify, and a recovery path that works without us.</p>
        <div class="actions">
          <a class="button dark" href="/marketing/status">Follow development</a>
          <a class="text-link" href="/marketing/docs">Review the documentation</a>
        </div>
        <footer>
          <span>Test-network release. Mainnet is not enabled.</span>
          <span>
            <a href="/marketing/security">Security</a> · <a href="/marketing/status">Status</a> · <a href="/marketing/docs">Documentation</a><br />
            Photograph by <a href="https://unsplash.com/@luke_helgeson">Luke Helgeson</a> on
            <a href="https://unsplash.com/photos/M2DkvRbumM0">Unsplash</a>
          </span>
        </footer>
      </div>
    </section>
  </main>
</div>

<style>
  :global(html) { scroll-behavior: smooth; }
  :global(body) { background: #f7f3e9; }

  .marketing-page {
    --ink: #102a4c;
    --ivory: #f7f3e9;
    --paper: #eee9dd;
    --red: #d3293a;
    --line: rgba(16, 42, 76, 0.2);
    width: 100%;
    min-width: 320px;
    color: var(--ink);
    background: var(--ivory);
    font-family: 'Source Sans 3', ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    -webkit-user-select: text;
    user-select: text;
  }

  .marketing-page :global(*) { box-sizing: border-box; }
  .marketing-page :global(h1), .marketing-page :global(h2), .marketing-page :global(h3), .marketing-page :global(p) { margin: 0; }
  .marketing-page :global(a) { color: inherit; text-decoration: none; }
  .marketing-page :global(a:focus-visible) { outline: 2px solid currentColor; outline-offset: 4px; }
  .shell { width: min(calc(100% - 48px), 1160px); margin-inline: auto; }

  .marketing-page:global(.motion-ready) [data-reveal] { opacity: 0; transform: translateY(18px); }
  .marketing-page:global(.motion-ready) [data-reveal]:global(.is-visible) { opacity: 1; transform: translateY(0); transition: opacity 560ms ease, transform 700ms cubic-bezier(0.22, 1, 0.36, 1); }

  .skip-link { position: absolute; z-index: 20; left: 16px; top: 12px; padding: 10px 14px; color: var(--ink); background: var(--ivory); transform: translateY(-160%); }
  .skip-link:focus { transform: translateY(0); }

  .hero {
    position: relative;
    min-height: 760px;
    min-height: 100svh;
    display: flex;
    flex-direction: column;
    color: var(--ivory);
    background: #102a4c url('/marketing/hero-mountain.jpg') center center / cover no-repeat;
    isolation: isolate;
  }
  .hero-overlay { position: absolute; z-index: -1; inset: 0; background: rgba(4, 16, 30, 0.48); pointer-events: none; }
  .text-link { transition: opacity 180ms ease; }
  .text-link:hover { opacity: 0.72; }

  .hero-content { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; padding-block: 96px 48px; }
  .kicker { display: flex; align-items: center; gap: 12px; font-size: 12px; line-height: 1.4; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 500; }
  .kicker span { width: 26px; height: 3px; flex: none; background: var(--red); }
  .kicker.ink { color: var(--ink); }
  .hero h1, h2, h3 { font-family: 'Source Serif 4', 'Iowan Old Style', Baskerville, Georgia, serif; font-weight: 400; }
  .hero h1 { max-width: 820px; margin-top: 20px; font-size: clamp(64px, 10vw, 118px); line-height: 0.88; letter-spacing: -0.045em; }
  .hero-copy { max-width: 570px; margin-top: 30px; font-family: 'Source Serif 4', 'Iowan Old Style', Baskerville, Georgia, serif; font-size: clamp(22px, 2.8vw, 31px); line-height: 1.18; }
  .actions { margin-top: 34px; display: flex; flex-wrap: wrap; align-items: center; gap: 24px; }
  .button { min-height: 48px; display: inline-flex; align-items: center; justify-content: center; padding: 0 22px; border: 1px solid currentColor; font-weight: 500; }
  .button.primary { color: var(--ink); background: var(--ivory); }
  .button.dark { color: var(--ivory); background: var(--ink); border-color: var(--ink); }
  .button { transition: transform 180ms ease, background-color 180ms ease, color 180ms ease; }
  .button:hover { transform: translateY(-2px); }
  .text-link { min-height: 44px; display: inline-flex; align-items: center; border-bottom: 1px solid currentColor; }
  .hero-footer { padding-block: 18px 22px; display: flex; justify-content: space-between; gap: 24px; border-top: 1px solid rgba(247, 243, 233, 0.38); font-size: 13px; line-height: 1.45; }

  .position { padding-block: clamp(88px, 12vw, 132px); border-bottom: 1px solid var(--line); }
  .position-grid { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(0, 2.2fr); gap: 64px; }
  .position h2 { max-width: 780px; font-size: clamp(48px, 6.5vw, 80px); line-height: 0.98; letter-spacing: -0.04em; }
  .position div > p { max-width: 650px; margin-top: 36px; font-size: clamp(18px, 2vw, 21px); line-height: 1.52; }

  .proofs { padding-top: 42px; }
  .proof-intro { padding-bottom: 42px; display: grid; grid-template-columns: minmax(180px, 1fr) minmax(0, 2.2fr); gap: 64px; align-items: start; }
  .proof-intro h2 { max-width: 590px; font-family: 'Source Serif 4', 'Iowan Old Style', Baskerville, Georgia, serif; font-size: clamp(23px, 2.8vw, 32px); line-height: 1.25; letter-spacing: -0.02em; }
  .proof { padding-block: clamp(76px, 9vw, 108px); border-top: 1px solid var(--line); }
  .proof-copy { display: grid; grid-template-columns: 100px minmax(0, 1fr) minmax(300px, 1.15fr); gap: 38px; align-items: start; margin-bottom: 54px; }
  .proof-index { padding-top: 10px; color: var(--red); font-size: 12px; letter-spacing: 0.14em; font-weight: 500; }
  .proof h3 { max-width: 540px; font-size: clamp(40px, 5vw, 62px); line-height: 1; letter-spacing: -0.035em; }
  .proof-copy > p:last-child { max-width: 520px; padding-top: 8px; font-size: 18px; line-height: 1.5; }
  figure { margin: 0; padding: clamp(14px, 3vw, 34px); border: 1px solid rgba(16, 42, 76, 0.13); background: var(--paper); }
  figure { overflow: hidden; }
  figure picture { display: block; }
  figure img { width: 100%; height: auto; display: block; border: 1px solid rgba(16, 42, 76, 0.16); transition: transform 700ms cubic-bezier(0.22, 1, 0.36, 1); }
  figure:hover img { transform: scale(1.008); }
  figcaption { margin-top: 14px; display: flex; justify-content: space-between; gap: 24px; color: rgba(16, 42, 76, 0.7); font-size: 12px; line-height: 1.45; }

  .security { padding-block: clamp(88px, 11vw, 124px); color: var(--ivory); background: var(--ink); }
  .security-intro { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(0, 2.2fr); gap: 64px; }
  .security-intro h2 { max-width: 760px; font-size: clamp(48px, 6.5vw, 80px); line-height: 0.98; letter-spacing: -0.04em; }
  .security-intro div > p { max-width: 640px; margin-top: 30px; color: rgba(247, 243, 233, 0.78); font-size: 19px; line-height: 1.52; }
  .security-layers { margin-top: clamp(68px, 8vw, 92px); border-top: 1px solid rgba(247, 243, 233, 0.3); }
  .security-layers article { min-height: 170px; display: grid; grid-template-columns: 74px minmax(240px, 0.9fr) minmax(300px, 1.15fr); gap: 32px; align-items: start; padding-block: 34px; border-bottom: 1px solid rgba(247, 243, 233, 0.3); }
  .security-layers article > span { padding-top: 5px; color: var(--red); font-size: 12px; letter-spacing: 0.14em; }
  .security-layers h3 { max-width: 390px; font-size: clamp(27px, 3vw, 38px); line-height: 1.08; letter-spacing: -0.025em; }
  .security-layers article > p { max-width: 530px; padding-top: 3px; color: rgba(247, 243, 233, 0.76); font-size: 17px; line-height: 1.55; }
  .stack { margin-top: 56px; padding: 24px 0 0; display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 20px 32px; border-top: 1px solid rgba(247, 243, 233, 0.3); }
  .stack > p:first-child { color: rgba(247, 243, 233, 0.58); font-size: 12px; line-height: 1.5; letter-spacing: 0.12em; text-transform: uppercase; }
  .stack ul { margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 9px; list-style: none; }
  .stack li { padding: 6px 10px; border: 1px solid rgba(247, 243, 233, 0.32); font-size: 13px; line-height: 1.2; }
  .stack .stack-note { grid-column: 2; max-width: 650px; color: rgba(247, 243, 233, 0.58); font-size: 12px; line-height: 1.5; }

  .principles { padding-block: clamp(88px, 11vw, 120px); border-top: 1px solid rgba(247, 243, 233, 0.3); color: var(--ivory); background: var(--ink); }
  .principles-grid { display: grid; grid-template-columns: minmax(240px, 0.8fr) minmax(0, 2fr); gap: 64px; }
  .principles h2 { max-width: 400px; margin-top: 22px; font-size: clamp(46px, 5.5vw, 70px); line-height: 1; letter-spacing: -0.035em; }
  .principles ol { margin: 0; padding: 0; list-style: none; border-top: 1px solid rgba(247, 243, 233, 0.32); }
  .principles li { min-height: 84px; display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 18px; align-items: center; border-bottom: 1px solid rgba(247, 243, 233, 0.32); }
  .principles li > span { color: rgba(247, 243, 233, 0.58); font-size: 12px; letter-spacing: 0.12em; }
  .principles strong { font-family: 'Source Serif 4', 'Iowan Old Style', Baskerville, Georgia, serif; font-size: clamp(23px, 3vw, 36px); line-height: 1.16; font-weight: 400; }

  .closing { padding-block: clamp(96px, 12vw, 132px) 52px; }
  .closing h2 { max-width: 860px; margin-top: 20px; font-size: clamp(66px, 10vw, 118px); line-height: 0.9; letter-spacing: -0.045em; }
  .closing > .shell > p:not(.kicker) { max-width: 560px; margin-top: 30px; font-family: 'Source Serif 4', 'Iowan Old Style', Baskerville, Georgia, serif; font-size: 26px; line-height: 1.3; }
  footer { margin-top: 100px; padding-top: 20px; display: flex; justify-content: space-between; gap: 24px; border-top: 1px solid var(--line); color: rgba(16, 42, 76, 0.72); font-size: 12px; line-height: 1.5; }
  footer a { text-decoration: underline; text-underline-offset: 3px; }

  @media (max-width: 760px) {
    .shell { width: min(calc(100% - 32px), 1160px); }
    .hero { min-height: 720px; background-position: 58% center; }
    .hero-content { padding-block: 104px 42px; }
    .hero h1 { font-size: clamp(58px, 19vw, 82px); }
    .hero-copy { font-size: clamp(21px, 7vw, 28px); }
    .hero-footer { flex-direction: column; gap: 8px; }
    .position-grid, .proof-intro, .security-intro, .principles-grid { grid-template-columns: 1fr; gap: 32px; }
    .position h2 { font-size: clamp(48px, 15vw, 68px); }
    .proof-copy { grid-template-columns: 38px minmax(0, 1fr); gap: 18px; margin-bottom: 34px; }
    .proof-copy > p:last-child { grid-column: 2; padding-top: 0; font-size: 17px; }
    .proof h3 { font-size: clamp(39px, 12vw, 54px); }
    figcaption, footer { flex-direction: column; gap: 6px; }
    .security-layers article { min-height: 0; grid-template-columns: 34px minmax(0, 1fr); gap: 12px; padding-block: 30px; }
    .security-layers article > p { grid-column: 2; padding-top: 6px; }
    .stack { grid-template-columns: 1fr; }
    .stack .stack-note { grid-column: 1; }
    .principles-grid { gap: 44px; }
    .principles li { min-height: 78px; }
    .closing > .shell > p:not(.kicker) { font-size: 23px; }
    footer { margin-top: 72px; }
  }

  @media (max-width: 390px) {
    .hero { min-height: 760px; }
    .actions { align-items: flex-start; flex-direction: column; gap: 12px; }
    .button { width: 100%; }
    .proof-copy { grid-template-columns: 30px minmax(0, 1fr); gap: 12px; }
    figure { margin-inline: -4px; }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(html) { scroll-behavior: auto; }
    .marketing-page [data-reveal] { opacity: 1; transform: none; transition: none; }
    .button, .text-link, figure img { transition: none; }
    .button:hover, figure:hover img { transform: none; }
  }
</style>
