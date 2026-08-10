# Satchel design system

Status: canonical UI guidance for the current desktop/mobile application.

The symbol, application icon, identity palette, and brand voice are canonical in [`brand-identity.md`](brand-identity.md). Naming and the wordmark remain provisional there. This document continues to own product layout, components, states, accessibility, and semantic color behavior.

## Direction

Satchel combines calm, task-focused desktop density with restrained native-utility conventions. It should feel quiet, fast, and explicit about security state. Blue Ink and Warm Ivory carry the identity, Action Blue directs interaction, and restrained Signal Red marks rare identity or high-consequence emphasis. Bitcoin amber is reserved for Bitcoin-specific or attention-worthy state.

## Principles

1. One primary action per state. Secondary and destructive actions must be visually distinct.
2. Put the durable result in the page. Toasts acknowledge events but never carry the only copy of an error or success state.
3. Show plain-language policy before descriptors, fingerprints, or PSBT terminology.
4. Never suggest that a coordinator can sign. Copy says which device is needed and how many signatures remain.
5. Use progressive disclosure for long addresses, xpubs, descriptors, and transaction IDs while preserving copy/export access.
6. Empty, loading, offline, invalid, and retry states are designed states—not exceptions.

Hardware operations use the shared animated hardware-action panel wherever Satchel is waiting on discovery, public-key import, device unlock, saved-identity health checks, address approval, or transaction signing. The panel names the current action, states what the user must do on the external device, exposes a polite live status to assistive technology, and respects reduced-motion preferences. Device- and network-specific instructions may refine its copy, but must not replace this common interaction pattern with a static icon or button-only spinner.

## Foundations

- Dark background `#0d1118`; panel `#131923`; raised panel `#182131`. Light mode uses warm paper `#f4f1e9` and ivory panels.
- French blue `#2459a9` is the interactive accent; French red `#d3293a` marks high-consequence emphasis. Bitcoin amber `#e3aa19` is semantic, not decorative.
- Red may also provide restrained identity cues—eyebrows, locked-state labels, a two-pixel edge, or a low-chroma tint—when the copy clearly describes a neutral state. Solid red surfaces and red error copy remain reserved for destructive actions and failures.
- System sans-serif for dense UI, Iowan Old Style/Baskerville/Georgia for display headings, and system monospace for identifiers. No network font is required.
- Primary UI copy is 12–14 pixels. Supporting copy may reach 10 pixels on desktop but should be at least 11 pixels on mobile; smaller type is reserved for print metadata and nonessential technical notation. Do not make the interface feel quieter by making required copy difficult to read.
- Seven-to-fourteen-pixel radii; avoid pills except status/policy chips.
- Motion is limited to 140–220 ms state transitions, a restrained modal-panel rise, toasts, disclosure panels, newly revealed list rows, and sync indicators. Modal backdrops render at their final opacity immediately because animating opacity together with backdrop blur can flash in desktop webviews. Initial wallet, transaction, and coin reads use shape-matched skeletons so the interface never presents false zero or empty states. Skeleton shimmer remains low contrast and never blocks an already rendered snapshot. Motion should clarify a state change rather than decorate a static page. `prefers-reduced-motion` removes meaningful movement and shimmer globally.

Tokens live in `src/app.css`. Component surfaces must use semantic tokens such as `--panel`, `--surface-control`, `--surface-inset`, and `--surface-icon`; hard-coded dark neutral backgrounds are prohibited because they break light mode. Reusable behavior belongs in `src/lib/components`; route files may compose components but must not introduce wallet policy.

## Layout

Desktop uses a 224-pixel persistent navigation rail and a centered content area. Coordinator screens may use a main column plus a narrow safety sidebar. Mobile removes the rail, uses four fixed navigation destinations, preserves safe-area padding, and places high-frequency Receive/Send actions above the tab bar.

Required review sizes are 1180×780 and 390×844. At mobile width, content must have no horizontal overflow, long identifiers must truncate or wrap, and actions must remain above the keyboard/safe area.

## Components and states

