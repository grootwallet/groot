# Brand identity

Status: canonical V1 guidance for the adopted **Groot + Control + Newsreader Medium** identity, application icon, palette, and brand behavior. The 2026-08-10 adoption accepts the documented naming risk; it is not a claim of professional trademark clearance.

This document owns brand identity. [`design-system.md`](design-system.md) owns product-interface behavior. Brand work must not silently change wallet policy, information architecture, or security-state semantics.

## Foundation

### Core idea

Freedom becomes durable through discipline.

Self-custody is the first product expression of that belief. The product equips people to control bitcoin without depending on one coordinator, one hardware vendor, or one recovery path.

### Purpose

Equip people to carry freedom responsibly.

### Mission today

Make Bitcoin self-custody understandable, durable, private, and recoverable.

### Long-term promise

Give capable people tools that reduce dependence and expand what they can confidently control.

### Values

- **Sovereignty:** the user remains the authority.
- **Rigor:** security claims require evidence, not reassurance.
- **Stewardship:** protect families, work, and accumulated value with care.
- **Endurance:** design for recovery, interoperability, and the long term.
- **Restraint:** remove noise; keep every remaining element intentional.

### Personality

Composed, exacting, quietly ambitious, protective, human, and exceptionally competent.

The identity must not become crypto-neon, libertarian theater, institutional coldness, prepper paranoia, productivity-guru language, generic luxury, or vague empowerment.

## Symbol

The symbol is an abstract shelter, gateway, and protected opening. It is not a letterform and must not be forced into one.

### Master geometry

- Canvas: `128 × 128` units.
- Visible bounds: `x=10…118`, `y=21…107` (`108 × 86` units).
- Symmetry axis: `x=64`.
- Structural thickness: `18` units.
- Central opening: `28` units (`x=50…78`).
- Corner treatment: `R2` micro-soft corners.
- Master path:

```svg
M64 21A54 54 0 0 0 10 75V105Q10 107 12 107H48Q50 107 50 105V91Q50 89 48 89H30Q28 89 28 87V75A36 36 0 0 1 100 75V87Q100 89 98 89H80Q78 89 78 91V105Q78 107 80 107H116Q118 107 118 105V75A54 54 0 0 0 64 21Z
```

Do not redraw the symbol from strokes. Use the canonical filled path.

### Clear space

Keep at least one structural thickness (`18/128` of the symbol canvas) clear on every side. More space is preferred in marketing compositions.

### Minimum size

- Use the master at `24 px` and above.
- Use `mark-optical-small.svg` from `16–23 px`.
- Do not render the symbol below `16 px`.
- At small raster sizes, align the export to the target pixel grid; do not rely on a browser to downsample a large PNG.

### Approved colorways

1. Blue Ink symbol on Warm Ivory.
2. Warm Ivory symbol on Blue Ink.
3. Black or white monochrome only when the reproduction process requires one color.

The symbol never contains red. Do not add an underline, foundation bar, internal highlight, gradient, outline, shadow, glow, texture, or third color. Do not stretch, rotate, crop, or rearrange it.

## Application icon

The default icon is **Ink enamel**: a Warm Ivory symbol on a Blue Ink field.

- Keep the visible symbol near `60%` of tile width.
- Center the symbol geometrically and verify its optical vertical position at final export size.
- Modern Apple/platform source art is square, unmasked, and separated into an opaque background plus crisp foreground artwork. Icon Composer owns masks, Liquid Glass material, adaptive depth, and appearance variants.
- The current Tauri macOS bundle consumes a flattened ICNS rather than an Icon Composer file. Its rounded fallback therefore carries restrained enamel variation, an optical edge, and a bounded tile shadow so it retains material presence and the standard Dock footprint. These effects belong to the tile only; the symbol remains flat and unchanged.
- Do not bake platform-specific shadows or highlights into the symbol or the modern layered source.

Sources:

- [`assets/brand/app-icon-layered-source.svg`](../assets/brand/app-icon-layered-source.svg)
- [`assets/brand/app-icon-legacy-source.svg`](../assets/brand/app-icon-legacy-source.svg)
- [`src-tauri/icons/macos-icon-source.svg`](../src-tauri/icons/macos-icon-source.svg)

