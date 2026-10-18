# Design system

## Rules

- Compose existing UI from `src/lib/components/`. Device differences are content/actions, not bespoke fonts, cards, badges or identifier views. Before creating a new reusable component or font style, explain the verified gap and obtain the owner's approval.
- One primary action per state. Use plain, short, action-led copy; state a security consequence once. Put optional protocol detail behind disclosure.
- Durable page/dialog result plus toast. Empty, loading, offline, invalid and retry states are first-class; no artificial delay after a read completes.
- Rust owns financial and security facts. UI must not infer transaction ownership, signer identity, policy readiness or derivation.

## Foundations

Use locally bundled Source Sans 3, system sans fallback, and existing monospace for identifiers. No external fonts. Primary UI text is 13–16px; supporting text uses `--font-size-meta` (13px). 12px is limited to compact tags/technical identifiers; smaller text is print or nonessential notation.

The ordered imports in `src/app.css` load global foundations from `src/lib/styles/`. Those foundations own light/dark color, spacing and shared surfaces. Use semantic `--panel`, `--surface-control`, `--surface-inset`, `--surface-icon` and status tokens. Do not hard-code dark neutral surfaces or introduce arbitrary fonts/sizes. Blue marks action/current selection; amber marks attention; red marks error/destruction. Neutral surfaces stay opaque.

Shared radii: controls 10px, inset surfaces 12px, major panels 20px. Joined settings/list rows remain one container. Pills are status/policy chips, not general cards.

Motion clarifies transitions and never delays wallet authority. Respect reduced motion. Loading buttons retain visible text and `aria-busy`; skeletons match destination shape, never show fabricated zero results. Tooltips use the existing portal and stay within the viewport.

## CSS ownership

Keep private markup, state and responsive rules in the existing component or route's `<style>`. Routes own page arrangement; reusable components own their controls. Use ordinary scoped selectors for new private rules and semantic tokens for colors. Do not add a CSS framework or new styling dependency.

The preservation pass uses `:global(.name):where(.name)` for moved selectors: Svelte puts its scope hash inside `:where`, keeping the original selector weight while requiring the local owner. A descendant `:global(...)` stays constrained by that local root and can reach existing snippets, icons or child components. Keep this compatibility spelling when moving existing rules; simplify only with fresh visual comparison. A few private rules intentionally use normal scoped priority to retain their precedence over shared control/page defaults after extraction.

`src/lib/styles/README.md` lists the remaining shared contracts and exceptions. Keep their numbered import order. Global themes, reset, focus/reduced-motion rules, shared presentation patterns, animation names and public backup print layout remain global. Body portals retain scoped hashes; only their genuinely shared appearance is global. Do not blindly delete conditional, portal or print rules.

Source-contract tests resolve imports and component/route styles through `readUiStyles`; browser evidence verifies the compiled cascade. For preservation evidence run the opt-in matrix in `e2e/css-preservation.spec.ts` with separate `CSS_EVIDENCE_DIR` and `CSS_BASELINE_DIR` directories, then run the complete browser suite. See [CSS verification](testing/css-refactoring-5.3.md).

## Layout

Desktop: 224px rail and centered content. Mobile: four navigation destinations, safe-area spacing and keyboard-safe actions. Review at **1180×780** and **390×844** in both themes, including translated copy. Page content must not overflow horizontally; long tables/raw JSON scroll within their container.

Dialogs cover the usable window including desktop title-bar overlap, keep visible viewport padding and scroll their body. Hardware-signing dialogs are top-weighted on desktop; other dialogs center. Mobile uses the existing bottom sheet. Action grids respond to their card width without word fragmentation.

One primary page title; no repetitive eyebrow/subtitle. Wallet Settings names the wallet. Build identity uses the existing shared copy control in rail, setup and Settings and must not cover actions.

## Reuse by task

| Task                       | Existing pattern                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| Forms and consent          | Modal, PasswordField, Button and existing labelled inputs, existing `modal-form` spacing |
| Warning/error              | WarningNotice; durable message, danger/warning tone, optional action/insight             |
| Hardware progress          | Shared hardware action panel with device instruction and accessible status               |
| Policy review              | SignerPolicyReview, shared signer lists and InstructionCard                              |
| Address comparison/details | HardwareAddressComparison, ReadableAddress, existing derivation disclosure               |
| Long identifier            | Existing grouped identifier detail; preserve identifying ends and exact copy             |
| Date evidence              | LocalTimestamp; show date/time, not just “verified”                                      |
| Labels                     | Shared one-to-five token editor, suggestions and Tab commit                              |
| Insight                    | Existing portal tooltip and blue disclosure/chevron                                      |

Policy first-address registration uses the same address-detail component as Receive for every device. Addresses/xpubs group four characters with a short final remainder; copied values stay unspaced. Descriptor display/copy/export uses one receive/change multipath value.

Discovery **Select to identify** is amber. It does not mean verified membership. Saved policy/health/address evidence is dated; fresh identity proof remains necessary. Unavailable creation cards keep their description and display **Coming soon**, matching Assisted recovery.

Receive quorum failure shows WarningNotice and a prominent blue outlined InstructionCard with Open Policy. Delete acknowledgements follow DELETE with standard spacing. Scan decline opens node connection directly. These are shared patterns, not route-local replacements.

## Amounts, labels and privacy

Use integer sats and locale-aware formatting; tabular numerals prevent jitter. Overview balance and established amount-field/unit controls toggle BTC/sats. Other amounts follow the preference. One shared fee selector presents provenance once.

Permanent label assignments are immutable. Present known/mixed/unknown provenance and reuse explicitly. Self-transfer and consolidating values come from Rust. Discreet mode hides private values/actions without changing history. Recovery words remain native and never get a UI clipboard action.

## Language and accessibility

Say **bitcoin** for the asset, **Bitcoin** for the network, **wallet** for the tracked account, **hardware signer** for the device, and **signer**, not cosigner. Say “2 of 3 signatures,” not quorum. Reserve wallet passphrase for software/BIP39 and app PIN for hardware/multisig local protection. Neither a fingerprint nor public backup can spend.

EN/FR/ES use the central catalog for product copy, errors, toasts and accessible names. Never translate user names, labels or protocol data. Plurals use locale grammar.

Use semantic buttons/links, labelled fields, visible focus and accessible dialog containment. Enabled actions use the hand cursor; disabled controls remain readable. Targets are at least 38px desktop/44px touch. Normal text meets WCAG AA 4.5:1; primary text targets 7:1. QR codes retain fixed black/white contrast.

Command on Apple platforms and Ctrl elsewhere use the existing Settings shortcut reference. Lock/navigation shortcuts do not fire during text entry/dialogs. Zoom keeps standard behavior there and persists within 80–140%.

Native mobile full-screen setup reserves the top and landscape side safe areas before laying out its header. The mobile welcome home keeps the card's brand mark and omits the duplicate header lockup; network and settings remain visible, with 44-point touch targets. Native mobile uses a fixed viewport and prevents pinch zoom without blocking one-finger scrolling. Browser zoom and the desktop keyboard zoom described above remain available.

Mobile signer routes compose the existing InstructionCard, Button, PasswordField, QR, address and warning controls. InstructionCard may omit its title when the flow supplies an existing heading inside; its surface and spacing stay owned by that component. Shared foundation CSS and the earlier scoped ownership remain intact.
