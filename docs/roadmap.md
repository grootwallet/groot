# Groot roadmap

This roadmap is ordered by security dependency, not marketing priority. A phase is complete only when its unit, integration, regtest, responsive UI, backup, and failure-path checks pass.

## Current checkpoint

The regtest app now has labeled receive addresses with enlarged QR and optional derivation detail, persisted coin freeze/unfreeze, automatic or exact-input sends, recommended 2-of-3 and 3-of-5 creation plus safe advanced M-of-N controls, and real Rust-compiled delayed recovery/inheritance descriptor creation. The remaining gates below are ordered; unchecked work must not be presented as production-ready.

The first production target is a **macOS desktop, hardware-focused, user-controlled Bitcoin Core release**. iOS, Android, and Windows remain product targets, but each is a later independently gated release until its native secure storage, lifecycle, packaging, and platform acceptance evidence is complete. Public Esplora and mobile mainnet are not part of the first release.

## Concrete path to production and mainnet

Every stage is fail-closed: later work may proceed in parallel, but no stage is considered complete until its exit evidence is attached to the exact candidate commit. Local hardware reports may contain sensitive identifiers and therefore stay gitignored; release sign-off uses a sanitized summary containing only model, firmware, host/HWI versions, test-network scope, pass/fail/limitation, reviewer, date, and candidate commit.

| Stage | Work that can proceed without physical devices | Manual or external dependency | Exit evidence | Current status |
| --- | --- | --- | --- | --- |
| 0. Scope and evidence freeze | Keep ADR 0012 locked; maintain the threat model, checklist, flow matrix, supported-device matrix, and exact candidate scope | Release owner approves the candidate scope | CI release gate plus reviewed checklist diff | Active; mainnet remains compile-time disabled |
| 1. Deterministic engineering closure | Keep frontend/Rust checks, adversarial PSBT tests, Core regtest, coverage floors, and browser acceptance green; incrementally decompose `wallet.rs`; add native command acceptance and cross-process single-instance locking | None | Clean CI on the exact commit; native restart/corruption/concurrent-launch evidence | Cross-process locking and adversarial PSBT expansion implemented; full CI and packaged native acceptance remain |
| 2. Hardware certification | Maintain fail-closed HWI/file/UR boundaries, vendor fixtures, mutation corpus, and sanitized report tooling | Physical device, current firmware, and human trusted-display/rejection checks | One sanitized record per exact model/firmware/OS/HWI combination | Coldcard Mk4 reported complete locally; Ledger active; BitBox02, BitBox02 Nova, Trezor Model One, and Jade remain |
| 3. Interoperability and recovery | Automate BSMS/UR vectors, funded RBF/CPFP races, extended-gap recovery, restart, reorg, and corrupted-state cases | Two independent descriptor-aware wallets/signers and a human recovery drill | Two independent round trips; known-wallet recovery from clean storage; funded race/reorg logs | Funded acceleration, scale recovery, and native Rust clean-database recovery/reopen are green; external interoperability, human clean-storage recovery, and physical Testnet4 rehearsal remain |
| 4. Backend and privacy rehearsal | Add explicit Signet/Testnet4 candidate plumbing while preserving the mainnet compile-time lock; exercise wrong-chain, stale-tip, fee-unavailable, TLS, Tor-proxy-loss, timeout, authentication, certificate, and no-fallback paths | Dedicated Signet/Testnet4 Core endpoints and network observation for DNS-leak evidence | Signet and Testnet4 runbooks plus sanitized direct-TLS/Tor reports | Automated auth/timeout/TLS-handshake/wrong-chain and hostname-preserving Tor no-fallback matrix is green; real endpoint certificate/DNS evidence and public-test-network plumbing remain |
| 5. macOS platform and release candidate | Add packaged-app/native IPC acceptance, Keychain migration/deletion tests, SBOM, provenance, update/rollback verification, deterministic unsigned-build comparison, and release artifact checks | Two clean build machines; Apple signing/notarization identity; accessibility/lifecycle review | Matching unsigned hashes, signed/notarized package, SBOM/provenance, packaged acceptance report | Deterministic SBOM/license evidence, offline signed-update/HWI provenance verifiers, disposable Keychain lifecycle test, and packaged process/crash harness implemented; actual artifacts, signed-Keychain run, reproducibility, notarization, and complete packaged acceptance remain pending |
| 6. Independent security review | Prepare exact commit, threat model, ADRs, dependency locks, fuzz corpus, hardware summaries, backend evidence, and recovery evidence | Independent Bitcoin wallet/security reviewer | Findings ledger with fix commits, regression tests, and reviewer closure | Pending |
| 7. Limited mainnet launch | Add explicit amount cap, first-run mainnet warnings, verified genesis/backend/network agreement, signed release metadata, rollback plan, and incident contacts | Release-owner approval and superseding ADR | Approved replacement for ADR 0012 and every applicable checklist item linked | Dormant Rust gate now blocks pre-database mainnet access and tests exact genesis/local-Core/single-recipient/1,000,000-sat policy; enablement, live backend proof, warnings, signed candidate, and approval remain blocked |
| 8. Platform expansion | Reuse domain tests; add platform-specific native acceptance and packaging | Physical iOS/Android devices, Android hardware-backed Keystore, Windows Credential Manager, camera/background/update certification | Separate release decision and evidence pack per platform | Not part of first mainnet release |

