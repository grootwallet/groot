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
- Red may also provide restrained identity cues—eyebrows, locked-state labels, a two-pixel edge, or a low-chroma tint—when the copy clearly describes a neutral state. Solid red surfaces and red error copy remain reserved for destructive actions and failures.
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
- Long modal bodies scroll independently while their headers remain visible. Nested or rapidly replaced dialogs must restore document scrolling after the last dialog closes.
- Status chips: network, threshold, signer readiness, confirmation state. Color is never the only signal.
- Lists: whole-row interaction only when a details view exists. Otherwise use a semantic article or informational row.
- Navigation: the current destination uses a clearly contrasting blue-tinted surface and blue edge/icon in light mode, plus `aria-current`; selection must remain obvious without relying on color alone.
- Wallet switching uses a compact labeled list with an explicit active state; changing profiles never implies that the target wallet is unlocked. On desktop the list remains visible beside the selected wallet's focused unlock card; the unlock card never duplicates the complete wallet list, Back, or add-wallet controls. While locked, wallet-scoped navigation and Settings disappear. Theme and network status remain available; network details distinguish verified values from information that requires unlock.
- The wallet-list heading includes its count. A focused unlock card uses the wallet name as its primary heading, a red neutral `WALLET LOCKED` eyebrow, and a compact credential heads-up that is visually distinct from both the input and disabled action.
- Settings is scoped to the selected wallet. **Lock now** is the first standalone security action; backup requirements are explicitly information-only and never reveal recovery words or credentials. Profile switching and wallet creation remain in the persistent wallet list rather than being duplicated inside Settings.
- QR: real encoded image, high contrast, click-to-enlarge modal, and a copy fallback. The enlarged receive view groups the address into balanced three-to-four-character visual chunks, emphasizes its opening and closing groups, and states that spacing is visual only. Copy always receives the original unmodified address.
- Optional insight: derivation paths, descriptors, and spending-path logic stay collapsed until requested. Defaults remain sufficient to complete the flow.
- Privacy insight: address reuse uses a compact amber notice on each affected coin row, never a blocking page-level danger state. Explain the consequence inside optional coin details; identifiers remain collapsed by default.
- Keep Receive and Send visible; place infrequent descriptor, export, and policy-lab actions in an accessible overflow menu that is never clipped by its card. Descriptor inspection leads with a standard portable multipath descriptor when one can be derived safely, then offers receive and change branches as optional detail.
- Optional explanations use a small focusable insight control with a tooltip/popover, never unexplained jargon or a second competing primary action. Tooltip content supplements a visible label and is not required to complete the flow.
- Human-facing timestamps use an unambiguous long-month format and identify local time. The exact IANA timezone and UTC equivalent remain available through optional insight.
- Wallet-type choices use compact visual cards with an icon, a plain-language title, and one short consequence-focused subtitle. Do not detach explanatory lines below generic buttons.
- Multi-step wallet creation keeps a persistent labeled progress indicator visible. It distinguishes completed, current, and upcoming stages so users can estimate the remaining work without reading body copy.
- Recovery words are concealed by default behind a private-place warning. Once explicitly revealed, their desktop grid reads down each column (1–8, 9–16, 17–24); fixed-width number and word columns keep every row aligned. Mobile uses the same column-first reading order in two columns.
- Recovery backup confirmation uses an empty numbered sequence and a shuffled word pool. Tap/click is the primary interaction; drag-and-drop is an enhancement, never the only way to reorder. The exact 24-word order is required before wallet creation continues.
- Long addresses and transaction identifiers preserve both identifying ends as `prefix…suffix` in compact rows. Activating an address reveals the full value in balanced visual groups with emphasized ends; copied data never contains display spacing.
- Theme: light/dark choice is functional, local-only, and follows system preference until explicitly selected.
- Language: English, French, and Spanish are local-only preferences persisted across launches and applied before first paint. Shared shell navigation, recurring statuses, and count labels use the central catalog; wallet names, labels, addresses, and transaction data are never translated.
- Counts use locale-aware grammar. Never render forms such as “1 confirmations” or build translated plurals by appending an English suffix.
- Recovery words, credentials, descriptors, disabled actions, overlays, navigation, modals, and mobile controls must meet the same contrast requirements in both themes. Theme selection is applied before first paint.
- Toast: broadcast, received payment, first confirmation, copy, creation, deletion, connectivity, and recoverable failure.

## Voice

Use “bitcoin” for the asset and “Bitcoin” for the network/protocol. Prefer “2 of 3 signatures” to “quorum,” and “public account key” before “xpub.” Say **wallet passphrase** only for a Satchel-generated software wallet; it is part of the BIP39 backup and also unlocks Satchel. Say **app PIN** for multisig and external-hardware wallets; it protects local app data and is not a hardware passphrase or seed backup. Never imply that an app PIN can recover a hardware wallet or that a public descriptor can spend.

## Accessibility

- Semantic buttons/links and explicit form labels are required.
- Interactive targets should be at least 38 pixels desktop and 44 pixels on touch layouts.
- Focus indicators must remain visible against dark panels.
- Normal text must meet WCAG AA contrast (4.5:1); primary text tokens target 7:1. Fixed black/white QR rendering is the only component-level neutral palette exception.
- Dialog title/description and keyboard dismissal are required.
- All status changes need readable text and an appropriate live region when asynchronous.
- Secrets must not be placed in accessibility labels, notifications, screenshots, or copied automatically.
