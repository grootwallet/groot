# Wallet / website design alignment proposal — 2026-09-08

Status: **direction approved; implemented in the existing application design system**.
The original proposal and synthetic concept below remain historical design-review
context, not native-wallet evidence. See [`design-refresh-2026-09-08.md`](design-refresh-2026-09-08.md)
for the implementation scope and checks; `design-system.md` owns adopted tokens.

## Verified reference

The marketing repository at `/Users/thibm/Documents/Codex/2026-07-17/groot-site`
is clean at `79aa7eda4826c5f9d665d0f331414671a6125cf0`, matching GitHub main
checked with `git ls-remote` on this date. The August-directory checkout at
`6e7a27f` is an older ancestor, not a newer design. References inspected include
`src/routes/marketing.css`, `docs/brand-system.md`, `docs/site-system.md`,
`MarketingButton.svelte`, `ProductWidget.svelte`, canonical logo/font assets and
the committed desktop hero screenshot. That screenshot is website visual-test
evidence, not proof of current native wallet appearance or release readiness.

The latest site uses Source Sans 3 throughout, Blue Ink `#102A4C`, crisp ivory
`#FBFBFA`, pale paper `#F2F3F4`, restrained warm ivory, 12px action corners and
18–22px card corners. Source Serif 4 is now limited to deliberate emphasis
fragments, not complete headings. Its photography, large editorial type and glass
layers serve marketing; they are not requirements for the wallet application.

## Recommended changes

| Area            | Wallet today                                                          | Proposed product adaptation                                                                                                                                                               |
| --------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typography      | System UI face; serif display headings                                | One locally bundled Source Sans 3 face for UI/headings, tabular amounts, existing monospace identifiers. No new serif font needed.                                                        |
| Light surfaces  | Warm paper and many similar bordered panels                           | Crisp ivory canvas, quiet paper rail, opaque ivory-blue/white content surfaces with fewer nested frames. Keep warm paper as a theme exploration.                                          |
| Dark surfaces   | Charcoal/slate                                                        | Deep Blue Ink neutrals with warm high-contrast text. This is a proposed product extension: the site is light-first, not a certified dark-mode token source.                               |
| Hierarchy       | Several competing borders and small labels                            | A clear wallet title, immediately visible saved signer identity, one dominant balance, compact actions, then the existing three recent transactions.                                      |
| Geometry        | Mostly 7–14px corners                                                 | 10–12px controls and 18–20px major containers, without rounding every row into a card. Preserve density and touch targets.                                                                |
| Color semantics | Neutral primary actions, blue navigation, red danger, amber attention | Blue Ink primary surface; blue links/selection; retain separate accessible success, warning and danger tokens. Do not copy the site's red download CTA into Send or Receive.              |
| Motion/material | Existing short functional transitions                                 | Keep current loading/navigation behavior and reduced-motion support. Avoid animated blur, parallax, glass stacks, photography, gradients behind transaction facts or a new startup delay. |

The proposed Overview keeps the current information architecture. It is not a
marketing landing page, dashboard expansion or new wallet feature. The one-page
concept uses explicitly synthetic Signet data; it can switch denomination, hide
amounts/labels, and explore light/dark appearance, density and connection display
states. It does not connect to a wallet, node or signer, and performs no send,
receive, clipboard or persistence operation. Saved signer identity is explicitly
not live device availability. Any new marketing screenshot must wait for approved
implementation and be captured from the real app; this concept is not that proof.

## Reuse existing components

No new reusable component is justified by this concept. Implementation should
change existing semantic tokens and compose the current owners:

- `BrandLockup`/`BrandMark`: preserve canonical geometry and positive/reversed assets.
- `AppShell`, `WalletProfileList`, `MobileWalletSwitcher`: rail, wallet selection,
  shortcuts, network/build identity and mobile navigation stay where they are.
- `Button` and existing route actions: retain disabled/loading semantics, focus,
  exact destinations, review gates and confirmation behavior.
- `Amount`, `TxList`, `PermanentLabelTags`, `LocalTimestamp`, `TxDetailsModal`:
  preserve integer amounts, one denomination preference, every permanent label,
  honest status text, inspectable identifiers and transaction drill-down.
- Existing signer/identifier, warning, draft/proposal and maturity surfaces remain
  functional. `WalletSkeleton`, `LoadFailure` and `EmptyState` retain their distinct
  meanings; independent loading must never collapse back to a full-page blocker.

The concept's lightweight markup is presentation-only conversation content, not a
second production component library or a route to be merged into the application.

## Non-functional and security acceptance before implementation

1. Bundle the existing site's 170,188-byte Source Sans 3 WOFF2 with its OFL notice
   and reviewed digest; no runtime font service, new frontend dependency or CSP
   origin. Check cold render and fallback geometry; do not delay wallet data for
   a font. The concept embeds that existing font and unchanged logos for offline
   review, but production assets have not been added to this wallet repository.
2. Keep normal text at least 4.5:1 contrast and focus/control boundaries visible;
   preserve 38px desktop and 44px touch targets. Site translucent muted colors
   must not be copied without checking their actual wallet backgrounds.
3. Check desktop 1180×780 and mobile 390×844 plus 320px, both themes, keyboard
   focus/zoom, reduced motion and English/French/Spanish expansion. Keep payment
   actions above keyboard/safe areas; do not hide security consequences to fit.
4. Check loading, empty, offline/stale, failed/retry, locked, wrong-wallet,
   backup-unverified, active draft/proposal and delayed-key authority states.
   No false zero balance, live-signer badge inferred from saved metadata, stale
   fingerprint crossing a wallet switch, or concealed recovery warning.
5. Keep all Rust, WalletPort and signing behavior unchanged. Require standard
   validation, accessibility/visual checks and the desktop/mobile browser suite
   before accepting any production skin update; physical webview checks remain
   necessary for keyboard, font rasterization and performance claims.

Recommended implementation sequence after design approval: foundations and
existing primitives first, Overview second, then propagate only proven patterns
to Activity/Coins/Send/Settings. Review each stage's functional and visual diff;
do not replace the component library or mix this with new wallet features.

## Concept checks, not production certification

The review-only Overview was rendered and manually inspected in light/dark themes
on desktop and mobile. Automated Chromium checks covered widths 1180, 1024 and
736; WebKit covered 390 and 320. There were no horizontal overflows, out-of-bounds
controls or JavaScript errors. The local Source Sans font loaded successfully.
Four representative text/surface pairs measured at least 6.06:1 in light mode and
9.16:1 in dark mode; this is not an exhaustive accessibility audit.

Local checks exercised sats/BTC formatting, hiding/restoring all sample amounts
and labels, offline/syncing presentation without replacing the saved balance,
and inert payment controls with explicit concept-only feedback. The desktop
concept fits within 1180×780; the mobile concept is a naturally scrolling view,
not a test of native fixed navigation, keyboard or safe-area behavior. The visual
skill's host design controls expose appearance, density and connection variants.
No production reusable components were added. QA logs/screenshots are under
`/tmp/groot-provenance-qa.iawq5c`.
