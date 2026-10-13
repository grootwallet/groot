# Brand identity

Status: canonical V1 guidance for the adopted **Groot + Control + Manrope 690** identity, application icon, palette, and brand behavior. The 2026-08-10 adoption accepts the documented naming risk; it is not a claim of professional trademark clearance.

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
- The legacy macOS fallback uses an `824 × 824` continuous-corner body on the `1024 × 1024` export canvas. That optical footprint reserves the surrounding space Apple needs for selection, Dock treatment, and the icon's own bounded shadow. Do not expand the body to the canvas edge or substitute a generic rounded rectangle.
- The current Tauri macOS bundle consumes a flattened ICNS rather than an Icon Composer file. Its fallback therefore carries restrained enamel variation, an optical rim, a bounded tile shadow, and a small separation shadow beneath the mark. The mark's canonical geometry remains unchanged; never add bevels, outlines, noise, or decorative texture to it.
- Do not bake platform-specific shadows or highlights into the symbol or the modern layered source.

Sources:

- [`assets/brand/app-icon-layered-source.svg`](../assets/brand/app-icon-layered-source.svg)
- [`assets/brand/app-icon-legacy-source.svg`](../assets/brand/app-icon-legacy-source.svg)
- [`assets/brand/app-icon-layers/`](../assets/brand/app-icon-layers/)
- [`src-tauri/icons/macos-icon-source.svg`](../src-tauri/icons/macos-icon-source.svg) (generated mirror)

Regenerate all Tauri exports through the checked-in pipeline. It uses the continuous-corner fallback for desktop formats, then replaces iOS assets with square unmasked renders so the operating system applies the mask exactly once:

```sh
pnpm brand:icons
```

Do not edit exported PNG, ICNS, or ICO files by hand.

## Color

### Identity colors

| Role        | Value     | Use                                                       |
| ----------- | --------- | --------------------------------------------------------- |
| Blue Ink    | `#102A4C` | Primary symbol, large identity fields, primary brand text |
| Warm Ivory  | `#F7F3E9` | Reversed symbol, primary light field, warm negative space |
| Action Blue | `#2459A9` | Links, focus, selected state, and primary interaction     |
| Signal Red  | `#D3293A` | Rare brand punctuation and high-consequence emphasis      |

Ink and ivory carry the identity. Action Blue directs interaction. Signal Red should normally occupy less than five percent of a composition and must not be used merely to make a page feel branded.

Identity red and semantic danger may share a value only when context and readable text make the meaning unambiguous. Never rely on color alone.

### Product colors

The wallet's existing semantic surface and status tokens remain canonical in [`src/app.css`](../src/app.css) and [`design-system.md`](design-system.md). Bitcoin amber is semantic, not a general brand accent. A brand rollout is not permission to recolor success, warning, danger, offline, signer, or confirmation states.

## Typography

The selected brand direction is **Unified Craft**:

- **Source Serif 4:** deliberate emphasis fragments in the separate `thibistaken/groot-site` repository; the latest site no longer uses it for complete headings.
- **Source Sans 3:** headings, brand body copy, navigation, captions, and explanatory text in `thibistaken/groot-site`, and the approved application UI described below.
- **System monospace or IBM Plex Mono:** identifiers and technical notation only.

