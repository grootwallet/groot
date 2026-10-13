# Design system

## Rules

- Compose existing UI from `src/lib/components/`. Device differences are content/actions, not bespoke fonts, cards, badges or identifier views. Before creating a new reusable component or font style, explain the verified gap and obtain the owner's approval.
- One primary action per state. Use plain, short, action-led copy; state a security consequence once. Put optional protocol detail behind disclosure.
- Durable page/dialog result plus toast. Empty, loading, offline, invalid and retry states are first-class; no artificial delay after a read completes.
- Rust owns financial and security facts. UI must not infer transaction ownership, signer identity, policy readiness or derivation.

## Foundations

Use locally bundled Source Sans 3, system sans fallback, and existing monospace for identifiers. No external fonts. Primary UI text is 13–16px; supporting text uses `--font-size-meta` (13px). 12px is limited to compact tags/technical identifiers; smaller text is print or nonessential notation.

Tokens in `src/app.css` own light/dark color, spacing and surfaces. Use semantic `--panel`, `--surface-control`, `--surface-inset`, `--surface-icon` and status tokens. Do not hard-code dark neutral surfaces or introduce arbitrary fonts/sizes. Blue marks action/current selection; amber marks attention; red marks error/destruction. Neutral surfaces stay opaque.

Shared radii: controls 10px, inset surfaces 12px, major panels 20px. Joined settings/list rows remain one container. Pills are status/policy chips, not general cards.

Motion clarifies transitions and never delays wallet authority. Respect reduced motion. Loading buttons retain visible text and `aria-busy`; skeletons match destination shape, never show fabricated zero results. Tooltips use the existing portal and stay within the viewport.

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
