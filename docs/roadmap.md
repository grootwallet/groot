# Satchel roadmap

This roadmap is ordered by security dependency, not marketing priority. A phase is complete only when its unit, integration, regtest, responsive UI, backup, and failure-path checks pass.

## Current checkpoint

The regtest app now has labeled receive addresses with enlarged QR and optional derivation detail, persisted coin freeze/unfreeze, automatic or exact-input sends, recommended 2-of-3 and 3-of-5 creation plus safe advanced M-of-N controls, and real Rust-compiled delayed recovery/inheritance descriptor creation. The remaining gates below are ordered; unchecked work must not be presented as production-ready.

## Gate review — 2026-08-03

- **Gate 1, existing wallet hardening:** green for regtest. Generated words use a native Rust-owned flow, secrets use credential plus device wrapping, notifications and proposals persist, unlock is throttled, and restart/corruption/deletion paths have regression tests. Public networks remain blocked on Android/Windows secure-storage certification and a packaged mobile lifecycle harness.
- **Gate 2, multiple-wallet registry:** green for regtest. Versioned UUID profiles now route isolated single-key and multisig directories; creation, selection, deletion, switching, and legacy migration/rollback are user-visible and tested.
- **Gate 3, descriptor engine:** green for standard BIP48 WSH and guided recovery/decay/expansion compilation, checksums, canonicalization, and public-only enforcement. Delayed satisfaction selection in real funded transactions remains a V2 gate.
- **Gate 4, setup UX:** guided 2-of-3/recovery/inheritance setup, manual/virtual/HWI xpub sources, descriptor insight, backup drill, and desktop/mobile flows are green. Standards-compliant UR/camera import remains hidden.
- **Gate 5, signing coordinator:** proposal persistence, exact-PSBT merge validation, file save/import, HWI signing, threshold finalization, broadcast, cancellation, and restart-visible listing are implemented. Path-aware delayed signatures remain V2.
- **Gate 6, hardware:** the Rust trait, fixed command builders, timeout/kill, bounded output, stderr suppression, xpub/sign, and device address comparison are implemented. No physical device was available in this workspace, so Coldcard/Trezor/Ledger/BitBox02 certification remains external and must record real firmware evidence.
- **Gate 7, mainnet release:** intentionally blocked by ADR 0012. CI proves no current frontend/native build can select mainnet. The threat model, physical-device matrix, reproducible packages, platform secure storage, remote backend, independent review, and recovery rehearsal remain required evidence.

## V1 — simple descriptor multisig coordinator

### 1. Existing wallet hardening

- Finish create, recover, unlock, receive, discard, send, activity, UTXO, notification, and deletion tests.
- Persist exactly-once notification markers in Rust.
- Add unlock rate limiting and platform secure-storage wrapping.
- Eliminate any secret-bearing webview DTO; use a trusted native recovery-word display before public networks.
- Add instrumented Tauri command integration for frozen-coin persistence, exact-input PSBTs, restart behavior, filesystem deletion, and corrupted databases.

### 2. Multiple-wallet registry

- Add versioned wallet profiles with stable IDs, names, network, kind, descriptor checksum, creation time, and selected-wallet state.
- Store each BDK database and immutable address-label table separately.
- Support single-key, multisig, and watch-only descriptor imports without mixing state.
- Add migration and rollback tests for the current single-wallet directory.

### 3. Miniscript descriptor engine

- Make parsed Rust `Descriptor<DescriptorPublicKey>` values the canonical identity.
- Support v1 `wsh(sortedmulti(k,...))` with 3–7 unique BIP48 cosigners and thresholds from 2 through `n`.
- Canonicalize cosigner ordering, preserve key origins, require checksums on exports, and reject private descriptors.
- Derive receive/change addresses only through BDK and verify selected addresses on capable devices.
- Export a human-readable policy summary plus external/internal descriptors as the wallet backup.

### 4. Coordinator setup UX

- Default to 2-of-3 and explain the failure tolerance in one sentence.
- Add cosigners through desktop USB, animated/static QR, file import, or manual origin+xpub entry.
- Show device fingerprint, model, origin, connection state, and a short xpub checksum—not the full xpub by default.
- Require unique device verification and descriptor-backup acknowledgment before wallet creation.
- Offer a recovery drill that reconstructs the same first receive address from the exported descriptors.