### Hardware execution order

1. Finish the current Ledger single-key record, then Ledger as a member of a real 2-of-3 Testnet4 spend.
2. Certify the original BitBox02 over desktop USB, including the BitBoxApp pairing-cache handoff and companion-app USB release.
3. Treat BitBox02 Nova as a new implementation target: first capture its actual HWI identity, pairing behavior, xpub origin, policy registration, address display, and signing behavior; then certify desktop USB. Whisper/BLE is a later authenticated mobile-transport project, not inherited support.
4. Certify Trezor Model One as the explicit legacy target, including PIN-matrix entry, standard-wallet confirmation, cancellation, reconnect, and the documented hidden-wallet limitation. Newer Trezor models require their own row if they are intended for release.
5. Complete the required Blockstream Jade/Jade Plus row. It remains a first-release checklist item even though it was not in the immediate user-owned device sequence.
6. Repeat at least one complete 2-of-3 Testnet4 spend and clean descriptor recovery drill using two independently administered physical signer families.

Coldcard certification must name the exact model. The current user-reported completed target is **Coldcard Mk4**; the local record remains the source until a sanitized reviewer summary is produced. Passport, legacy Digital BitBox, BitBox02 Nova Whisper/BLE, and unlisted signer models are not first-release claims unless the checklist and threat model are explicitly expanded.

## Pre-mainnet MVP closure — active

Implementation exists for the following items, but the distinction between code-complete and evidence-complete is mandatory:

1. **Hardware matrix:** finish disposable Testnet4 certification for Coldcard Mk4, Trezor Model One, Ledger, BitBox02, and Jade using the local report template. BitBox02 Nova is a separate implementation/certification row and is not inferred from BitBox02. Include cable where supported plus file/UR interchange, address identity, rejection, reconnect, RBF, CPFP, wrong-device, and recovery evidence. This cannot be completed without the physical devices.
2. **Interoperability:** public BIP129/BSMS records and bounded `crypto-psbt` UR v2 are implemented. Complete vendor vectors and round trips with at least two independent descriptor-aware wallets. Encrypted BIP129 signer rounds are deferred.
3. **Fee management:** Funded Regtest RBF/CPFP now covers Groot's production proposal, sequential-signature import, restart, rejection, broadcast-commit, replacement-lineage, and package-fee workflows plus the independent BDK/Core race/reorg matrix. Complete the Testnet4 replacement/package confirmation races and physical hardware signatures.
4. **Recovery:** birthday/gap controls, asynchronous full scan, persisted progress, cancellation, restart-safe interruption, the 65-payment/121-address envelope, and clean file-backed descriptor recovery/reopen are implemented. Complete the independent human clean-storage drill and public-network rehearsal.
5. **Remote Core:** direct TLS and hostname-preserving v3-onion SOCKS5 transport are implemented with bounded failure/no-fallback automation. Complete a real VPS TLS/Tor run for certificate hostname/expiry/revocation and network-level DNS evidence.
6. **Release:** unsigned clean-build/hash-comparison and macOS signature-verification scripts exist. Prove matching unsigned hashes on two clean machines, then sign/notarize, produce SBOM/provenance, and commission an independent review.
7. **Next signer models:** complete Jade/Jade Plus multisig-registration and PSBT round trips, then add BitBox02 Nova as a distinct certification target. Start Nova with desktop USB only after recording its real HWI identity and pairing behavior; do not inherit original BitBox02 support by model name. Treat Whisper/BLE on iOS as a separate authenticated transport and lifecycle project.