- Buttons: default, secondary, ghost, danger, and danger-outline. Disabled means unavailable for a visible reason—not a placeholder interaction.
- Fields: visible label, optional short help, inline error. Credential fields clear after each use.
- Modals: one decision or compact data-entry task; Escape/backdrop close; destructive confirmation names the consequence.
- Long modal bodies scroll independently while their headers remain visible. Nested or rapidly replaced dialogs must restore document scrolling after the last dialog closes.
- A modal whose optional details change its height preserves its initial desktop top edge so expansion grows downward instead of making the whole dialog jump. On mobile, expandable modals begin at the safe top inset and retain that position.
- Status chips: network, threshold, signer readiness, confirmation state. Color is never the only signal.
- Lists: whole-row interaction only when a details view exists. Otherwise use a semantic article or informational row.
- Navigation: the current destination uses a clearly contrasting blue-tinted surface and blue edge/icon in light mode, plus `aria-current`; selection must remain obvious without relying on color alone.
- Wallet switching uses a compact labeled list with an explicit active state; changing profiles never implies that the target wallet is unlocked. A desktop name that truncates exposes the complete name in a hover/focus tooltip. On desktop the list remains visible beside the selected wallet's focused unlock card. On mobile, unlocked Overview places a compact wallet selector beside its overflow action; its menu stays within the viewport. The unlock card never duplicates the complete wallet list, Back, or add-wallet controls. While locked, wallet-scoped navigation and Settings disappear. Theme and network status remain available; network details distinguish verified values from information that requires unlock.
- The wallet-list heading includes its count. A focused unlock card uses the wallet name as its primary heading, a red neutral `WALLET LOCKED` eyebrow, and a compact credential heads-up that is visually distinct from both the input and disabled action.
- Settings is scoped to the selected wallet. **Lock now** is the first standalone security action; backup requirements are explicitly information-only and never reveal recovery words or credentials. Profile switching and wallet creation remain in the persistent wallet list rather than being duplicated inside Settings.
- QR: real encoded image, high contrast, click-to-enlarge modal, and a copy fallback. The enlarged receive view groups the address into balanced three-to-four-character visual chunks, emphasizes its opening and closing groups, and states that spacing is visual only. Copy always receives the original unmodified address.
- Optional insight: derivation paths, descriptors, and spending-path logic stay collapsed until requested. Defaults remain sufficient to complete the flow.
- Privacy insight: address reuse uses one compact amber status badge on each affected coin row, never a blocking page-level danger state. Linked-coin counts, confirmation metadata, identifiers, and the consequence remain inside optional coin details so the summary row stays action-focused.
- Keep Receive and Send visible on action-oriented wallet surfaces; mobile Activity and Settings omit the floating payment actions so they cannot cover history or controls. Place infrequent descriptor, export, and policy-lab actions in an accessible overflow menu that is never clipped by its card or viewport. Descriptor inspection leads with a standard portable multipath descriptor when one can be derived safely, then offers receive and change branches as optional detail.
- The policy-wallet overflow button is the canonical three-dot control everywhere: 38×38 pixels, horizontal 18-pixel ellipsis, neutral bordered surface, eight-pixel radius, and identical hover, focus, and expanded states. Overview uses that shared control left-aligned with its actions. Discreet mode stays in the desktop shell for quick amount hiding; language selection belongs in Settings so the rail does not overflow at compact desktop widths.
- Optional explanations use a small focusable insight control with a tooltip/popover, never unexplained jargon or a second competing primary action. Tooltip content supplements a visible label and is not required to complete the flow.
- Interface copy and control labels are non-selectable by default so dragging cannot highlight whole application surfaces. Editable fields and explicitly technical values—addresses, transaction IDs, URLs, descriptors, public keys, derivation paths, hashes, and recovery text—opt back into native text selection.
- Human-facing timestamps use a concise, unambiguous long-month date and local hour/minute without repeating “local time.” The native system tooltip exposes seconds, the exact IANA timezone, and the UTC equivalent on hover.
- Wallet-type choices use compact visual cards with an icon, a plain-language title, and one short consequence-focused subtitle. Do not detach explanatory lines below generic buttons.
- Multi-step wallet creation keeps a persistent labeled progress indicator visible. It distinguishes completed, current, and upcoming stages so users can estimate the remaining work without reading body copy.
- Every send flow uses the same labeled three-stage progress indicator: **Intent**, **Amount & fee**, and **Review & sign**. Intent leads with the permanent payment label before the recipient address. A compact signer strip remains visible below progress: software wallets identify Satchel on this device; external-hardware and multisig wallets show imported labels/models and shortened public fingerprints with the required threshold. Imported identity must not be styled as live device availability.
- Recovery words are concealed by default behind a private-place warning. Once explicitly revealed, their desktop grid reads down each column (1–8, 9–16, 17–24); fixed-width number and word columns keep every row aligned. Mobile uses the same column-first reading order in two columns.
- Recovery backup confirmation uses an empty numbered sequence and a shuffled word pool. Tap/click is the primary interaction; drag-and-drop is an enhancement, never the only way to reorder. Exact order marks the backup verified. **Verify later** remains visually secondary and produces a compact, persistent amber Overview/Settings status with a direct verification CTA; it never looks like successful verification.
- Long addresses, account public keys, and transaction identifiers preserve both identifying ends as `prefix…suffix` in compact rows. Activating an address or account public key reveals the full value in balanced visual groups with emphasized ends; copied data never contains display spacing.
- Theme: light/dark choice is functional, local-only, and follows system preference until explicitly selected.
- Language: English, French, and Spanish are local-only preferences selected under **Settings → App appearance**, persisted across launches, and applied before first paint. Shared shell navigation, recurring statuses, and count labels use the central catalog; wallet names, labels, addresses, and transaction data are never translated.
- Counts use locale-aware grammar. Never render forms such as “1 confirmations” or build translated plurals by appending an English suffix.
- Recovery words, credentials, descriptors, disabled actions, overlays, navigation, modals, and mobile controls must meet the same contrast requirements in both themes. Theme selection is applied before first paint.
- Toast: broadcast, received payment, first confirmation, copy, creation, deletion, connectivity, and recoverable failure.

## Voice

Use “bitcoin” for the asset and “Bitcoin” for the network/protocol. Prefer “2 of 3 signatures” to “quorum,” and “public account key” before “xpub.” Say **wallet passphrase** only for a Satchel-generated software wallet; it is part of the BIP39 backup and also unlocks Satchel. Say **app PIN** for multisig and external-hardware wallets; it protects local app data and is not a hardware passphrase or seed backup. Never imply that an app PIN can recover a hardware wallet or that a public descriptor can spend.

Headings and controls should carry the flow whenever possible. Do not repeat a heading with a subtitle that merely restates it. Keep permanent consequences and recovery instructions explicit, but move protocol detail behind optional insight.

## Accessibility

- Semantic buttons/links and explicit form labels are required.
- Interactive targets should be at least 38 pixels desktop and 44 pixels on touch layouts.
- Focus indicators must remain visible against dark panels.
- Normal text must meet WCAG AA contrast (4.5:1); primary text tokens target 7:1. Fixed black/white QR rendering is the only component-level neutral palette exception.
- Dialog title/description and keyboard dismissal are required.
- All status changes need readable text and an appropriate live region when asynchronous.
- Secrets must not be placed in accessibility labels, notifications, screenshots, or copied automatically.