### 5. PSBT signing coordinator

- Prepare transactions in BDK and persist proposals before leaving review.
- Show recipient, amount, fee, fee rate, change, inputs, policy, and required signatures from the PSBT.
- Collect signatures in any order over USB, QR, or file; merge only PSBTs matching the proposal identity.
- Show explicit per-cosigner states: ready, awaiting device, signing, signed, rejected, unavailable.
- Finalize and broadcast only when the descriptor is satisfied; retain recoverable partial proposals across restarts.

### 6. Hardware transport and certification

- Integrate Bitcoin Core HWI behind a Rust trait for enumerate, fingerprint, BIP48 xpub, address display/policy registration, and PSBT signing.
- Never shell-concatenate arguments, log PSBTs, request seed words, or accept device-returned private material.
- First certification targets: Coldcard, Trezor, Ledger, and BitBox02, subject to available physical devices and current firmware.
- Record model, firmware, host OS, HWI version, supported setup/sign/display operations, simulator coverage, and known limitations.
- Fail closed when device identity, network, origin, wallet policy, or returned PSBT differs.

### 7. Mobile and air-gapped parity

- Use descriptor/key QR import and PSBT QR/file round trips as the universal flow.
- Add UR/animated QR only after bounded-memory, frame-order, duplicate-frame, and malicious-payload tests.
- Keep USB/HID desktop-specific; do not imply mobile USB support where the platform or device cannot provide it.
- Verify camera permission, interruption, background/resume, and keyboard/safe-area behavior on iOS and Android.

## V2 — guided custom Miniscript recovery policies

V2 exposes reviewed templates, not an unrestricted script editor. Every template compiles in Rust, runs Miniscript sanity checks, produces a descriptor checksum, and displays all spending paths in plain language.

### Timelocked recovery path

- Immediate path: an operational threshold such as 2-of-3.
- Recovery path: after a relative block delay, a separate recovery threshold such as 2-of-3 backup keys.
- Start with CSV block delays; show approximate time only as secondary, explicitly non-guaranteed information.
- Track UTXO age per coin because relative timelocks mature independently.
- Let users simulate “available now” and future block heights before creation.
- Teach proposal/signature progress to choose and explain a specific Miniscript satisfaction path instead of assuming the immediate threshold.
- Fund outputs on regtest and prove immediate, one-block-before, exact-boundary, post-boundary, and reorg behavior for recovery and inheritance spends.

### Decaying multisig

- Support policies whose required threshold decreases over time, for example 3-of-5 now, 2-of-5 after six months, and 1-of-5 after one year.
- Require a warning that later paths intentionally reduce theft resistance.
- Prevent a later path from accidentally being stronger, unreachable, or immediately active.
- Display the earliest spend height for every UTXO and path.

### Expanding multisig

- Support policies that add eligible recovery signers over time while preserving a chosen threshold, for example 2-of-3 operational keys now and 2-of-5 including recovery keys later.
- Make the distinction between “more eligible keys” and “fewer required signatures” explicit.
- Detect duplicate keys across paths and highlight keys whose loss affects more than one path.
- Require compatible policy registration on every device that needs it.

### V2 policy safety gates

- Miniscript type check, `sanity_check`, standardness, script-size, witness-size, and maximum-fee analysis.
- Semantic-policy lift and display; reject hidden or unrenderable spending paths.
- Satisfiability at creation and at each advertised timelock horizon.
- Mixed height/time-lock rejection in the first V2 release.
- Descriptor round-trip and checksum equality across export/import.
- Recovery drill with virtual signers before the wallet may reveal a funding address.
- Property tests over thresholds, signer sets, lock delays, branch ordering, and PSBT merge/finalization.
- Regtest time-travel tests before, at, and after every recovery boundary, including reorgs.

## Later work

- Taproot/Miniscript policies only after interoperability and hardware support are standardized and independently reviewed.
- Optional full-node and remote Esplora backends with identical descriptor semantics.
- Collaborative wallet invitations only with authenticated descriptor exchange; no cloud custody.
- Mainnet remains blocked on a dedicated threat model, external review, reproducible releases, physical-device certification, and end-to-end recovery checklist.