The approved 2026-09-08 wallet refresh adopts one locally bundled, unmodified Source Sans 3.052R variable face for application headings and UI, with system fallback and system-monospace identifiers. The outlined Manrope wordmark is unchanged. This supersedes the initial wallet system-sans/serif-heading restriction following the separate Overview concept approval and application-wide review. Product tokens, screen checks, payload accounting and remaining physical-webview requirements are owned by [`design-system.md`](design-system.md) and [`design-refresh-2026-09-08.md`](design-refresh-2026-09-08.md). Marketing implementation remains exclusively in [`thibistaken/groot-site`](https://github.com/thibistaken/groot-site); the wallet does not import marketing routes or imagery. Network fonts are not permitted in the wallet.

### Wordmark

- **Name:** Groot.
- **Wordmark:** lowercase Manrope at variable weight `690`, stored as outlined SVG paths.
- **Symbol:** use the existing Control symbol in the horizontal lockup and application icon.
- **G Return:** retain as an exploration asset only. It is more distinctive alone but repeats the initial beside Groot and makes the identity dependent on a G name.
- **Runtime scope:** Manrope is approved only as the outlined identity wordmark. It is not approved as a replacement for Source Sans 3 or the wallet UI stack.

The wallet uses the approved outlined lockup rather than live Manrope text. Marketing and historical presentation studies belong in `thibistaken/groot-site`, not in a wallet route. The exact production values are also recorded in [`assets/brand/lockup-spec.json`](../assets/brand/lockup-spec.json), which the brand test reads directly.

### Formal lockup construction

The horizontal master has a `296.9966 × 96` view box. The Control source canvas is scaled from `128` to `70` units (`0.546875×`) and translated to `y=9.4844`. Its visible source bottom at `107/128` therefore lands at `y=68.0000`, the wordmark baseline. This visible-path baseline—not the bottom or center of the mark's source canvas—is the alignment invariant.

The wordmark is shaped from pinned Manrope 4.504 at weight `690`, using native kerning and `-0.082em` tracking, then converted to paths. Its em is `88.7727` construction units and its origin is `x=89.0909`, leaving a `19.0909`-unit gap after the 70-unit symbol canvas. The SVG includes the lowercase `g` descender and must never be cropped to the baseline.

Do not rebuild the lockup from separate mark and text elements, vertically center their boxes, retype the name, or apply per-surface offsets. Preserve the SVG aspect ratio, set width with height `auto`, and use `object-fit: contain` when an image-fit rule is required.

### Clear space and padding

Let `S` be the rendered width of the Control symbol canvas. One construction stroke is `C = S × 18/128`. Keep at least `1C` free of text, icons, borders, window chrome, and crops on every side; `2C` is the preferred container padding. The master SVG contains no external clear space, so the consuming layout must provide it.

For a complete lockup rendered at width `W`, `S = 0.235693W`, minimum clear space is `0.033144W`, and preferred clear space is `0.066289W`.

| Lockup width | Symbol canvas | Minimum `1C` | Preferred `2C` |
| ------------ | ------------- | ------------ | -------------- |
| 96 px        | 22.63 px      | 3.18 px      | 6.36 px        |
| 104 px       | 24.51 px      | 3.45 px      | 6.89 px        |
| 116 px       | 27.34 px      | 3.84 px      | 7.69 px        |
| 128 px       | 30.17 px      | 4.24 px      | 8.48 px        |
| 192 px       | 45.25 px      | 6.36 px      | 12.73 px       |

Clear space is a protected exclusion zone, not blank pixels that must be baked into an export. A larger page grid, navigation inset, or card padding may satisfy it. At final raster sizes, round outward rather than below the computed value.

### Size and asset selection

- Complete lockup: minimum `96 px` wide. Use the symbol alone below that width.
- Wordmark alone: minimum `80 px` wide and only where the Control symbol is already established nearby.
- Symbol: use `mark-master.svg` at `24 px` and above, `mark-optical-small.svg` at `16–23 px`, and never render below `16 px`.
- Application icon and favicon: use their dedicated sources; never place the horizontal lockup inside an icon tile.
- Large display use: scale the outlined SVG without a maximum size. Inspect final raster output for antialiasing and pixel-grid artifacts.

### Background and color selection

- Use `lockup-horizontal-ink.svg` on Warm Ivory, Warm Paper, white, or another quiet light field.
- Use `lockup-horizontal-reversed.svg` on Blue Ink or a quiet dark field.
- On photography, use the variant that maintains at least `4.5:1` contrast across the entire clear-space zone. Add one restrained local overlay when necessary; never add a stroke, glow, shadow, or plate directly to the logo.
- Keep symbol and wordmark one color. Signal Red, Action Blue, gradients, tints, transparency, and mixed letter colors are not identity-lockup treatments.
- Choose the variant from the effective rendered background, including translucent navigation layers. Do not rely on the underlying page color when blur or imagery changes the local field.

### Placement, accessibility, and motion

- Align the lockup as one image to the surrounding layout. Its internal baseline relationship is already solved; CSS baseline alignment applies only between the complete asset and neighboring content.
- Never crop, mask, distort, rotate, skew, outline, shadow, animate continuously, or attach a tagline to the master.
- Identity images use alt text `Groot`. When adjacent visible text already names Groot, use empty alt text to avoid repetition. A linked lockup is labelled `Groot home`.
- The only approved identity motion is the once-only 900 ms native startup reveal. Reduced-motion mode shows the static lockup. All navigation, sidebar, onboarding, and editorial uses remain static.

### Approved wallet placements

| Surface             | Asset           | Width                           | Treatment                                                    |
| ------------------- | --------------- | ------------------------------- | ------------------------------------------------------------ |
| Native startup gate | Complete lockup | 116 px                          | Centered on the neutral product background; once-only reveal |
| Desktop sidebar     | Complete lockup | 104 px artwork in a 120 px link | Static, left aligned, with an 8 px horizontal inset          |
| Mobile navigation   | Complete lockup | 96 px                           | Static; minimum complete-lockup size                         |
| Onboarding header   | Complete lockup | 104 px                          | Static; aligned as one outlined asset                        |

Any new wallet placement must use [`BrandLockup.svelte`](../src/lib/components/BrandLockup.svelte) or the canonical mark component rather than importing, copying, or reassembling logo geometry locally.

### Groot decision gate

Review date: 2026-08-10. This is a preliminary product screen, not legal advice or professional trademark clearance.

| Gate             | Result                          | Decision                                                                                                                                                                                                                                                                           |
| ---------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Symbol           | Pass                            | Advance the existing Control symbol. It is stronger in the lockup than G Return and remains useful if the name changes.                                                                                                                                                            |
| Wordmark         | Pass                            | Use the lowercase website wordmark in Manrope `690`, outlined from the pinned source. Preserve the measured visible-path baseline rule above.                                                                                                                                      |
| Small sizes      | Pass                            | Control remains the primary mark from 16 px upward; use the existing optical-small master below 24 px.                                                                                                                                                                             |
| Domain           | Pass, configuration pending     | `usegroot.com`, `grootbitcoin.com`, and `grootwallet.com` were acquired. Use `usegroot.com` as the canonical public and email domain; redirect the other two after DNS is configured.                                                                                              |
| Market confusion | Material risk                   | A current Android finance application uses **Groot Pay** and describes itself as a digital wallet. The product category overlap is direct even though its custody model and market differ.                                                                                         |
| Trademark        | Professional clearance required | Marvel has active US GROOT registrations and an active I AM GROOT registration covering downloadable media. Search exact and similar marks in the intended US, EU, UK, French, and Andorran markets and in software, financial, security, and SaaS classes before public adoption. |

**Adoption decision:** accept the recorded naming risk and adopt **Groot + Control + Manrope 690**. The outlined assets are canonical. Domain ownership is not represented as trademark clearance; professional review remains future legal/commercial work.

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

| File                                                                                            | Status                                  |
| ----------------------------------------------------------------------------------------------- | --------------------------------------- |
| [`assets/brand/mark-master.svg`](../assets/brand/mark-master.svg)                               | Canonical positive master               |
| [`assets/brand/mark-reversed.svg`](../assets/brand/mark-reversed.svg)                           | Canonical reversed master               |
| [`assets/brand/mark-monochrome.svg`](../assets/brand/mark-monochrome.svg)                       | One-color reproduction master           |
| [`assets/brand/mark-optical-small.svg`](../assets/brand/mark-optical-small.svg)                 | Canonical 16–23 px optical master       |
| [`assets/brand/app-icon-layered-source.svg`](../assets/brand/app-icon-layered-source.svg)       | Modern unmasked icon source             |
| [`assets/brand/app-icon-layers/`](../assets/brand/app-icon-layers/)                             | Apple background and foreground layers  |
| [`assets/brand/app-icon-legacy-source.svg`](../assets/brand/app-icon-legacy-source.svg)         | Flattened export source                 |
| [`assets/brand/lockup-horizontal-ink.svg`](../assets/brand/lockup-horizontal-ink.svg)           | Canonical positive Groot lockup         |
| [`assets/brand/lockup-horizontal-reversed.svg`](../assets/brand/lockup-horizontal-reversed.svg) | Canonical reversed Groot lockup         |
| [`assets/brand/wordmark-ink.svg`](../assets/brand/wordmark-ink.svg)                             | Canonical positive Groot wordmark       |
| [`assets/brand/wordmark-reversed.svg`](../assets/brand/wordmark-reversed.svg)                   | Canonical reversed Groot wordmark       |
| [`assets/brand/lockup-spec.json`](../assets/brand/lockup-spec.json)                             | Machine-readable geometry and usage law |
| [`src/lib/components/BrandMark.svelte`](../src/lib/components/BrandMark.svelte)                 | Product component using the master path |
| [`src/lib/components/BrandLockup.svelte`](../src/lib/components/BrandLockup.svelte)             | Wallet product wordmark component       |

## Status and roadmap

### Final for V1

- Symbol concept, geometry, thickness, R2 corners, and filled construction.
- Ink/ivory primary and reversed colorways.
- No red inside the symbol.
- Ink-enamel application-icon direction.
- Groot name and lowercase Manrope 690 outlined wordmark.
- Core brand purpose, values, personality, and voice constraints.

### Separately gated

- Physical packaged-webview acceptance of the approved bundled Source Sans wallet refresh. Browser checks do not establish native mobile certification.
- Marketing imagery and motion details.

### Next

1. Professionally review the remaining Groot trademark and market-confusion risk in target jurisdictions and financial/software categories.
2. Configure `usegroot.com` with registrar lock, hardware-key 2FA, automatic renewal, DNSSEC where supported, and privacy-preserving DNS; redirect `grootbitcoin.com` and `grootwallet.com` only after the canonical site is ready.
3. Establish the social-handle strategy and reserve the highest-value handles.
4. Optional wallet typography/color polish with layout held constant.
5. Final asset, documentation, accessibility, licensing, and cross-platform audit.

Superseding a final item requires updating this document and every affected canonical source/export in the same change.
