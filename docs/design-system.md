# Satchel design system

Status: canonical UI guidance for the current desktop/mobile application.

## Direction

Satchel combines Wasabi Wallet's calm, task-focused desktop density with the restraint of the Codex app and shadcn conventions. It should feel like a small native utility: quiet, fast, and explicit about security state. A restrained French blue/ivory/red signature gives it identity in both light and dark themes; Bitcoin amber is reserved for Bitcoin-specific or attention-worthy state.

## Principles

1. One primary action per state. Secondary and destructive actions must be visually distinct.
2. Put the durable result in the page. Toasts acknowledge events but never carry the only copy of an error or success state.
3. Show plain-language policy before descriptors, fingerprints, or PSBT terminology.
4. Never suggest that a coordinator can sign. Copy says which device is needed and how many signatures remain.
5. Use progressive disclosure for long addresses, xpubs, descriptors, and transaction IDs while preserving copy/export access.
6. Empty, loading, offline, invalid, and retry states are designed states—not exceptions.

## Foundations

- Dark background `#0d1118`; panel `#131923`; raised panel `#182131`. Light mode uses warm paper `#f4f1e9` and ivory panels.
- French blue `#2459a9` is the interactive accent; French red `#d3293a` marks high-consequence emphasis. Bitcoin amber `#e3aa19` is semantic, not decorative.
- System sans-serif for dense UI, Iowan Old Style/Baskerville/Georgia for display headings, and system monospace for identifiers. No network font is required.
- Seven-to-fourteen-pixel radii; avoid pills except status/policy chips.
- Motion is limited to short state transitions, toasts, and sync indicators. Respect reduced motion when animations expand.

Tokens live in `src/app.css`. Component surfaces must use semantic tokens such as `--panel`, `--surface-control`, `--surface-inset`, and `--surface-icon`; hard-coded dark neutral backgrounds are prohibited because they break light mode. Reusable behavior belongs in `src/lib/components`; route files may compose components but must not introduce wallet policy.

## Layout

Desktop uses a 224-pixel persistent navigation rail and a centered content area. Coordinator screens may use a main column plus a narrow safety sidebar. Mobile removes the rail, uses four fixed navigation destinations, preserves safe-area padding, and places high-frequency Receive/Send actions above the tab bar.

Required review sizes are 1180×780 and 390×844. At mobile width, content must have no horizontal overflow, long identifiers must truncate or wrap, and actions must remain above the keyboard/safe area.

## Components and states

- Buttons: default, secondary, ghost, danger, and danger-outline. Disabled means unavailable for a visible reason—not a placeholder interaction.
- Fields: visible label, optional short help, inline error. Credential fields clear after each use.
- Modals: one decision or compact data-entry task; Escape/backdrop close; destructive confirmation names the consequence.
- Status chips: network, threshold, signer readiness, confirmation state. Color is never the only signal.
- Lists: whole-row interaction only when a details view exists. Otherwise use a semantic article or informational row.
- QR: real encoded image, high contrast, click-to-enlarge modal, human-readable address beside it, and a copy fallback.
- Optional insight: derivation paths, descriptors, and spending-path logic stay collapsed until requested. Defaults remain sufficient to complete the flow.
- Theme: light/dark choice is functional, local-only, and follows system preference until explicitly selected.
- Recovery words, credentials, descriptors, disabled actions, overlays, navigation, modals, and mobile controls must meet the same contrast requirements in both themes. Theme selection is applied before first paint.
- Toast: broadcast, received payment, first confirmation, copy, creation, deletion, connectivity, and recoverable failure.

## Voice

Use “bitcoin” for the asset and “Bitcoin” for the network/protocol. Prefer “2 of 3 signatures” to “quorum,” “public account key” before “xpub,” and “app PIN” for a hardware-only coordinator. Never imply that an app PIN can recover a hardware wallet or that a public descriptor can spend.

## Accessibility

- Semantic buttons/links and explicit form labels are required.
- Interactive targets should be at least 38 pixels desktop and 44 pixels on touch layouts.
- Focus indicators must remain visible against dark panels.
- Normal text must meet WCAG AA contrast (4.5:1); primary text tokens target 7:1. Fixed black/white QR rendering is the only component-level neutral palette exception.
- Dialog title/description and keyboard dismissal are required.
- All status changes need readable text and an appropriate live region when asynchronous.
- Secrets must not be placed in accessibility labels, notifications, screenshots, or copied automatically.
