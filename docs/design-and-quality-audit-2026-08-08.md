# Design and quality audit — 2026-08-08

Status: internal audit complete for the current regtest build. This is not physical-device certification, an independent security review, or mainnet authorization.

## Scope

- Core onboarding, unlock, overview, activity, coins, receive, send, multisig setup/signing, backup, and settings surfaces.
- Dark and light themes at 1180×780 desktop and 390×844 mobile viewports.
- Typography, spacing, hierarchy, copy density, keyboard focus, motion, reduced-motion behavior, responsive navigation, destructive confirmations, and durable error states.
- Wallet/webview boundaries, secret handling, dependency advisories, release gates, frontend and Rust policy coverage, and desktop/mobile end-to-end flows.

## Findings resolved

- Defined the missing focus and semantic blue tokens, removed undefined token references, and added a consistent visible keyboard focus treatment.
- Raised undersized operational text, restored readable multisig progress labels on mobile, and kept the active setup task above long safety guidance.
- Reduced redundant page and helper copy while retaining permanent-label, privacy, and destructive-action consequences.
- Added restrained modal entrance motion and a global reduced-motion fallback.
- Corrected payment-review address presentation, mandatory outgoing labels, hardware rescan and in-modal errors, Coldcard policy-registration recovery, receive-wallet routing, animated UR frames, local QR scanning, proposal cancellation confirmation, native PSBT saving, and proposal-preserving navigation confirmation.
- Stabilized the multisig coordinator end-to-end tests without weakening the asserted behavior.

## Result

The interface now uses one warm, paper-like light palette and one restrained navy dark palette with consistent spacing, controls, focus, and modal behavior. Copy is deliberately short; security-critical consequences remain explicit. No horizontal overflow was observed in the audited core routes or modals at the required viewports.

Static review found no route-level Tauri access, direct UI network calls, unsafe HTML injection, dynamic evaluation, secret persistence in browser storage, or floating-point wallet accounting. Browser storage remains limited to local display preferences. The production dependency advisory scan reported no known vulnerabilities.

## Verification

- `pnpm validate`
- `pnpm test:coverage`
- `pnpm test:coverage:rust`
- `cargo fmt --check`
- `cargo clippy --all-targets --all-features -- -D warnings`
- `cargo test --all-features`
- Playwright acceptance suite: 81 passed, 1 platform-conditional case skipped
- Production dependency audit: no known vulnerabilities

## Remaining release evidence

- Physical Coldcard, Trezor, Ledger, BitBox02, and Jade certification across supported operating systems and transports.
- Physical camera and animated-UR interoperability testing with supported air-gapped signers.
- Funded regtest and Testnet4 RBF/CPFP races, recovery drills, backend failure/reorg cases, and the isolated Bitcoin Core integration harness.
- Platform secure-storage certification, reproducible signed packages, SBOM/provenance evidence, accessibility assistive-technology review, and independent security review.
- BitBox02 Nova transport implementation and its own certification row; it must not inherit original BitBox02 evidence.

Mainnet remains compile-time disabled and controlled by ADR 0012 and the mainnet release checklist.