Mainnet stays compile-time disabled until every checklist artifact is attached to an approved replacement for ADR 0012.

## Gate review — 2026-08-03

- **Gate 1, existing wallet hardening:** green for regtest. Generated words use a native Rust-owned flow, secrets use credential plus device wrapping, notifications and proposals persist, unlock is throttled, and restart/corruption/deletion paths have regression tests. The first macOS mainnet candidate remains blocked on packaged native lifecycle evidence; Android, Windows, and iOS remain independently blocked on their platform storage/lifecycle gates.
- **Gate 2, multiple-wallet registry:** green for regtest. Versioned UUID profiles now route isolated single-key and multisig directories; creation, selection, deletion, switching, and legacy migration/rollback are user-visible and tested.
- **Gate 3, descriptor engine:** green for standard BIP48 WSH and guided recovery/decay/expansion compilation, checksums, canonicalization, and public-only enforcement. Delayed satisfaction selection in real funded transactions remains a V2 gate.
- **Gate 4, setup UX:** guided 2-of-3/recovery/inheritance setup, manual/virtual/HWI xpub sources, descriptor insight, backup drill, bundled local UR/camera decoding, and desktop/mobile flows are green. Physical camera and signer interoperability certification remains external.
- **Gate 5, signing coordinator:** proposal persistence, exact-PSBT merge validation, file save/import, HWI signing, threshold finalization, broadcast, cancellation, and restart-visible listing are implemented. Path-aware delayed signatures remain V2.
- **Gate 6, hardware:** the Rust trait, fixed command builders, timeout/kill, bounded output, stderr suppression, xpub/sign, and device address comparison are implemented. A Coldcard Mk4 record is reported complete in the local gitignored evidence set and Ledger certification is active; the sanitized reviewer summaries and the remaining Trezor Model One/BitBox02/Jade records are still external gates. BitBox02 Nova is not yet an implemented alias or certified device.
- **Gate 7, mainnet release:** intentionally blocked by ADR 0012. CI proves no current frontend/native build can select mainnet. The threat model, physical-device matrix, reproducible packages, platform secure storage, remote backend, independent review, and recovery rehearsal remain required evidence.

## V1 — simple descriptor multisig coordinator

### 1. Existing wallet hardening

- Finish create, recover, unlock, receive, discard, send, activity, UTXO, notification, and deletion tests.
- Persist unique notification markers in Rust with explicit acknowledgement and idempotent at-least-once delivery.
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
- First certification targets: Coldcard, Trezor, Ledger, BitBox02, and Jade, subject to available physical devices and current firmware. BitBox02 Nova follows as its own model/firmware/transport row after an explicit implementation change.
- Record model, firmware, host OS, HWI version, supported setup/sign/display operations, simulator coverage, and known limitations.
- Fail closed when device identity, network, origin, wallet policy, or returned PSBT differs.

### 7. Mobile and air-gapped parity

- Use descriptor/key QR import and PSBT QR/file round trips as the universal flow.
- Complete physical UR/camera certification after the implemented bounded-memory, frame-order, duplicate-frame, and malicious-payload tests.
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
- BIP329 label import/export without weakening immutable-label rules.
- Wallet health dashboard: backup age, descriptor verification, node status, signer firmware evidence, and recovery drill reminders.
- Batch payments, payment URI/QR requests, address book, and watch-only wallet promotion only after intent-review and privacy design.
- Payjoin, collaborative transactions, coin-control privacy scoring, and Stonewall-style transaction construction require separate protocol and denial-of-service threat models.
- Compact-filter/P2P synchronization similar in privacy objective to Wasabi requires a separate backend architecture; do not route it through a central Groot service.
- Hardware initialization/device management only through audited vendor SDKs with an explicit seed-backup UX. It must never make Groot a seed transport or silently install firmware.
- Desktop/mobile update delivery, rollback protection, release transparency, and long-term data migration compatibility.
- Mainnet remains blocked on a dedicated threat model, external review, reproducible releases, physical-device certification, and end-to-end recovery checklist.