Regenerate cross-platform Tauri exports from the approved legacy source. For a macOS-only correction, generate into a temporary directory and replace only `icon.icns`, `32x32.png`, `64x64.png`, `128x128.png`, and `128x128@2x.png`:

```sh
pnpm tauri icon assets/brand/app-icon-legacy-source.svg --ios-color '#102A4C'
```

Do not edit exported PNG, ICNS, or ICO files by hand.

## Color

### Identity colors

| Role | Value | Use |
| --- | --- | --- |
| Blue Ink | `#102A4C` | Primary symbol, large identity fields, primary brand text |
| Warm Ivory | `#F7F3E9` | Reversed symbol, primary light field, warm negative space |
| Action Blue | `#2459A9` | Links, focus, selected state, and primary interaction |
| Signal Red | `#D3293A` | Rare brand punctuation and high-consequence emphasis |

Ink and ivory carry the identity. Action Blue directs interaction. Signal Red should normally occupy less than five percent of a composition and must not be used merely to make a page feel branded.

Identity red and semantic danger may share a value only when context and readable text make the meaning unambiguous. Never rely on color alone.

### Product colors

The wallet's existing semantic surface and status tokens remain canonical in [`src/app.css`](../src/app.css) and [`design-system.md`](design-system.md). Bitcoin amber is semantic, not a general brand accent. A brand rollout is not permission to recolor success, warning, danger, offline, signer, or confirmation states.

## Typography

The selected brand direction is **Unified Craft**:

- **Source Serif 4:** expressive brand and marketing headlines.
- **Source Sans 3:** brand body copy, navigation, captions, and explanatory text.
- **System monospace or IBM Plex Mono:** identifiers and technical notation only.

The wallet UI keeps its current system-sans and Iowan/Baskerville/Georgia stacks for V1 unless a later screen-by-screen audit demonstrates a clear improvement. The marketing route locally bundles the reviewed Source Sans 3 `3.052R` and Source Serif 4 `4.005R` files recorded in [`marketing-site.md`](marketing-site.md); it makes no runtime font request. This does not authorize Source-font adoption in the wallet, which still requires a separate screen-by-screen, payload, rendering, and cross-platform review. Network fonts are not permitted in the wallet.

### Wordmark

- **Name:** Groot.
- **Wordmark:** Newsreader Medium (`500`), stored as outlined SVG paths.
- **Symbol:** use the existing Control symbol in the horizontal lockup and application icon.
- **G Return:** retain as an exploration asset only. It is more distinctive alone but repeats the initial beside Groot and makes the identity dependent on a G name.
- **Operational study type:** Manrope may appear in the internal naming study for compact labels and metadata. It is not approved as a replacement for Source Sans 3 or the wallet UI stack.

The symbol canvas aligns to the wordmark baseline, then moves down by its exact `21/128` bottom inset (`16.40625%`) so the visible filled path—not the invisible SVG canvas—meets the baseline. This construction rule must replace ad hoc per-size offsets.

Study fonts remain locally bundled for the noindex archive at `/marketing/wordmark`. Product and marketing surfaces use the approved outlined lockup rather than live Newsreader text.

### Groot decision gate

Review date: 2026-08-10. This is a preliminary product screen, not legal advice or professional trademark clearance.

| Gate | Result | Decision |
| --- | --- | --- |
| Symbol | Pass | Advance the existing Control symbol. It is stronger in the lockup than G Return and remains useful if the name changes. |
| Wordmark | Pass, pending font QA | Advance Groot set in Newsreader Medium (`500`). Preserve the constructed visible-path baseline rule above. |
| Small sizes | Pass | Control remains the primary mark from 16 px upward; use the existing optical-small master below 24 px. |
| Domain | Pass, configuration pending | `usegroot.com`, `grootbitcoin.com`, and `grootwallet.com` were acquired. Use `usegroot.com` as the canonical public and email domain; redirect the other two after DNS is configured. |
| Market confusion | Material risk | A current Android finance application uses **Groot Pay** and describes itself as a digital wallet. The product category overlap is direct even though its custody model and market differ. |
| Trademark | Professional clearance required | Marvel has active US GROOT registrations and an active I AM GROOT registration covering downloadable media. Search exact and similar marks in the intended US, EU, UK, French, and Andorran markets and in software, financial, security, and SaaS classes before public adoption. |

