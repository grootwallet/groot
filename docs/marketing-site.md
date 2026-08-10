# Marketing site

Status: canonical V1 direction for marketing structure, claims, and product proof. The SvelteKit implementation lives at `/marketing`; the product name and wordmark remain unresolved. Until they are selected, compositions use the approved symbol without a temporary name.

This document owns the public presentation layer. [`brand-identity.md`](brand-identity.md) owns identity, [`product-spec.md`](product-spec.md) owns product behavior, and [`implementation-status.md`](implementation-status.md) owns the evidence behind every capability claim.

## Objective

Present a serious Bitcoin self-custody product with enough clarity to earn further attention. The site must communicate control, rigor, recoverability, and long-term stewardship without fear, lifestyle language, or unsupported security claims.

The first page is not a complete manifesto. It is a concise argument supported by the real product.

## Release posture

The current build is a test-network product under active development. The site must not offer a mainnet download, imply production readiness, or describe browser fixtures as shipped native behavior.

Until the mainnet release gate is satisfied, every public product page carries this plain statement near its primary action:

> Test-network release. Mainnet is not enabled.

## Page structure and copy

### Header

- Approved symbol at the canonical minimum size or larger.
- Links: `Product`, `Principles`, `Security`, `Documentation`.
- Primary action before mainnet: `View development status`.
- Do not place a provisional name beside the symbol.

### Hero

Eyebrow:

> BITCOIN. IN YOUR HANDS.

Headline:

> Hold your own.

Body:

> Hold bitcoin on your terms. Know exactly what you’re signing. Know you can recover without us.

Actions:

- `See the product`
- `Read the security model`

Release note:

> Test-network release. Mainnet is not enabled.

The hero uses a full-bleed mountain photograph rather than a product capture. The scene is immense, exposed, cold, and credible: danger is visible, preparation matters, and the person remains small. It must not show victory, a summit celebration, manufactured fear, or glossy outdoor-apparel aspiration.

Supporting line near the lower rule:

> Self-custody, with proof at every step.

The first real Overview capture begins below the emotional opening. Do not recreate, simplify, beautify, or rearrange the interface for marketing.

### Position

Headline:

> Freedom needs structure.

Body:

> Bitcoin lets you hold money without asking anyone’s permission. That freedom only works when the keys, spending rules, backups, and recovery plan are truly yours. This wallet makes each one visible, verifiable, and portable.

No supporting illustration is required. Let typography and negative space carry this section.

### Product proof

Use four proof sections. Each section contains one short claim, no more than two supporting sentences, and one current product capture.

Lead:

> Your Bitcoin wallet should show its work.

#### 1. Protect bitcoin with multiple keys

> Create a standard 2-of-3 multisig wallet across independent hardware vendors. Inspect every public key and export the descriptor needed to recover without this app.

Proof visual: the current multisig Policy or setup-review surface. Any connected-device claim must be labeled with its actual evidence level; simulated devices may not appear as physically certified hardware.

#### 2. Know before you sign

> Before bitcoin moves, review the destination, amount, fee, selected coins, change, and signatures still required. The review comes from the actual unsigned transaction.

Proof visual: the current final Review & sign screen using disposable test-network data.

#### 3. Recover anywhere

> Export a standard public descriptor, verify that it rebuilds the same wallet, and rehearse recovery before you need it. Your backup is not tied to this app.

Proof visual: the current backup verification, descriptor backup, or recovery-drill surface. Do not present delayed-branch coordinator spending as released while it remains a V2 gate.

#### 4. Use your own Bitcoin node

> Choose the Bitcoin Core node that provides wallet balances and transaction history. Remote access requires HTTPS or Tor, and the wallet never silently falls back to a public server.

Proof visual: the current network settings surface with all credentials, addresses, node locations, and identifying data replaced by disposable fixtures.

### Principles

Use a quiet five-line list. These are commitments, not feature cards.

> Your keys remain your authority.  
> Every security claim comes with evidence.  
> Recovery works beyond this app.  
> Privacy protects your security.  
> Every dependency has an exit.

### Security architecture

Headline:

> Security starts at the boundary.

Introduction:

> Critical decisions stay in the native wallet core. The interface asks, displays, and confirms. It does not hold the keys or invent transaction truth.

Keep this section compact and mechanism-led:

1. **Keys stay out of the interface.** Mnemonic words, seeds, private descriptors, and decrypted signing material never enter the webview. Software-wallet secrets are created and used inside the native Rust boundary.
2. **Every transaction is checked in Rust.** Review data comes from the persisted unsigned transaction. Inputs, fees, recipient, change, and wallet-owned outputs are validated again before signing or broadcast.
3. **Recovery does not depend on this app.** Standard BIP84 and BIP48 descriptors, PSBTs, and BSMS records keep wallet policy portable across compatible Bitcoin tools.
4. **Your node is the network boundary.** Each wallet connects to a Bitcoin Core node the user chooses. Local connections stay on loopback; remote connections require HTTPS or an explicit Tor proxy. There is no silent public fallback.

