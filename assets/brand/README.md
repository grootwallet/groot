# Brand assets

The canonical usage rules and status live in [`docs/brand-identity.md`](../../docs/brand-identity.md).

- `mark-master.svg` — primary Blue Ink master for use at 24 px and above.
- `mark-reversed.svg` — Warm Ivory reversed master.
- `mark-monochrome.svg` — one-color reproduction master.
- `mark-optical-small.svg` — optically adjusted 16–23 px master.
- `app-icon-layered-source.svg` — unmasked 1024 px source for modern platform tooling.
- `app-icon-legacy-source.svg` — flattened rounded source for legacy/Tauri exports.
- `app-icon-layers/` — separate opaque background and transparent Control artwork for Apple Icon Composer.
- `lockup-horizontal-{ink,reversed}.svg` — canonical outlined Groot + Control lockups.
- `wordmark-{ink,reversed}.svg` — canonical outlined Groot wordmarks.
- `lockup-spec.json` — machine-readable construction, font, size, and clear-space specification.
- `source/manrope-variable.ttf` — pinned Manrope 4.504 variable source used only for outlined exports.
- `source/manrope-OFL.txt` — SIL Open Font License 1.1 for the pinned source.
- `candidates/groot/` — adoption record only; production masters live in this directory.

Do not edit exported PNG, ICNS, or ICO files by hand. Regenerate desktop and mobile outputs with `pnpm brand:icons`.
Do not retype or manually offset the wordmark. Regenerate the outlined masters with `scripts/brand/export_groot_wordmark.py`; `pnpm test:brand` verifies the font hash and baseline geometry.
The two runtime lockups are mirrored under `src/lib/assets/brand/` because the development server deliberately restricts imports outside `src/lib`; the brand gate requires those mirrors to remain byte-identical to these masters.

## Quick use

- Use the positive lockup on light fields and the reversed lockup on Blue Ink or another quiet dark field.
- Render the complete lockup at 96 px wide or larger; below that, use the symbol.
- Keep at least one scaled symbol stroke clear on every side and prefer two strokes of container padding. At lockup width `W`, those values are `0.033144W` and `0.066289W`.
- Preserve aspect ratio and the asset's full 96-unit height; the lowercase `g` descender is part of the artboard.
- Do not retype, separate, offset, recolor, crop, stretch, decorate, or continuously animate the lockup.

See [`docs/brand-identity.md`](../../docs/brand-identity.md#formal-lockup-construction) for the complete usage law, measurement table, accessibility guidance, and approved product placements.
