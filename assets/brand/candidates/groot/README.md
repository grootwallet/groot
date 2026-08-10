# Groot identity adoption record

Status: **adopted 2026-08-10**. The approved production assets were promoted to the parent brand directory.

Canonical domain: **`usegroot.com`**. The acquired `grootbitcoin.com` and `grootwallet.com` domains are defensive redirects, not separate brand surfaces.

## Primary system

- Name: **Groot**
- Symbol: canonical **Control** mark
- Wordmark: **Newsreader Medium 500**, converted to outlines
- Primary color: Blue Ink `#102A4C`
- Reversed color: Warm Ivory `#F7F3E9`
- Accent: Signal Red stays outside the symbol and wordmark

## Canonical files

- [`../../lockup-horizontal-ink.svg`](../../lockup-horizontal-ink.svg) — primary positive lockup
- [`../../lockup-horizontal-reversed.svg`](../../lockup-horizontal-reversed.svg) — reversed lockup for dark fields and photography
- [`../../wordmark-ink.svg`](../../wordmark-ink.svg) — wordmark without the symbol
- [`../../wordmark-reversed.svg`](../../wordmark-reversed.svg) — reversed wordmark without the symbol

The application icon continues to use [`../../app-icon-layered-source.svg`](../../app-icon-layered-source.svg) and [`../../app-icon-legacy-source.svg`](../../app-icon-legacy-source.svg). The Control geometry is intentionally shared; no Groot-specific monogram is required.

## Construction

- The visible bottom of the Control path meets the wordmark baseline.
- The source mark's `21/128` lower canvas inset is compensated exactly; do not vertically center the raw SVG box.
- The lockup uses a 17-unit canvas gap at its 70-unit symbol size.
- Wordmark tracking is `-0.052em`, with Newsreader's native kerning preserved by HarfBuzz.
- Minimum digital width: **96 px** for the complete lockup. Below this, use the symbol alone.
- Minimum clear space: one scaled 18-unit symbol stroke on every side.

Do not retype the name in a nearby serif, move the symbol by eye, stretch either element, add a container, recolor individual letters, or attach a tagline to the master lockup.

## Reproduction

The four SVGs contain outlined glyphs and make no font or network request. Regenerate them with:

```sh
python -m pip install fonttools uharfbuzz
python scripts/brand/export_groot_wordmark.py \
  --font static/fonts/newsreader-500.ttf \
  --output assets/brand
```

Review generated lockups visually before accepting any change. This directory remains only as the dated approval record; do not restore duplicate production masters here.