The implementation strip may name the current stack: SvelteKit, Tauri 2, Rust, BDK + Miniscript, SQLite, Bitcoin Core RPC, and HWI. It must carry the evidence qualifier:

> Test-network implementation. Physical-device and reproducible-release certification remain open.

### Closing

Headline:

> Make self-custody the standard.

Body:

> Hold bitcoin with keys you control, transactions you verify, and a recovery path that works without us.

Actions before mainnet:

- `Follow development`
- `Review the documentation`

Do not use wait-list scarcity, countdowns, user counts, asset totals, testimonials, audits, or partner logos until each is real and independently supportable.

## Visual direction

- Warm Ivory is the dominant marketing field; Blue Ink carries the symbol, headline type, and major structure.
- A reversed Blue Ink field may appear once per page, preferably at the closing section.
- The opening may instead use a dark, full-bleed alpine photograph with Warm Ivory type. The image must show scale, exposure, weather, rock, and snow with one human figure at most. The person is progressing carefully, not posing.
- Use authentic editorial photography from a reputable free-stock source such as Unsplash. Do not generate, composite, or artificially extend campaign photography for V1.
- Record the photographer, source page, original license, download date, and any crop or color treatment alongside the local asset. Prefer standard Unsplash License images over subscription-only Unsplash+ images, and credit the photographer in the site footer even when attribution is optional.
- Avoid visible apparel or equipment logos and recognizable faces. Do not select an image whose people, trademarks, artwork, or location would imply an endorsement.
- Mountain imagery is a campaign metaphor, not a lifestyle category. Use it once with conviction; do not scatter climbing equipment or adventure photography through the product-proof sections.
- Signal Red is limited to a short rule, index, or isolated editorial punctuation. It never decorates the symbol and never competes with semantic danger states inside product captures.
- Source Serif 4 carries headlines. Source Sans 3 carries navigation, body copy, captions, and actions.
- Use large areas of unoccupied space, a strict content grid, crisp one-pixel rules, and no decorative shadows.
- Avoid gradients, glass effects, coin imagery, padlocks, shields, server racks, anonymous hooded figures, rockets, candlesticks, circuit-board textures, and generic lifestyle photography.
- Motion may reveal a product capture or move between verified states. The symbol remains still.
- V1 motion is limited to short vertical content reveals, restrained image scale on hover, and direct interaction feedback. Respect `prefers-reduced-motion`; motion must never delay reading or obscure evidence labels.

## Product-image rules

- All product visuals come from the current wallet implementation.
- Capture desktop at `1180 × 780` and mobile at `390 × 844`.
- Use disposable regtest or test-network fixtures only.
- Never expose real addresses, descriptors, fingerprints, node endpoints, credentials, balances, transaction history, or device identifiers.
- Preserve the current layout, typography, spacing, radii, and shadows in every capture. Marketing may crop a capture but may not reconstruct it.
- Captions state the evidence level when relevant: `Browser fixture`, `Regtest`, `Physical device test`, or `Externally reviewed`.
- Do not show unfinished controls merely to imply future capability.

### Current campaign asset provenance

- Hero photograph: Luke Helgeson, [Unsplash source](https://unsplash.com/photos/M2DkvRbumM0), standard Unsplash License, downloaded 2026-08-09. Treatment: responsive crop plus a uniform dark overlay for text contrast; no generated fill or compositing.
- Product proof captures: temporary browser-prototype fixtures at `1180 × 780`, disposable regtest data, captured 2026-08-09. Their layout is known to trail the current product UI; replace the complete set before public release. The marketing page may scale or crop a capture but must not reconstruct its interface.

## Claim discipline

Avoid unqualified terms such as `secure`, `private`, `trustless`, `unhackable`, `military-grade`, `future-proof`, and `fully decentralized`.

Prefer mechanism and boundary:

- `Keys remain inside the trusted native boundary.`
- `Transaction review is derived from the unsigned transaction.`
- `Remote Core requires HTTPS or an explicit Tor proxy.`
- `Public descriptor backups can be recovered outside the app.`
- `Mainnet is not enabled.`

Every changed capability claim must be checked against [`implementation-status.md`](implementation-status.md) before publication.

## Naming boundary

The marketing system must work before a name is chosen. Do not use `Satchel` in new public marketing copy, create a temporary wordmark, or distort the symbol to suggest an initial.

Naming remains open. The current brief requires a familiar, memorable word or compact compound whose surface meaning relates closely to personal ownership, independence, disciplined freedom, or uncompromising standards. A historical reference that requires explanation is insufficient on its own.

## V1 deliverables

1. Responsive marketing page using this structure and exact initial copy.
2. Real desktop and mobile captures for the hero and four proof sections.
3. Public security-model and development-status destinations.
4. Metadata, social preview, favicon, and application links using canonical brand assets.
5. Accessibility, responsive, claim, privacy, and asset-provenance review before publication.
