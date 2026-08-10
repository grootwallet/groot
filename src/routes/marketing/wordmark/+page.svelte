<script lang="ts">
  import BrandMark from '$lib/components/BrandMark.svelte';
  import BrandMarkStudy from '$lib/components/BrandMarkStudy.svelte';
  import grootLockupInkUrl from '../../../../assets/brand/lockup-horizontal-ink.svg?url';
  import grootLockupReversedUrl from '../../../../assets/brand/lockup-horizontal-reversed.svg?url';

  const candidates = ['Arca', 'Cacao', 'Clove', 'Grove', 'Kimchi', 'Miso', 'Sable', 'Stone', 'Yuzu'];
  const markVariants = [
    { id: 'raised' as const, number: '01', name: 'Raised terminals', note: 'Centered pair · 8-unit inner gap · 14-unit side clearance.' },
    { id: 'control' as const, number: '02', name: 'Control', note: 'The approved 18-unit, R2 construction.' },
    { id: 'grove-g' as const, number: '03', name: 'G return', note: 'Single compound return · centered on the 64-unit axis.' }
  ];
  const scaleSizes = [64, 32, 24, 16, 12];
  const serifDirections = [
    { id: 'source', number: 'A', name: 'Source Serif 4', note: 'Open and measured · calm at display sizes, slightly delicate over imagery.' },
    { id: 'newsreader', number: 'B', name: 'Newsreader', note: 'Distinctive but readable · the strongest balance of warmth, authority, and screen clarity.' },
    { id: 'spectral', number: 'C', name: 'Spectral', note: 'Compact and sturdy · excellent at small sizes, with a more literary character.' },
    { id: 'manrope', number: 'D', name: 'Manrope Sans', note: 'Block-inspired digital control · exceptionally clear, modern, and useful, but less ownable alone.' }
  ];
  const finalists = [
    { number: '01A', name: 'Grove', handle: '@grove', mark: 'control' as const, note: 'Quiet, mature, and structurally neutral.' },
    { number: '01B', name: 'Grove', handle: '@grove', mark: 'grove-g' as const, note: 'The strongest Grove-specific signature.' },
    { number: '02A', name: 'Groot', handle: '@groot', mark: 'control' as const, note: 'Memorable sound with the safer universal mark.' },
    { number: '02B', name: 'Groot', handle: '@groot', mark: 'grove-g' as const, note: 'Maximum mnemonic unity: G name, G mark, root association.' }
  ];
  const decisionSizes = [64, 32, 24, 16];
</script>

<svelte:head>
  <meta name="description" content="A controlled visual comparison of nine provisional names for the Bitcoin product brand." />
  <meta name="theme-color" content="#F7F3E9" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
</svelte:head>