**Adoption decision:** accept the recorded naming risk and adopt **Groot + Control + Newsreader Medium**. The outlined assets are canonical. Domain ownership is not represented as trademark clearance; professional review remains future legal/commercial work.

Typography does not compensate for weak hierarchy with extreme weight, tracking, or size. Headlines are concise. Required instructions remain comfortably readable.

## Composition and material

- Prefer generous negative space, strong alignment, and few elements.
- Use one dominant field and one clear focal point.
- Brand surfaces use crisp borders before shadows.
- Shadows are reserved for true elevation and platform-rendered icon material.
- R2 belongs to the symbol. It does not require every interface component to use a two-pixel radius.
- Product radii, spacing, and layout remain governed by [`design-system.md`](design-system.md).
- Motion should reveal state or structure; never animate the symbol continuously.

## Voice

Every word must earn its place.

- Be concise, honest, exact, and calm.
- State responsibility without fear theater.
- Explain what the product can verify and where trust still exists.
- Prefer concrete verbs: **verify**, **review**, **recover**, **sign**, **export**, **connect**.
- Never claim “secure,” “private,” “trustless,” or “future-proof” without naming the mechanism and limit.
- Say “bitcoin” for the asset and “Bitcoin” for the network or protocol.
- Do not speak as a lifestyle guru. The broader belief is expressed through the quality and usefulness of the product.

## Canonical assets

| File | Status |
| --- | --- |
| [`assets/brand/mark-master.svg`](../assets/brand/mark-master.svg) | Canonical positive master |
| [`assets/brand/mark-reversed.svg`](../assets/brand/mark-reversed.svg) | Canonical reversed master |
| [`assets/brand/mark-monochrome.svg`](../assets/brand/mark-monochrome.svg) | One-color reproduction master |
| [`assets/brand/mark-optical-small.svg`](../assets/brand/mark-optical-small.svg) | Canonical 16–23 px optical master |
| [`assets/brand/app-icon-layered-source.svg`](../assets/brand/app-icon-layered-source.svg) | Modern unmasked icon source |
| [`assets/brand/app-icon-legacy-source.svg`](../assets/brand/app-icon-legacy-source.svg) | Flattened export source |
| [`assets/brand/lockup-horizontal-ink.svg`](../assets/brand/lockup-horizontal-ink.svg) | Canonical positive Groot lockup |
| [`assets/brand/lockup-horizontal-reversed.svg`](../assets/brand/lockup-horizontal-reversed.svg) | Canonical reversed Groot lockup |
| [`assets/brand/wordmark-ink.svg`](../assets/brand/wordmark-ink.svg) | Canonical positive Groot wordmark |
| [`assets/brand/wordmark-reversed.svg`](../assets/brand/wordmark-reversed.svg) | Canonical reversed Groot wordmark |
| [`src/lib/components/BrandMark.svelte`](../src/lib/components/BrandMark.svelte) | Product component using the master path |
| [`src/lib/components/BrandLockup.svelte`](../src/lib/components/BrandLockup.svelte) | Shared product and marketing wordmark component |

## Status and roadmap

### Final for V1

- Symbol concept, geometry, thickness, R2 corners, and filled construction.
- Ink/ivory primary and reversed colorways.
- No red inside the symbol.
- Ink-enamel application-icon direction.
- Groot name and Newsreader Medium outlined wordmark.
- Core brand purpose, values, personality, and voice constraints.

### Separately gated

- Bundled Source-font adoption inside the wallet UI. Marketing-only bundling is complete.
- Marketing imagery and motion details.

### Next

1. Professionally review the remaining Groot trademark and market-confusion risk in target jurisdictions and financial/software categories.
2. Configure `usegroot.com` with registrar lock, hardware-key 2FA, automatic renewal, DNSSEC where supported, and privacy-preserving DNS; redirect `grootbitcoin.com` and `grootwallet.com` only after the canonical site is ready.
3. Establish the social-handle strategy and reserve the highest-value handles.
4. Optional wallet typography/color polish with layout held constant.
5. Final asset, documentation, accessibility, licensing, and cross-platform audit.

Superseding a final item requires updating this document and every affected canonical source/export in the same change.