<main class="name-study">
  <header class="study-header shell">
    <a class="grove-lockup" href="/marketing" aria-label="Back to marketing home">
      <BrandMark size={30} />
      <span>Grove</span>
    </a>
    <p>Brand direction 01 · working name</p>
  </header>

  <section class="intro shell">
    <p class="eyebrow">Grove · direction 01</p>
    <div>
      <h1>Built to<br />hold.</h1>
      <p>A first view of Grove as a lasting Bitcoin brand: disciplined in the product, human in the world, and quiet enough to earn trust over time.</p>
    </div>
  </section>

  <section class="mark-study shell" aria-labelledby="mark-study-title">
    <div class="section-heading">
      <p class="eyebrow">Icon exploration 02</p>
      <div>
        <h2 id="mark-study-title">One skeleton.<br />Three endings.</h2>
        <p>The outer 54-unit arch, 18-unit weight, and R2 corner language stay fixed. Only the terminal logic changes.</p>
      </div>
    </div>

    <div class="mark-grid">
      {#each markVariants as mark}
        <article class="mark-card">
          <header><span>{mark.number}</span><strong>{mark.name}</strong></header>
          <div class="mark-stage"><BrandMarkStudy variant={mark.id} size={190} guides title={`${mark.name} construction drawing`} /></div>
          <p>{mark.note}</p>
          <div class="wordmark-tests">
            <div class="study-lockup serif-lockup"><BrandMarkStudy variant={mark.id} size={37} /><span>Grove</span></div>
            <div class="study-lockup tech-lockup"><BrandMarkStudy variant={mark.id} size={37} /><span>grove</span></div>
          </div>
        </article>
      {/each}
    </div>

    <div class="scale-test">
      <header><span>Raster-scale test</span><small>Actual CSS pixel sizes · no optical correction</small></header>
      <div class="scale-matrix">
        <div class="scale-row scale-labels"><span>Variant</span>{#each scaleSizes as size}<span>{size}px</span>{/each}</div>
        {#each markVariants as mark}
          <div class="scale-row">
            <strong>{mark.number}</strong>
            {#each scaleSizes as size}<span><BrandMarkStudy variant={mark.id} {size} /></span>{/each}
          </div>
        {/each}
      </div>
    </div>

    <div class="engineering-analysis">
      <article class="ratio-note">
        <span>Proportion</span>
        <strong>φ ≈ 1.618</strong>
        <p>The mark is not a golden rectangle. Its useful near-φ relationship is overall height ÷ outer radius: 86 ÷ 54 = 1.593, only 1.6% below φ. The stronger construction logic is the exact 3:2 radial system: 54-unit outer radius, 36-unit inner radius, 18-unit weight.</p>
      </article>
      <div class="metric-table">
        <div class="metric-head"><span>Variant</span><span>Critical aperture</span><span>Symmetry</span><span>12px result</span></div>
        <div><strong>Raised</strong><span>8u · 0.75px</span><span>Bilateral</span><span class="risk">At risk</span></div>
        <div><strong>Control</strong><span>28u · 2.63px</span><span>Bilateral</span><span>Clear</span></div>
        <div><strong>G return</strong><span>≈27u · 2.53px</span><span>Optically centered</span><span>Clear</span></div>
      </div>
    </div>

    <div class="verdict-strip">
      <span>Engineering verdict</span>
      <p><strong>Control remains the best complete mark.</strong> The G return is the strongest ownable challenger if Grove becomes final. Raised terminals should not advance.</p>
    </div>

    <div class="wordmark-comparison">
      <div>
        <span>Editorial serif</span>
        <div class="study-lockup serif-lockup"><BrandMarkStudy variant="control" size={64} /><strong>Grove</strong></div>
      </div>
      <div>
        <span>Geometric sans</span>
        <div class="study-lockup tech-lockup"><BrandMarkStudy variant="control" size={64} /><strong>grove</strong></div>
      </div>
    </div>
  </section>

  <section class="serif-study shell" aria-labelledby="serif-study-title">
    <div class="section-heading">
      <p class="eyebrow">Wordmark study 01</p>
      <div>
        <h2 id="serif-study-title">Three serifs.<br />One sans.</h2>
        <p>The first three preserve the crafted serif direction. The fourth translates the clean, geometric character of the Block reference into an openly licensed typeface.</p>
      </div>
    </div>

    <div class="serif-grid">
      {#each serifDirections as serif}
        <article class={`serif-card font-${serif.id}`}>
          <header><span>{serif.number}</span><strong>{serif.name}</strong></header>

          <div class="serif-pair">
            <div>
              <small>Control</small>
              <div class="serif-lockup"><BrandMarkStudy variant="control" size={48} /><b>Grove</b></div>
            </div>
            <div>
              <small>G return</small>
              <div class="serif-lockup"><BrandMarkStudy variant="grove-g" size={48} /><b>Grove</b></div>
            </div>
          </div>

          <div class="serif-nav">
            <div class="serif-lockup"><BrandMarkStudy variant="control" size={25} /><b>Grove</b></div>
            <nav aria-hidden="true"><strong>Product</strong><span>Security</span></nav>
          </div>

          <div class="glyph-test" aria-label={`${serif.name} letterform details`}><span>G</span><span>r</span><span>o</span><span>v</span><span>e</span></div>
          <p>{serif.note}</p>
        </article>
      {/each}
    </div>

    <div class="serif-scale">
      {#each serifDirections as serif}
        <div class={`font-${serif.id}`}>
          <span>{serif.number}</span>
          <strong>Grove</strong>
          <b>Grove</b>
          <small>Grove · Bitcoin wallet</small>
        </div>
      {/each}
    </div>

    <div class="type-verdict">
      <span>Recommendation</span>
      <p><strong>B · Newsreader is the strongest primary wordmark.</strong> It stays human and lasting without becoming nostalgic. D · Manrope is the strongest utility direction for tiny labels, social metadata, and dense product surfaces—not a better replacement for the wordmark.</p>
    </div>

    <div class="digital-heading">
      <span>Digital stress test</span>
      <p>Identical 24px lockups, reversed over photography, then reduced to a social account row. These are the conditions that expose fragile details fastest.</p>
    </div>
    <div class="digital-test">
      {#each serifDirections as serif}
        <article class={`digital-card font-${serif.id}`}>
          <header><span>{serif.number}</span><strong>{serif.name}</strong></header>
          <div class="image-test">
            <img src="/marketing/hero-mountain-grove.jpg" alt="" />
            <div class="image-test-shade"></div>
            <div class="digital-lockup"><BrandMarkStudy variant="control" size={24} /><b>Grove</b></div>
            <p>Hold your own.</p>
          </div>
          <div class="social-test">
            <div class="social-avatar"><BrandMarkStudy variant="control" size={22} /></div>
            <div><b>Grove</b><span>@grove · Bitcoin wallet</span></div>
            <small>Follow</small>
          </div>
        </article>
      {/each}
    </div>
  </section>

  <section class="finalist-study shell" aria-labelledby="finalist-title">
    <div class="section-heading">
      <p class="eyebrow">Finalist system 01</p>
      <div>
        <h2 id="finalist-title">Two names.<br />Two marks.</h2>
        <p>Newsreader remains fixed as the primary wordmark. Manrope carries operational interface copy. Only the provisional name and icon ending change.</p>
      </div>
    </div>

    <div class="finalist-grid">
      {#each finalists as finalist}
        <article class="finalist-card">
          <header><span>{finalist.number}</span><strong>{finalist.name} · {finalist.mark === 'control' ? 'Control' : 'G return'}</strong></header>

          <div class="finalist-primary">
            <div class="finalist-lockup"><BrandMarkStudy variant={finalist.mark} size={52} /><b>{finalist.name}</b></div>
            <small>{finalist.note}</small>
          </div>

          <div class="finalist-wallet">
            <div class="finalist-lockup finalist-lockup-small"><BrandMarkStudy variant={finalist.mark} size={24} /><b>{finalist.name}</b></div>
            <nav aria-hidden="true"><strong>Wallets</strong><span>Activity</span><span>Settings</span></nav>
          </div>

          <div class="finalist-contexts">
            <div class="launcher-test">
              <div class="finalist-app-icon"><BrandMarkStudy variant={finalist.mark} size={29} /></div>
              <div><b>{finalist.name}</b><span>Bitcoin wallet</span></div>
            </div>

            <div class="finalist-social">
              <div class="finalist-avatar"><BrandMarkStudy variant={finalist.mark} size={23} /></div>
              <div><b>{finalist.name}</b><span>{finalist.handle} · Bitcoin</span></div>
              <small>Follow</small>
            </div>
          </div>

          <div class="finalist-campaign">
            <img src="/marketing/hero-mountain-grove.jpg" alt="" />
            <div class="finalist-shade"></div>
            <div class="finalist-lockup finalist-lockup-light"><BrandMarkStudy variant={finalist.mark} size={25} /><b>{finalist.name}</b></div>
            <p>Hold your own.</p>
          </div>
        </article>
      {/each}
    </div>

    <div class="name-reality">
      <div class="name-reality-heading">
        <span>Preliminary name screen</span>
        <p>This is a point-in-time signal, not trademark clearance or a domain purchase recommendation.</p>
      </div>
      <div class="name-reality-grid">
        <article>
          <header><strong>Grove</strong><span class="signal signal-neutral">Lower cultural risk</span></header>
          <p>Natural, patient, established. The meaning fits the long-term mission, but the word is crowded and the obvious domains are already registered.</p>
          <small>Registered in RDAP: grove.com · usegrove.com · grovebitcoin.com · grovewallet.com</small>
        </article>
        <article>
          <header><strong>Groot</strong><span class="signal signal-risk">High naming risk</span></header>
          <p>Short, unusually memorable, and visually excellent with the G return. But the Marvel character dominates recognition, Marvel owns GROOT marks, and Groot Pay already operates as a wallet.</p>
          <small>Acquired: usegroot.com · grootbitcoin.com · grootwallet.com</small>
        </article>
      </div>
    </div>
  </section>

  <section class="decision-study shell" aria-labelledby="decision-title">
    <div class="section-heading">
      <p class="eyebrow">Decision stage 01</p>
      <div>
        <h2 id="decision-title">One name.<br />One mark.</h2>
        <p>Assume Groot advances. The remaining question is whether the symbol should repeat its initial or remain an independent structural mark.</p>
      </div>
    </div>

    <div class="decision-grid">
      <article class="decision-card decision-recommended">
        <header><span>A</span><strong>Control</strong><small>Recommended</small></header>
        <div class="decision-lockup"><BrandMarkStudy variant="control" size={70} /><b>Groot</b></div>
        <div class="decision-rationale">
          <p><strong>Independent symbol.</strong> The wordmark supplies the G; the icon contributes structure, shelter, and control.</p>
          <p><strong>Name-resilient.</strong> It survives if Groot changes later and preserves the strongest approved geometry.</p>
        </div>
        <div class="decision-scales">
          {#each decisionSizes as size}<div><BrandMarkStudy variant="control" {size} /><span>{size}px</span></div>{/each}
        </div>
      </article>

      <article class="decision-card">
        <header><span>B</span><strong>G return</strong><small>Challenger</small></header>
        <div class="decision-lockup"><BrandMarkStudy variant="grove-g" size={70} /><b>Groot</b></div>
        <div class="decision-rationale">
          <p><strong>Ownable monogram.</strong> It is more distinctive alone and tightly connects the symbol to a G name.</p>
          <p><strong>Redundant in lockup.</strong> Beside Groot, it effectively reads as “G + Groot” and becomes fragile if the name changes.</p>
        </div>
        <div class="decision-scales">
          {#each decisionSizes as size}<div><BrandMarkStudy variant="grove-g" {size} /><span>{size}px</span></div>{/each}
        </div>
      </article>
    </div>

    <div class="system-options">
      <header><span>System discipline</span><p>Three plausible systems; only one is simple enough for a serious v1.</p></header>
      <div class="system-option system-winner">
        <span>01</span>
        <div><BrandMarkStudy variant="control" size={34} /><b>Groot</b></div>
        <div class="system-icon"><BrandMarkStudy variant="control" size={25} /></div>
        <p>Control everywhere</p><small>One asset · strongest consistency</small>
      </div>
      <div class="system-option">
        <span>02</span>
        <div><BrandMarkStudy variant="grove-g" size={34} /><b>Groot</b></div>
        <div class="system-icon"><BrandMarkStudy variant="grove-g" size={25} /></div>
        <p>G return everywhere</p><small>Distinctive · redundant in lockup</small>
      </div>
      <div class="system-option system-reject">
        <span>03</span>
        <div><BrandMarkStudy variant="control" size={34} /><b>Groot</b></div>
        <div class="system-icon"><BrandMarkStudy variant="grove-g" size={25} /></div>
        <p>Adaptive split</p><small>Flexible · unnecessary v1 complexity</small>
      </div>
    </div>

    <div class="decision-score" role="table" aria-label="Control and G return design scorecard">
      <div class="decision-score-head" role="row"><span>Criterion</span><span>Control</span><span>G return</span></div>
      <div role="row"><strong>Horizontal lockup</strong><span>Excellent</span><span>Good</span></div>
      <div role="row"><strong>Standalone recall</strong><span>Good</span><span>Excellent</span></div>
      <div role="row"><strong>12–16px integrity</strong><span>Excellent</span><span>Excellent</span></div>
      <div role="row"><strong>Name independence</strong><span>Excellent</span><span>Low</span></div>
      <div role="row"><strong>V1 simplicity</strong><span>Excellent</span><span>Good</span></div>
    </div>

    <div class="final-verdict">
      <span>Design recommendation</span>
      <p><strong>Advance Groot + Control.</strong> The name is already memorable; the symbol does not need to spell it again. Keep G Return documented as the reserve monogram, not the primary v1 mark.</p>
    </div>

    <div class="gate-board" aria-label="Groot candidate decision gate">
      <header>
        <span>Final candidate gate</span>
        <p>Internal approval is not public clearance.</p>
      </header>
      <div><strong>Design</strong><span class="gate-pass">Pass</span><p>Control + Newsreader Medium</p></div>
      <div><strong>Small sizes</strong><span class="gate-pass">Pass</span><p>Control remains intact at 16 px</p></div>
      <div><strong>Domain</strong><span class="gate-pass">Pass</span><p>usegroot.com acquired · two defensive redirects</p></div>
      <div><strong>Market conflict</strong><span class="gate-hold">Hold</span><p>Groot Pay already operates as a finance wallet</p></div>
      <div><strong>Trademark</strong><span class="gate-hold">Hold</span><p>Professional US and European clearance required</p></div>
      <footer>
        <strong>Candidate approved internally.</strong>
        <p>Do not rename or announce the product until the two hold gates clear.</p>
      </footer>
    </div>

    <div class="production-master" aria-label="Outlined production candidate">
      <header><span>Outlined candidate master</span><p>The exact exported asset—not live browser type.</p></header>
      <div class="master-positive"><img src={grootLockupInkUrl} alt="Groot with the Control symbol" /></div>
      <div class="master-reversed"><img src={grootLockupReversedUrl} alt="Groot with the Control symbol, reversed" /></div>
      <footer>
        <img src={grootLockupInkUrl} alt="" width="192" />
        <img src={grootLockupInkUrl} alt="" width="128" />
        <img src={grootLockupInkUrl} alt="" width="96" />
        <p>192 · 128 · 96 px minimum</p>
      </footer>
    </div>
  </section>

  <section class="grove-direction shell" aria-labelledby="grove-title">
    <div class="section-heading">
      <p class="eyebrow">Exploration archive</p>
      <div>
        <h2 id="grove-title">Earlier Grove<br />direction.</h2>
        <p>Retained as a reference below the active Groot decision stage. It is no longer the primary decision surface.</p>
      </div>
    </div>

    <div class="campaign-hero">
      <img src="/marketing/hero-mountain-grove.jpg" alt="Lone hiker raising both arms on a snowy Himalayan summit above layered mountain ranges" />
      <div class="campaign-shade"></div>
      <div class="campaign-top grove-lockup grove-lockup-light"><BrandMark size={32} /><span>Grove</span></div>
      <a class="photo-credit" href="https://www.pexels.com/photo/a-man-standing-in-the-himalayas-7846485/" target="_blank" rel="noreferrer">Sanket Barik · Pexels</a>
      <div class="campaign-copy">
        <i aria-hidden="true"></i>
        <p>Hold your own.</p>
        <small>Bitcoin, with the tools to do it right.</small>
      </div>
    </div>

    <div class="identity-grid" aria-label="Grove identity treatments">
      <article class="identity-card identity-paper">
        <span>Primary</span>
        <div class="display-lockup"><BrandMark size={58} /><strong>Grove</strong></div>
        <small>Ink on ivory</small>
      </article>
      <article class="identity-card identity-ink">
        <span>Reversed</span>
        <div class="display-lockup"><BrandMark size={58} /><strong>Grove</strong></div>
        <small>Ivory on ink</small>
      </article>
      <article class="identity-card identity-icon">
        <span>Application</span>
        <div class="app-icon app-icon-large"><BrandMark size={42} /></div>
        <div><strong>Grove</strong><small>Bitcoin wallet</small></div>
      </article>
    </div>

    <article class="product-proof">
      <header>
        <div class="grove-lockup"><BrandMark size={28} /><span>Grove</span></div>
        <p>Bitcoin wallet</p>
      </header>
      <div class="product-screen">
        <img src="/marketing/wallet-review.png" alt="Grove wallet transaction review screen" />
        <div class="screen-brand" aria-hidden="true"><BrandMark size={23} /><span>Grove</span></div>
      </div>
      <footer>
        <p><strong>Review every transaction.</strong> Know the destination, fee, and signing policy before bitcoin moves.</p>
        <span>Product proof 01</span>
      </footer>
    </article>

    <div class="campaign-pair">
      <article class="statement-card">
        <div class="grove-lockup"><BrandMark size={25} /><span>Grove</span></div>
        <p>Your keys.<br />Your policy.<br />Your bitcoin.</p>
        <small>Self-custody, structured.</small>
      </article>
      <article class="image-card">
        <img src="/marketing/hero-mountain-grove.jpg" alt="Hiker celebrating on a high snowy summit" />
        <div class="image-card-lockup grove-lockup grove-lockup-light"><BrandMark size={25} /><span>Grove</span></div>
        <p>Freedom<br />needs structure.</p>
      </article>
    </div>
  </section>

  <section class="candidate-section shell" aria-labelledby="candidate-title">
    <div class="section-heading">
      <p class="eyebrow">Original shortlist</p>
      <div>
        <h2 id="candidate-title">Keep the comparison.</h2>
        <p>Grove leads the page, but the original controlled study remains below for an honest second look.</p>
      </div>
    </div>

    <div class="candidate-list">
      {#each candidates as candidate, index}
        <article class="candidate" data-name={candidate}>
          <header>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <h3>{candidate}</h3>
          </header>

          <div class="primary-lockup">
            <BrandMark size={72} />
            <span>{candidate}</span>
          </div>

          <div class="context-row">
            <div class="nav-context" aria-label={`${candidate} navigation treatment`}>
              <div class="small-lockup"><BrandMark size={27} /><span>{candidate}</span></div>
              <nav aria-hidden="true"><b>Product</b><span>Security</span><span>Documentation</span></nav>
            </div>

            <div class="reversed-context" aria-label={`${candidate} reversed treatment`}>
              <div class="small-lockup"><BrandMark size={27} /><span>{candidate}</span></div>
              <small>Bitcoin. In your hands.</small>
            </div>

            <div class="store-context" aria-label={`${candidate} app listing treatment`}>
              <div class="app-icon"><BrandMark size={24} /></div>
              <div><strong>{candidate}</strong><span>Bitcoin wallet</span></div>
              <i aria-hidden="true">Get</i>
            </div>
          </div>
        </article>
      {/each}
    </div>
  </section>

  <section class="memory-test" aria-labelledby="memory-title">
    <div class="shell section-heading memory-heading">
      <p class="eyebrow">Memory test</p>
      <div>
        <h2 id="memory-title">No icon. No explanation.</h2>
        <p>A name must retain character when every other brand asset is removed.</p>
      </div>
    </div>
    <div class="shell word-grid">
      {#each candidates as candidate}<span>{candidate}</span>{/each}
    </div>
  </section>

  <section class="speech-test shell" aria-labelledby="speech-title">
    <div class="section-heading">
      <p class="eyebrow">Spoken test</p>
      <div><h2 id="speech-title">A name must leave the screen.</h2></div>
    </div>
    <div class="sentences">
      <p>“I hold my bitcoin with <span>[name]</span>.”</p>
      <p>“Open <span>[name]</span>.”</p>
      <p>“<span>[Name]</span> is a Bitcoin wallet.”</p>
    </div>
  </section>

  <footer class="shell">
    <p>No domain, trademark, or availability decision is represented by this page.</p>
    <a href="/marketing">Return to marketing site</a>
  </footer>
</main>

<style>
  @font-face { font-family: 'Newsreader Study'; src: url('/fonts/newsreader-500.ttf') format('truetype'); font-style: normal; font-weight: 500; font-display: swap; }
  @font-face { font-family: 'Spectral Study'; src: url('/fonts/spectral-500.ttf') format('truetype'); font-style: normal; font-weight: 500; font-display: swap; }
  @font-face { font-family: 'Manrope Study'; src: url('/fonts/manrope-500.ttf') format('truetype'); font-style: normal; font-weight: 500; font-display: swap; }
  :global(body) { margin: 0; background: #f7f3e9; }
  .name-study { --ink: #102a4c; --ivory: #f7f3e9; --paper: #eee9dd; --red: #d3293a; --line: rgba(16, 42, 76, .2); min-width: 320px; min-height: 100svh; color: var(--ink); background: var(--ivory); font-family: 'Source Sans 3', ui-sans-serif, system-ui, sans-serif; }
  .name-study * { box-sizing: border-box; }
  .shell { width: min(calc(100% - 48px), 1160px); margin-inline: auto; }
  .study-header { min-height: 84px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--line); }
  .study-header a { min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; color: inherit; }
  .study-header p { margin: 0; font-size: 10px; font-weight: 650; letter-spacing: .14em; text-transform: uppercase; }
  .grove-lockup { display: inline-flex; align-items: center; gap: 9px; color: var(--ink); }
  .grove-lockup > span { font-family: 'Source Serif 4', Georgia, serif; font-size: 24px; line-height: 1; letter-spacing: -.045em; }
  .grove-lockup-light { color: var(--ivory); }
  .eyebrow { margin: 0; padding-top: 11px; font-size: 10px; font-weight: 680; letter-spacing: .15em; text-transform: uppercase; }
  .intro { padding-block: clamp(86px, 11vw, 132px); display: grid; grid-template-columns: minmax(180px, 1fr) minmax(0, 2.2fr); gap: 64px; border-bottom: 1px solid var(--line); }
  h1, h2 { margin: 0; font-family: 'Source Serif 4', Georgia, serif; font-weight: 400; letter-spacing: -.045em; }
  h1 { max-width: 820px; font-size: clamp(68px, 9.2vw, 110px); line-height: .86; }
  .intro div > p { max-width: 560px; margin: 38px 0 0; font-size: 18px; line-height: 1.5; }
  .candidate-section, .speech-test { padding-block: clamp(78px, 9vw, 110px); }
  .section-heading { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(0, 2.2fr); gap: 64px; margin-bottom: 54px; }
  .section-heading h2 { font-size: clamp(46px, 6vw, 72px); line-height: 1; }
  .section-heading div > p { max-width: 640px; margin: 22px 0 0; font-size: 17px; line-height: 1.5; }
  .mark-study { padding-block: clamp(78px, 9vw, 110px); border-bottom: 1px solid var(--line); }
  .mark-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid var(--line); border-left: 1px solid var(--line); }
  .mark-card { min-width: 0; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .mark-card > header { min-height: 56px; padding: 0 18px; display: flex; align-items: center; gap: 14px; border-bottom: 1px solid var(--line); }
  .mark-card > header span { color: var(--red); font-size: 10px; letter-spacing: .12em; }
  .mark-card > header strong { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; }
  .mark-stage { min-height: 300px; display: grid; place-items: center; background: var(--paper); }
  .mark-card > p { min-height: 66px; margin: 0; padding: 18px; display: flex; align-items: center; border-top: 1px solid var(--line); font-size: 12px; line-height: 1.45; }
  .wordmark-tests { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid var(--line); }
  .wordmark-tests > div { min-width: 0; min-height: 82px; padding: 15px 12px; justify-content: center; }
  .wordmark-tests > div + div { border-left: 1px solid var(--line); }
  .study-lockup { display: flex; align-items: center; gap: 9px; white-space: nowrap; }
  .study-lockup :global(svg) { flex: none; }
  .serif-lockup > span, .serif-lockup > strong { font-family: 'Source Serif 4', Georgia, serif; font-size: 26px; font-weight: 400; line-height: 1; letter-spacing: -.045em; }
  .tech-lockup > span, .tech-lockup > strong { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Source Sans 3', sans-serif; font-size: 26px; font-weight: 540; line-height: 1; letter-spacing: -.055em; }
  .scale-test { display: grid; grid-template-columns: minmax(190px, .8fr) minmax(0, 2.2fr); border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); border-left: 1px solid var(--line); }
  .scale-test > header { min-height: 104px; padding: 20px 18px; display: flex; align-items: flex-start; justify-content: center; flex-direction: column; gap: 5px; border-right: 1px solid var(--line); }
  .scale-test > header span { font-size: 10px; font-weight: 680; letter-spacing: .12em; text-transform: uppercase; }
  .scale-test > header small { color: rgba(16, 42, 76, .58); font-size: 10px; }
  .scale-matrix { min-width: 0; }
  .scale-row { min-height: 60px; display: grid; grid-template-columns: 54px repeat(5, minmax(42px, 1fr)); align-items: center; border-bottom: 1px solid var(--line); }
  .scale-row:last-child { border-bottom: 0; }
  .scale-row > strong { padding-left: 18px; color: var(--red); font-size: 9px; letter-spacing: .12em; }
  .scale-row > span { min-width: 0; height: 100%; display: grid; place-items: center; border-left: 1px solid var(--line); }
  .scale-labels { min-height: 34px; color: rgba(16, 42, 76, .58); font-size: 8px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
  .scale-labels > span:first-child { border-left: 0; }
  .engineering-analysis { margin-top: 14px; display: grid; grid-template-columns: .9fr 1.6fr; border: 1px solid var(--line); }
  .ratio-note { padding: 24px; border-right: 1px solid var(--line); background: var(--paper); }
  .ratio-note > span, .verdict-strip > span { display: block; font-size: 9px; font-weight: 680; letter-spacing: .14em; text-transform: uppercase; }
  .ratio-note > strong { display: block; margin-top: 34px; font-family: 'Source Serif 4', Georgia, serif; font-size: clamp(44px, 5vw, 66px); font-weight: 400; letter-spacing: -.04em; }
  .ratio-note > p { max-width: 420px; margin: 18px 0 0; font-size: 12px; line-height: 1.55; }
  .metric-table { display: grid; grid-template-rows: auto repeat(3, 1fr); }
  .metric-table > div { min-height: 70px; display: grid; grid-template-columns: 1.05fr 1.25fr 1.25fr .75fr; align-items: center; border-bottom: 1px solid var(--line); }
  .metric-table > div:last-child { border-bottom: 0; }
  .metric-table > div > * { height: 100%; padding: 0 16px; display: flex; align-items: center; border-left: 1px solid var(--line); font-size: 11px; }
  .metric-table > div > *:first-child { border-left: 0; }
  .metric-table .metric-head { min-height: 38px; color: rgba(16, 42, 76, .58); }
  .metric-table .metric-head > span { font-size: 8px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
  .metric-table .risk { color: var(--red); }
  .verdict-strip { min-height: 118px; padding: 24px; display: grid; grid-template-columns: minmax(170px, .7fr) minmax(0, 1.8fr); align-items: start; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); border-left: 1px solid var(--line); }
  .verdict-strip > p { max-width: 720px; margin: 0; font-family: 'Source Serif 4', Georgia, serif; font-size: clamp(21px, 2.4vw, 30px); line-height: 1.25; letter-spacing: -.02em; }
  .wordmark-comparison { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .wordmark-comparison > div { min-height: 230px; padding: 22px; display: flex; justify-content: space-between; flex-direction: column; border: 1px solid var(--line); background: var(--paper); }
  .wordmark-comparison > div:last-child { color: var(--ivory); background: var(--ink); border-color: var(--ink); }
  .wordmark-comparison > div > span { font-size: 9px; font-weight: 680; letter-spacing: .14em; text-transform: uppercase; }
  .wordmark-comparison .study-lockup { margin: auto; gap: 15px; }
  .wordmark-comparison .study-lockup > strong { font-size: clamp(52px, 6vw, 78px); }
  .serif-study { padding-block: clamp(78px, 9vw, 110px); border-bottom: 1px solid var(--line); }
  .serif-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-top: 1px solid var(--line); border-left: 1px solid var(--line); }
  .serif-card { min-width: 0; container-type: inline-size; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .serif-card > header { min-height: 56px; padding: 0 18px; display: flex; align-items: center; gap: 14px; border-bottom: 1px solid var(--line); }
  .serif-card > header span { color: var(--red); font-size: 10px; letter-spacing: .12em; }
  .serif-card > header strong { font: 680 10px/1 'Source Sans 3', sans-serif; letter-spacing: .12em; text-transform: uppercase; }
  .serif-pair { display: grid; grid-template-columns: 1fr 1fr; background: var(--paper); }
  .serif-pair > div { min-width: 0; min-height: 190px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between; }
  .serif-pair > div + div { border-left: 1px solid var(--line); }
  .serif-pair small { font: 650 8px/1 'Source Sans 3', sans-serif; letter-spacing: .12em; text-transform: uppercase; }
  .serif-pair .serif-lockup { min-width: 0; gap: clamp(7px, 2cqi, 11px); }
  .serif-pair .serif-lockup :global(svg) { width: clamp(32px, 9cqi, 42px); height: clamp(32px, 9cqi, 42px); flex: none; }
  .serif-lockup { display: flex; align-items: baseline; gap: 11px; white-space: nowrap; }
  /* Flex aligns the SVG canvas to the text baseline. Move the drawn mark down by
     its 21-unit bottom inset so the visible mark—not the 128-unit canvas—aligns. */
  .serif-lockup :global(svg) { align-self: baseline; transform: translateY(16.40625%); }
  .serif-lockup b { font-size: clamp(29px, 9cqi, 42px); font-weight: 500; line-height: .9; letter-spacing: -.045em; }
  .serif-nav { min-height: 72px; padding: 0 16px; display: flex; align-items: center; justify-content: space-between; gap: 14px; border-top: 1px solid var(--line); }
  .serif-nav .serif-lockup { gap: 7px; }
  .serif-nav .serif-lockup b { font-size: 21px; }
  .serif-nav nav { display: flex; gap: 10px; color: rgba(16, 42, 76, .5); font: 500 8px/1 'Source Sans 3', sans-serif; }
  .serif-nav nav strong { color: var(--ink); }
  .glyph-test { min-height: 92px; display: grid; grid-template-columns: repeat(5, 1fr); border-top: 1px solid var(--line); }
  .glyph-test span { display: grid; place-items: center; border-left: 1px solid var(--line); font-size: 38px; line-height: 1; }
  .glyph-test span:first-child { border-left: 0; }
  .serif-card > p { min-height: 68px; margin: 0; padding: 18px; display: flex; align-items: center; border-top: 1px solid var(--line); font: 400 11px/1.45 'Source Sans 3', sans-serif; }
  .font-source { font-family: 'Source Serif 4', Georgia, serif; }
  .font-newsreader { font-family: 'Newsreader Study', Georgia, serif; }
  .font-spectral { font-family: 'Spectral Study', Georgia, serif; }
  .font-manrope { font-family: 'Manrope Study', 'Source Sans 3', sans-serif; }
  .font-manrope .serif-lockup b, .font-manrope .glyph-test, .font-manrope.serif-scale strong, .font-manrope.serif-scale b { letter-spacing: -.055em; }
  .serif-scale { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); border-left: 1px solid var(--line); }
  .serif-scale > div { min-height: 180px; padding: 20px; display: grid; grid-template-columns: auto 1fr; align-items: baseline; gap: 8px 18px; }
  .serif-scale > div:nth-child(even) { border-left: 1px solid var(--line); }
  .serif-scale > div:nth-child(n + 3) { border-top: 1px solid var(--line); }
  .serif-scale span { grid-row: 1 / span 3; color: var(--red); font: 650 9px/1 'Source Sans 3', sans-serif; }
  .serif-scale strong { font-size: 54px; font-weight: 500; line-height: .85; letter-spacing: -.045em; }
  .serif-scale b { font-size: 28px; font-weight: 500; line-height: 1; letter-spacing: -.035em; }
  .serif-scale small { font-size: 15px; line-height: 1; }
  .type-verdict { min-height: 124px; padding: 24px; display: grid; grid-template-columns: minmax(150px, .55fr) minmax(0, 1.8fr); gap: 24px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); border-left: 1px solid var(--line); }
  .type-verdict > span, .digital-heading > span { font-size: 9px; font-weight: 680; letter-spacing: .14em; text-transform: uppercase; }
  .type-verdict > p { max-width: 760px; margin: 0; font-family: 'Source Serif 4', Georgia, serif; font-size: clamp(20px, 2.3vw, 29px); line-height: 1.3; letter-spacing: -.02em; }
  .digital-heading { margin-top: 14px; padding: 22px 24px; display: grid; grid-template-columns: minmax(150px, .55fr) minmax(0, 1.8fr); gap: 24px; border: 1px solid var(--line); }
  .digital-heading > p { max-width: 680px; margin: 0; font-size: 12px; line-height: 1.5; }
  .digital-test { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-left: 1px solid var(--line); }
  .digital-card { min-width: 0; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .digital-card > header { min-height: 46px; padding: 0 16px; display: flex; align-items: center; gap: 12px; font-family: 'Source Sans 3', sans-serif; }
  .digital-card > header span { color: var(--red); font-size: 9px; }
  .digital-card > header strong { font-size: 9px; letter-spacing: .12em; text-transform: uppercase; }
  .image-test { position: relative; min-height: 210px; overflow: hidden; color: var(--ivory); }
  .image-test > img, .image-test-shade { position: absolute; inset: 0; width: 100%; height: 100%; }
  .image-test > img { object-fit: cover; object-position: 50% 48%; }
  .image-test-shade { background: linear-gradient(180deg, rgba(4,15,28,.68), rgba(4,15,28,.08) 58%, rgba(4,15,28,.58)); }
  .digital-lockup { position: absolute; z-index: 1; top: 18px; left: 18px; display: flex; align-items: center; gap: 7px; }
  .digital-lockup b { font-size: 22px; font-weight: 500; line-height: 1; letter-spacing: -.04em; }
  .image-test > p { position: absolute; z-index: 1; right: 18px; bottom: 15px; left: 18px; margin: 0; font-size: clamp(30px, 4.3vw, 48px); font-weight: 500; line-height: .95; letter-spacing: -.045em; }
  .social-test { min-height: 78px; padding: 12px 14px; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 11px; font-family: inherit; }
  .social-avatar { width: 46px; height: 46px; display: grid; place-items: center; color: var(--ivory); background: var(--ink); border-radius: 50%; }
  .social-test > div:nth-child(2) { min-width: 0; display: grid; }
  .social-test b { overflow: hidden; font-size: 18px; font-weight: 500; line-height: 1.15; text-overflow: ellipsis; white-space: nowrap; }
  .social-test span { overflow: hidden; color: rgba(16,42,76,.58); font: 400 10px/1.3 'Source Sans 3', sans-serif; text-overflow: ellipsis; white-space: nowrap; }
  .social-test small { padding: 6px 10px; border: 1px solid var(--line); border-radius: 16px; font: 650 9px/1 'Source Sans 3', sans-serif; }
  .finalist-study { padding-block: clamp(78px, 9vw, 110px); border-bottom: 1px solid var(--line); }
  .finalist-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-top: 1px solid var(--line); border-left: 1px solid var(--line); }
  .finalist-card { min-width: 0; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .finalist-card > header { min-height: 52px; padding: 0 17px; display: flex; align-items: center; gap: 13px; }
  .finalist-card > header span { color: var(--red); font-size: 9px; letter-spacing: .12em; }
  .finalist-card > header strong { font-size: 9px; letter-spacing: .12em; text-transform: uppercase; }
  .finalist-primary { min-height: 190px; padding: 22px; display: flex; align-items: center; justify-content: space-between; flex-direction: column; border-top: 1px solid var(--line); background: var(--paper); }
  .finalist-primary .finalist-lockup { margin: auto; }
  .finalist-primary > small { width: 100%; color: rgba(16,42,76,.62); font-size: 10px; }
  .finalist-lockup { display: inline-flex; align-items: baseline; gap: 12px; white-space: nowrap; }
  .finalist-lockup :global(svg) { flex: none; align-self: baseline; transform: translateY(16.40625%); }
  .finalist-lockup b { font-family: 'Newsreader Study', Georgia, serif; font-size: clamp(42px, 5vw, 58px); font-weight: 500; line-height: .9; letter-spacing: -.048em; }
  .finalist-wallet { min-height: 68px; padding: 0 16px; display: flex; align-items: center; justify-content: space-between; gap: 18px; border-top: 1px solid var(--line); }
  .finalist-lockup-small { gap: 7px; }
  .finalist-lockup-small b { font-size: 20px; }
  .finalist-wallet nav { display: flex; gap: 12px; color: rgba(16,42,76,.5); font: 500 8px/1 'Manrope Study', sans-serif; }
  .finalist-wallet nav strong { color: var(--ink); }
  .finalist-contexts { display: grid; grid-template-columns: 1fr 1.2fr; border-top: 1px solid var(--line); }
  .launcher-test, .finalist-social { min-width: 0; min-height: 78px; padding: 11px 13px; display: grid; align-items: center; gap: 10px; }
  .launcher-test { grid-template-columns: auto 1fr; }
  .finalist-social { grid-template-columns: auto minmax(0,1fr) auto; border-left: 1px solid var(--line); }
  .finalist-app-icon { width: 48px; height: 48px; display: grid; place-items: center; color: var(--ivory); background: var(--ink); border-radius: 11px; box-shadow: 0 6px 14px rgba(4,16,30,.13); }
  .launcher-test > div:last-child, .finalist-social > div:nth-child(2) { min-width: 0; display: grid; }
  .launcher-test b, .finalist-social b { overflow: hidden; font: 500 15px/1.15 'Newsreader Study', Georgia, serif; text-overflow: ellipsis; white-space: nowrap; }
  .launcher-test span, .finalist-social span { overflow: hidden; color: rgba(16,42,76,.58); font: 400 9px/1.3 'Manrope Study', sans-serif; text-overflow: ellipsis; white-space: nowrap; }
  .finalist-avatar { width: 44px; height: 44px; display: grid; place-items: center; color: var(--ivory); background: var(--ink); border-radius: 50%; }
  .finalist-social > small { padding: 5px 8px; border: 1px solid var(--line); border-radius: 14px; font: 650 8px/1 'Manrope Study', sans-serif; }
  .finalist-campaign { position: relative; min-height: 260px; overflow: hidden; color: var(--ivory); }
  .finalist-campaign > img, .finalist-shade { position: absolute; inset: 0; width: 100%; height: 100%; }
  .finalist-campaign > img { object-fit: cover; object-position: center 48%; }
  .finalist-shade { background: linear-gradient(180deg, rgba(4,15,28,.65), rgba(4,15,28,.06) 55%, rgba(4,15,28,.66)); }
  .finalist-campaign .finalist-lockup { position: absolute; z-index: 1; top: 18px; left: 18px; gap: 7px; }
  .finalist-campaign .finalist-lockup b { font-size: 22px; }
  .finalist-lockup-light { color: var(--ivory); }
  .finalist-campaign > p { position: absolute; z-index: 1; right: 18px; bottom: 16px; left: 18px; margin: 0; font-family: 'Newsreader Study', Georgia, serif; font-size: clamp(38px, 5vw, 58px); font-weight: 500; line-height: .9; letter-spacing: -.05em; }
  .name-reality { margin-top: 14px; border: 1px solid var(--line); }
  .name-reality-heading { min-height: 72px; padding: 18px 20px; display: grid; grid-template-columns: minmax(160px,.6fr) minmax(0,1.5fr); gap: 24px; border-bottom: 1px solid var(--line); }
  .name-reality-heading > span { font-size: 9px; font-weight: 680; letter-spacing: .13em; text-transform: uppercase; }
  .name-reality-heading > p { max-width: 600px; margin: 0; font-size: 11px; line-height: 1.45; }
  .name-reality-grid { display: grid; grid-template-columns: 1fr 1fr; }
  .name-reality-grid > article { min-width: 0; padding: 22px; }
  .name-reality-grid > article + article { border-left: 1px solid var(--line); }
  .name-reality-grid header { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .name-reality-grid header strong { font-family: 'Newsreader Study', Georgia, serif; font-size: 32px; font-weight: 500; letter-spacing: -.04em; }
  .signal { padding: 5px 7px; border-radius: 2px; font-size: 8px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
  .signal-neutral { color: #285f4c; background: rgba(40,95,76,.09); }
  .signal-risk { color: var(--red); background: rgba(211,41,58,.08); }
  .name-reality-grid p { min-height: 72px; margin: 20px 0; font-size: 12px; line-height: 1.55; }
  .name-reality-grid small { display: block; color: rgba(16,42,76,.58); font-size: 9px; line-height: 1.5; }
  .decision-study { padding-block: clamp(78px, 9vw, 110px); border-bottom: 1px solid var(--line); }
  .decision-grid { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid var(--line); border-left: 1px solid var(--line); }
  .decision-card { min-width: 0; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .decision-card > header { min-height: 52px; padding: 0 18px; display: flex; align-items: center; gap: 13px; }
  .decision-card > header span { color: var(--red); font-size: 9px; }
  .decision-card > header strong { font-size: 9px; letter-spacing: .12em; text-transform: uppercase; }
  .decision-card > header small { margin-left: auto; padding: 5px 7px; color: rgba(16,42,76,.58); background: rgba(16,42,76,.06); border-radius: 2px; font-size: 8px; letter-spacing: .08em; text-transform: uppercase; }
  .decision-recommended > header small { color: #285f4c; background: rgba(40,95,76,.09); }
  .decision-lockup { min-height: 230px; display: flex; align-items: baseline; justify-content: center; gap: 17px; background: var(--paper); }
  .decision-lockup :global(svg) { align-self: baseline; transform: translateY(16.40625%); }
  .decision-lockup b { font: 500 clamp(58px,7vw,82px)/.9 'Newsreader Study', Georgia, serif; letter-spacing: -.052em; }
  .decision-rationale { min-height: 146px; padding: 22px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; border-top: 1px solid var(--line); }
  .decision-rationale p { margin: 0; font-size: 11px; line-height: 1.55; }
  .decision-scales { display: grid; grid-template-columns: repeat(4,1fr); border-top: 1px solid var(--line); }
  .decision-scales > div { min-height: 108px; display: grid; place-items: center; align-content: center; gap: 8px; }
  .decision-scales > div + div { border-left: 1px solid var(--line); }
  .decision-scales span { color: rgba(16,42,76,.5); font-size: 8px; }
  .system-options { margin-top: 14px; border: 1px solid var(--line); }
  .system-options > header { min-height: 62px; padding: 0 18px; display: grid; grid-template-columns: minmax(160px,.6fr) minmax(0,1.5fr); align-items: center; gap: 24px; border-bottom: 1px solid var(--line); }
  .system-options > header span { font-size: 9px; font-weight: 680; letter-spacing: .13em; text-transform: uppercase; }
  .system-options > header p { margin: 0; font-size: 11px; }
  .system-option { min-height: 88px; padding: 12px 16px; display: grid; grid-template-columns: 32px minmax(170px,.9fr) 58px minmax(140px,.8fr) minmax(190px,1.2fr); align-items: center; gap: 16px; border-bottom: 1px solid var(--line); }
  .system-option:last-child { border-bottom: 0; }
  .system-option > span { color: var(--red); font-size: 9px; }
  .system-option > div:nth-child(2) { display: flex; align-items: baseline; gap: 8px; }
  .system-option > div:nth-child(2) :global(svg) { transform: translateY(16.40625%); }
  .system-option > div:nth-child(2) b { font: 500 27px/.9 'Newsreader Study', Georgia, serif; letter-spacing: -.045em; }
  .system-icon { width: 46px; height: 46px; display: grid; place-items: center; color: var(--ivory); background: var(--ink); border-radius: 10px; }
  .system-option p, .system-option small { margin: 0; font-size: 10px; }
  .system-option small { color: rgba(16,42,76,.55); }
  .system-winner { background: rgba(40,95,76,.035); }
  .system-reject { opacity: .58; }
  .decision-score { margin-top: 14px; border-top: 1px solid var(--line); border-right: 1px solid var(--line); border-left: 1px solid var(--line); }
  .decision-score > div { min-height: 52px; display: grid; grid-template-columns: 1.5fr 1fr 1fr; align-items: center; border-bottom: 1px solid var(--line); }
  .decision-score > div > * { height: 100%; padding: 0 18px; display: flex; align-items: center; border-left: 1px solid var(--line); font-size: 11px; }
  .decision-score > div > *:first-child { border-left: 0; }
  .decision-score .decision-score-head { min-height: 36px; color: rgba(16,42,76,.58); }
  .decision-score .decision-score-head span { font-size: 8px; font-weight: 650; letter-spacing: .1em; text-transform: uppercase; }
  .final-verdict { min-height: 128px; padding: 24px; display: grid; grid-template-columns: minmax(170px,.6fr) minmax(0,1.8fr); gap: 24px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); border-left: 1px solid var(--line); background: var(--paper); }
  .final-verdict > span { font-size: 9px; font-weight: 680; letter-spacing: .13em; text-transform: uppercase; }
  .final-verdict > p { max-width: 760px; margin: 0; font: 400 clamp(21px,2.5vw,31px)/1.25 'Newsreader Study', Georgia, serif; letter-spacing: -.02em; }
  .gate-board { margin-top: 14px; border: 1px solid var(--line); background: var(--paper); }
  .gate-board > header, .gate-board > div { min-height: 58px; padding: 0 18px; display: grid; grid-template-columns: minmax(140px,.65fr) 90px minmax(0,1.5fr); align-items: center; gap: 18px; border-bottom: 1px solid var(--line); }
  .gate-board > header { grid-template-columns: minmax(140px,.65fr) minmax(0,1.5fr); }
  .gate-board > header span { font-size: 9px; font-weight: 680; letter-spacing: .13em; text-transform: uppercase; }
  .gate-board p { margin: 0; font-size: 10px; line-height: 1.45; }
  .gate-board > div strong { font-size: 10px; }
  .gate-board > div > span { width: max-content; padding: 5px 7px; border-radius: 2px; font-size: 8px; font-weight: 680; letter-spacing: .08em; text-transform: uppercase; }
  .gate-pass { color: #285f4c; background: rgba(40,95,76,.09); }
  .gate-hold { color: var(--red); background: rgba(211,41,58,.08); }
  .gate-board > footer { min-height: 92px; padding: 20px 18px; display: grid; grid-template-columns: minmax(140px,.65fr) minmax(0,1.5fr); align-items: start; gap: 18px; }
  .gate-board > footer strong { font: 500 22px/1.1 'Newsreader Study', Georgia, serif; letter-spacing: -.02em; }
  .production-master { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--line); }
  .production-master > header { min-height: 62px; padding: 0 18px; grid-column: 1 / -1; display: grid; grid-template-columns: minmax(140px,.65fr) minmax(0,1.5fr); align-items: center; gap: 18px; border-bottom: 1px solid var(--line); }
  .production-master > header span { font-size: 9px; font-weight: 680; letter-spacing: .13em; text-transform: uppercase; }
  .production-master p { margin: 0; font-size: 10px; line-height: 1.45; }
  .master-positive, .master-reversed { min-height: 250px; padding: 38px; display: grid; place-items: center; }
  .master-positive { background: var(--paper); border-right: 1px solid var(--line); }
  .master-reversed { background: var(--ink); }
  .master-positive img, .master-reversed img { width: min(100%, 360px); height: auto; }
  .production-master > footer { min-height: 106px; padding: 20px; grid-column: 1 / -1; display: flex; align-items: flex-end; gap: 26px; border-top: 1px solid var(--line); overflow-x: auto; }
  .production-master > footer img { flex: none; height: auto; }
  .production-master > footer p { margin-left: auto; white-space: nowrap; }
  .grove-direction { padding-block: clamp(78px, 9vw, 110px); }
  .campaign-hero { position: relative; min-height: clamp(520px, 67vw, 760px); overflow: hidden; color: var(--ivory); background: var(--ink); }
  .campaign-hero > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center; }
  .campaign-shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(4, 15, 28, .52) 0%, rgba(4, 15, 28, .04) 38%, rgba(4, 15, 28, .74) 100%); }
  .campaign-top { position: absolute; top: 32px; left: 34px; }
  .photo-credit { position: absolute; top: 35px; right: 34px; color: rgba(247,243,233,.74); font-size: 8px; letter-spacing: .08em; text-decoration: none; text-transform: uppercase; }
  .campaign-copy { position: absolute; right: 36px; bottom: 38px; left: 48%; }
  .campaign-copy i { width: 42px; height: 4px; display: block; margin-bottom: 18px; background: var(--red); border-radius: 1px; }
  .campaign-copy p { margin: 0; font-family: 'Source Serif 4', Georgia, serif; font-size: clamp(58px, 8vw, 96px); line-height: .9; letter-spacing: -.05em; }
  .campaign-copy small { display: block; margin-top: 18px; font-size: 13px; font-weight: 620; letter-spacing: .08em; text-transform: uppercase; }
  .identity-grid { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr .8fr; gap: 14px; }
  .identity-card { min-height: 260px; padding: 24px; display: flex; flex-direction: column; justify-content: space-between; border: 1px solid var(--line); }
  .identity-card > span, .identity-card > small { font-size: 9px; font-weight: 650; letter-spacing: .14em; text-transform: uppercase; }
  .identity-card > small { opacity: .58; }
  .identity-paper { background: var(--paper); }
  .identity-ink { color: var(--ivory); background: var(--ink); border-color: var(--ink); }
  .display-lockup { display: flex; align-items: center; justify-content: center; gap: 15px; }
  .display-lockup strong { font-family: 'Source Serif 4', Georgia, serif; font-size: clamp(48px, 5vw, 68px); font-weight: 400; line-height: .9; letter-spacing: -.05em; }
  .identity-icon { display: grid; grid-template: auto 1fr auto / 1fr; align-items: start; }
  .identity-icon > .app-icon { place-self: center; }
  .identity-icon > div:last-child { display: grid; gap: 1px; }
  .identity-icon strong { font-size: 16px; }
  .identity-icon small { color: rgba(16, 42, 76, .58); font-size: 10px; }
  .app-icon-large { width: 96px; height: 96px; border-radius: 22px; }
  .product-proof { margin-top: 14px; border: 1px solid var(--line); background: var(--paper); }
  .product-proof > header { min-height: 76px; padding: 0 24px; display: flex; align-items: center; justify-content: space-between; gap: 24px; border-bottom: 1px solid var(--line); }
  .product-proof > header p { margin: 0; font-size: 9px; font-weight: 650; letter-spacing: .14em; text-transform: uppercase; }
  .product-screen { position: relative; overflow: hidden; border-bottom: 1px solid var(--line); }
  .product-screen > img { width: 100%; height: auto; display: block; }
  .screen-brand { position: absolute; z-index: 1; top: 2.7%; left: 1.65%; width: 10.4%; height: 5%; display: flex; align-items: center; gap: .55vw; color: var(--ink); background: #eee9df; }
  .screen-brand :global(svg) { width: clamp(8px, 1.95vw, 23px); height: clamp(8px, 1.95vw, 23px); flex: none; }
  .screen-brand span { font-size: clamp(5px, 1.38vw, 16px); font-weight: 670; }
  .product-proof > footer { min-height: 88px; padding: 20px 24px; display: flex; align-items: center; justify-content: space-between; gap: 36px; }
  .product-proof > footer p { max-width: 680px; margin: 0; font-size: 13px; line-height: 1.5; }
  .product-proof > footer span { flex: none; font-size: 9px; font-weight: 650; letter-spacing: .14em; text-transform: uppercase; }
  .campaign-pair { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .statement-card, .image-card { position: relative; min-height: 520px; padding: 30px; overflow: hidden; }
  .statement-card { display: flex; flex-direction: column; justify-content: space-between; color: var(--ivory); background: var(--ink); }
  .statement-card p, .image-card > p { margin: auto 0; font-family: 'Source Serif 4', Georgia, serif; font-size: clamp(48px, 5vw, 68px); line-height: .96; letter-spacing: -.045em; }
  .statement-card small { font-size: 10px; font-weight: 650; letter-spacing: .14em; text-transform: uppercase; }
  .image-card { color: var(--ivory); background: var(--ink); }
  .image-card::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(4,15,28,.5), rgba(4,15,28,.04) 45%, rgba(4,15,28,.58)); }
  .image-card > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 56% center; }
  .image-card-lockup, .image-card > p { position: relative; z-index: 1; }
  .image-card > p { position: absolute; right: 30px; bottom: 30px; left: 30px; margin: 0; }
  .candidate-list { border-top: 1px solid var(--line); }
  .candidate { padding-block: clamp(48px, 6vw, 70px); border-bottom: 1px solid var(--line); }
  .candidate > header { margin-bottom: 22px; display: grid; grid-template-columns: 70px 1fr; align-items: baseline; }
  .candidate > header span { color: var(--red); font-size: 11px; letter-spacing: .13em; }
  .candidate > header h3 { margin: 0; font-size: 12px; font-weight: 680; letter-spacing: .13em; text-transform: uppercase; }
  .primary-lockup { min-height: 240px; padding: 36px; display: flex; align-items: center; justify-content: center; gap: 20px; overflow: hidden; color: var(--ink); background: var(--paper); border: 1px solid rgba(16, 42, 76, .13); }
  .primary-lockup > span { font-family: 'Source Serif 4', Georgia, serif; font-size: clamp(64px, 8vw, 88px); line-height: .86; letter-spacing: -.05em; }
  .context-row { margin-top: 14px; display: grid; grid-template-columns: 1.15fr .8fr 1fr; gap: 14px; }
  .nav-context, .reversed-context, .store-context { min-height: 82px; border: 1px solid var(--line); }
  .nav-context { padding: 0 18px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
  .small-lockup { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
  .small-lockup > span { font-family: 'Source Serif 4', Georgia, serif; font-size: 21px; letter-spacing: -.04em; }
  .nav-context nav { display: flex; gap: 12px; color: rgba(16, 42, 76, .55); font-size: 9px; }
  .nav-context nav b { color: var(--ink); }
  .reversed-context { padding: 0 18px; display: flex; align-items: center; justify-content: space-between; gap: 18px; color: var(--ivory); background: var(--ink); border-color: var(--ink); }
  .reversed-context small { max-width: 90px; text-align: right; font-size: 8px; line-height: 1.3; letter-spacing: .08em; text-transform: uppercase; }
  .store-context { padding: 12px 14px; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 11px; }
  .app-icon { width: 54px; height: 54px; display: grid; place-items: center; color: var(--ivory); background: var(--ink); border-radius: 12px; box-shadow: 0 7px 14px rgba(4,16,30,.14), inset 0 1px rgba(255,255,255,.16); }
  .store-context > div:nth-child(2) { min-width: 0; display: grid; gap: 2px; }
  .store-context strong { overflow: hidden; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
  .store-context div span { color: rgba(16, 42, 76, .6); font-size: 10px; }
  .store-context i { min-width: 42px; padding: 5px 8px; text-align: center; color: #2459a9; background: rgba(36, 89, 169, .09); border-radius: 14px; font-size: 10px; font-style: normal; font-weight: 700; text-transform: uppercase; }
  .memory-test { padding-block: clamp(78px, 9vw, 110px); color: var(--ivory); background: var(--ink); }
  .memory-heading { margin-bottom: 46px; }
  .memory-heading .eyebrow, .memory-heading div > p { color: rgba(247,243,233,.72); }
  .word-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid rgba(247,243,233,.25); border-left: 1px solid rgba(247,243,233,.25); }
  .word-grid span { min-height: 150px; padding: 24px; display: flex; align-items: center; justify-content: center; border-right: 1px solid rgba(247,243,233,.25); border-bottom: 1px solid rgba(247,243,233,.25); font-family: 'Source Serif 4', Georgia, serif; font-size: clamp(38px, 5vw, 58px); letter-spacing: -.045em; }
  .sentences { border-top: 1px solid var(--line); }
  .sentences p { margin: 0; padding: 24px 0; border-bottom: 1px solid var(--line); font-family: 'Source Serif 4', Georgia, serif; font-size: clamp(25px, 3.5vw, 40px); line-height: 1.2; letter-spacing: -.025em; }
  .sentences span { color: var(--red); }
  .name-study > footer { padding-block: 28px 44px; display: flex; align-items: center; justify-content: space-between; gap: 24px; border-top: 1px solid var(--line); font-size: 12px; }
  .name-study > footer p { margin: 0; }
  .name-study > footer a { color: inherit; text-underline-offset: 4px; }

  @media (max-width: 900px) {
    .mark-grid { grid-template-columns: 1fr; }
    .mark-card { display: grid; grid-template-columns: minmax(220px, .8fr) 1.2fr; }
    .mark-card > header, .mark-card > p, .wordmark-tests { grid-column: 2; }
    .mark-stage { grid-row: 1 / span 3; min-height: 100%; border-right: 1px solid var(--line); }
    .serif-grid { grid-template-columns: 1fr; }
    .serif-card { display: grid; grid-template-columns: minmax(260px, .9fr) 1.1fr; }
    .serif-card > header, .serif-nav, .glyph-test, .serif-card > p { grid-column: 2; }
    .serif-pair { grid-row: 1 / span 4; }
    .identity-grid { grid-template-columns: 1fr 1fr; }
    .identity-icon { grid-column: 1 / -1; }
    .context-row { grid-template-columns: 1fr 1fr; }
    .store-context { grid-column: 1 / -1; }
  }

  @media (max-width: 760px) {
    .shell { width: min(calc(100% - 32px), 1160px); }
    .study-header { min-height: 68px; }
    .study-header p { max-width: 200px; text-align: right; font-size: 8px; }
    .intro, .section-heading { grid-template-columns: 1fr; gap: 28px; }
    h1 { font-size: clamp(58px, 18vw, 82px); }
    .mark-grid { border-top: 0; }
    .mark-card { display: block; }
    .mark-card > header, .mark-card > p, .wordmark-tests { grid-column: auto; }
    .mark-stage { min-height: 260px; border-right: 0; }
    .scale-test { grid-template-columns: 1fr; }
    .scale-test > header { min-height: 76px; border-right: 0; border-bottom: 1px solid var(--line); }
    .scale-row { grid-template-columns: 42px repeat(5, minmax(0, 1fr)); }
    .scale-row > strong { padding-left: 12px; }
    .engineering-analysis { grid-template-columns: 1fr; }
    .ratio-note { border-right: 0; border-bottom: 1px solid var(--line); }
    .metric-table { overflow-x: auto; }
    .metric-table > div { min-width: 580px; }
    .verdict-strip { grid-template-columns: 1fr; gap: 20px; }
    .wordmark-comparison { grid-template-columns: 1fr; }
    .wordmark-comparison > div { min-height: 210px; }
    .serif-grid { border-top: 0; }
    .serif-card { display: block; }
    .serif-card > header, .serif-nav, .glyph-test, .serif-card > p { grid-column: auto; }
    .serif-pair { grid-row: auto; }
    .serif-scale, .digital-test { grid-template-columns: 1fr; }
    .serif-scale > div:nth-child(n) { border-top: 1px solid var(--line); border-left: 0; }
    .serif-scale > div:first-child { border-top: 0; }
    .type-verdict, .digital-heading { grid-template-columns: 1fr; }
    .digital-card + .digital-card { border-top: 0; }
    .finalist-grid, .name-reality-grid { grid-template-columns: 1fr; }
    .name-reality-heading { grid-template-columns: 1fr; }
    .name-reality-grid > article + article { border-top: 1px solid var(--line); border-left: 0; }
    .finalist-contexts { grid-template-columns: 1fr; }
    .finalist-social { border-top: 1px solid var(--line); border-left: 0; }
    .decision-grid { grid-template-columns: 1fr; }
    .decision-rationale { min-height: 0; grid-template-columns: 1fr; }
    .decision-lockup { min-height: 200px; }
    .system-options > header, .final-verdict { grid-template-columns: 1fr; gap: 14px; padding-block: 18px; }
    .gate-board > header, .gate-board > div, .gate-board > footer { grid-template-columns: 1fr; gap: 9px; padding-block: 15px; }
    .production-master { grid-template-columns: 1fr; }
    .production-master > header { grid-template-columns: 1fr; gap: 9px; padding-block: 15px; }
    .master-positive { border-right: 0; border-bottom: 1px solid var(--line); }
    .master-positive, .master-reversed { min-height: 190px; padding: 30px; }
    .production-master > footer { gap: 22px; align-items: center; }
    .system-option { grid-template-columns: 26px 1fr 50px; gap: 10px; }
    .system-option p, .system-option small { grid-column: 2 / -1; }
    .campaign-hero { min-height: 560px; }
    .campaign-hero > img { object-position: 43% center; }
    .campaign-top { top: 22px; left: 20px; }
    .photo-credit { top: auto; right: 20px; bottom: 18px; }
    .campaign-copy { right: 20px; bottom: 60px; left: 20px; }
    .campaign-copy small { max-width: 240px; line-height: 1.4; }
    .identity-grid, .campaign-pair { grid-template-columns: 1fr; }
    .identity-icon { grid-column: auto; }
    .identity-card { min-height: 220px; }
    .statement-card, .image-card { min-height: 440px; padding: 24px; }
    .image-card > p { right: 24px; bottom: 24px; left: 24px; }
    .product-proof > header { min-height: 64px; padding-inline: 16px; }
    .product-proof > footer { padding: 18px 16px; align-items: flex-start; flex-direction: column; gap: 12px; }
    .candidate > header { grid-template-columns: 46px 1fr; }
    .primary-lockup { min-height: 190px; padding: 26px 16px; gap: 13px; }
    .primary-lockup :global(svg) { width: 56px; height: 56px; flex: none; }
    .primary-lockup > span { font-size: clamp(54px, 15vw, 68px); }
    .context-row { grid-template-columns: 1fr; }
    .store-context { grid-column: auto; }
    .nav-context nav { display: none; }
    .word-grid { grid-template-columns: 1fr 1fr; }
    .word-grid span { min-height: 112px; font-size: clamp(34px, 10vw, 46px); }
    .name-study > footer { align-items: flex-start; flex-direction: column; }
  }

  @media (max-width: 360px) {
    .primary-lockup { justify-content: flex-start; }
    .primary-lockup > span { font-size: 50px; }
    .word-grid { grid-template-columns: 1fr; }
  }
</style>
