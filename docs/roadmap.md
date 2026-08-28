# Groot roadmap

This roadmap is ordered by security dependency, not marketing priority. A phase is complete only when its unit, integration, regtest, responsive UI, backup, and failure-path checks pass.

Commercial packaging and the issue-level sequence are tracked separately in [`commercial-product-strategy.md`](commercial-product-strategy.md) and [`product-backlog.md`](product-backlog.md). The proposed first post-release add-on is the test-network-first, end-to-end encrypted coordination path in [`remote-signer-coordination-roadmap.md`](remote-signer-coordination-roadmap.md). Family, inheritance, cosigner, and insurance direction is bounded by [`recovery-assurance-roadmap.md`](recovery-assurance-roadmap.md). None of those documents weakens the release gates below.

## Current checkpoint

The regtest app now has labeled receive addresses with enlarged QR and optional derivation detail, persisted coin freeze/unfreeze, automatic or exact-input sends, recommended 2-of-3 and 3-of-5 creation plus safe advanced M-of-N controls, and real Rust-compiled configurable Recovery descriptors with compatible legacy Inheritance wallets. The remaining gates below are ordered; unchecked work must not be presented as production-ready.

The first production target is a **macOS desktop, hardware-focused, user-controlled Bitcoin Core release**. iOS, Android, and Windows remain product targets, but each is a later independently gated release until its portable encrypted-profile lifecycle, KDF performance, packaging, and platform acceptance evidence is complete. Public Esplora and mobile mainnet are not part of the first release.

## Concrete path to production and mainnet

Every stage is fail-closed: later work may proceed in parallel, but no stage is considered complete until its exit evidence is attached to the exact candidate commit. Local hardware reports may contain sensitive identifiers and therefore stay gitignored; release sign-off uses a sanitized summary containing only model, firmware, host/HWI versions, test-network scope, pass/fail/limitation, reviewer, date, and candidate commit.

| Stage                                   | Work that can proceed without physical devices                                                                                                                                                                                                                                                | Manual or external dependency                                                                                                                      | Exit evidence                                                                                   | Current status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Scope and evidence freeze            | Keep ADR 0012 locked; maintain the threat model, checklist, flow matrix, supported-device matrix, and exact candidate scope                                                                                                                                                                   | Release owner approves the candidate scope                                                                                                         | CI release gate plus reviewed checklist diff                                                    | Active; mainnet remains compile-time disabled                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 1. Deterministic engineering closure    | Keep frontend/Rust checks, adversarial PSBT tests, Core regtest, coverage floors, and browser acceptance green; incrementally decompose `wallet.rs`; add native command acceptance and cross-process single-instance locking                                                                  | None                                                                                                                                               | Clean CI on the exact commit; native restart/corruption/concurrent-launch evidence              | Cross-process locking and adversarial PSBT expansion implemented; full CI and packaged native acceptance remain                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2. Hardware certification               | Maintain fail-closed HWI/file/UR boundaries, vendor fixtures, mutation corpus, and sanitized report tooling                                                                                                                                                                                   | Physical device, current firmware, and human trusted-display/rejection checks                                                                      | One sanitized record per exact model/firmware/OS/HWI combination                                | Coldcard Mk4, Ledger Nano S Plus, Trezor Model One, original Bitcoin-only BitBox02 firmware 9.26.3, and original Jade firmware 1.0.40 completed their local Regtest campaigns subject to recorded limitations. Trezor Safe 3 firmware 2.12.3 and BitBox02 Nova separately completed their local desktop-USB core campaigns. The original BitBox02/Ledger and Trezor Model One packaged BIP48 Testnet4 campaigns are recorded with named remaining package rows. Jade Plus remains a separate exact-model target. |
| 3. Interoperability and recovery        | Automate BSMS/UR vectors, funded RBF/CPFP races, extended-gap recovery, restart, reorg, and corrupted-state cases                                                                                                                                                                             | Two independent descriptor-aware wallets/signers and a human recovery test                                                                         | Two independent round trips; known-wallet recovery from clean storage; funded race/reorg logs   | Funded acceleration, scale recovery, native Rust clean-database recovery/reopen, and independent Bitcoin Core descriptor import/derivation/funded-history reload are green; two external coordinator/signer round trips, the human clean-storage test, and physical Testnet4 rehearsal remain                                                                                                                                                                                                                    |
| 4. Backend and privacy rehearsal        | Maintain explicit Signet/Testnet4 candidate plumbing while preserving the mainnet compile-time lock; exercise wrong-chain, stale-tip, fee-unavailable, compact-filter peer conflict/loss, TLS, Tor-proxy-loss, timeout, authentication, certificate, bandwidth/storage, and no-fallback paths | Dedicated Signet/Testnet4 Core/filter peers, selected Kyoto adversarial-test strategy, and network observation for DNS-leak evidence               | Signet and Testnet4 runbooks plus sanitized compact-filter/direct-TLS/Tor reports               | Automated Core and Groot-owned compact-filter boundaries are green; [`compact-filter-deferred-work.md`](compact-filter-deferred-work.md), real endpoint certificate/DNS evidence, and public-test-network execution remain                                                                                                                                                                                                                                                                                       |
| 5. macOS platform and release candidate | Add packaged-app/native IPC acceptance, portable encrypted-profile migration/restore tests, SBOM, provenance, update/rollback verification, deterministic unsigned-build comparison, and release artifact checks                                                                              | Two clean build machines; Apple signing/notarization identity; accessibility/lifecycle review                                                      | Matching unsigned hashes, signed/notarized package, SBOM/provenance, packaged acceptance report | Deterministic SBOM/license evidence, checkout-path-independent binaries, strict complete-evidence comparison, offline signed-update/HWI provenance verifiers, portable-envelope unit migration, and packaged process/crash harness are implemented; independent-machine reproduction, actual artifacts, signed portable restore run, notarization, and complete packaged acceptance remain pending                                                                                                               |
| 6. Independent security review          | Prepare exact commit, threat model, ADRs, dependency locks, fuzz corpus, hardware summaries, backend evidence, and recovery evidence                                                                                                                                                          | Independent Bitcoin wallet/security reviewer                                                                                                       | Findings ledger with fix commits, regression tests, and reviewer closure                        | Pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 7. Limited mainnet launch               | Add explicit amount cap, first-run mainnet warnings, verified genesis/backend/network agreement, signed release metadata, rollback plan, and incident contacts                                                                                                                                | Release-owner approval and superseding ADR                                                                                                         | Approved replacement for ADR 0012 and every applicable checklist item linked                    | Dormant Rust gate now blocks pre-database mainnet access and tests exact genesis/local-Core/single-recipient/1,000,000-sat policy; enablement, live backend proof, warnings, signed candidate, and approval remain blocked                                                                                                                                                                                                                                                                                       |
| 8. Platform expansion                   | Reuse domain tests; add platform-specific native acceptance and packaging                                                                                                                                                                                                                     | Physical iOS/Android devices, portable-profile backup/restore, Argon2id calibration, filesystem protection, camera/background/update certification | Separate release decision and evidence pack per platform                                        | Not part of first mainnet release                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

### Hardware execution order

1. Rehearse the remaining exact first-release package rows—Coldcard Mk4 RBF/negative/recovery, Trezor Model One BIP84, Ledger Nano S Plus BIP84, original BitBox02 BIP84, and original Jade—on the selected public test network and reviewed packaged HWI candidate. Coldcard Mk4 firmware 5.6.1 already passed packaged BIP84 identity/address, cable and offline signing, rejection, restart, USB interruption/rescan, broadcast/accounting, activity ordering, and CPFP checkpoints through v0.4.68; do not repeat those checkpoints without a directly relevant code change. Trezor Model One's BIP48 self-transfer, extended-review, and post-review automatic-lock regressions are also complete and must not be repeated without a directly relevant code change.
2. Complete Trezor Safe 3 and BitBox02 Nova public-network/package plus independent-review rows under their separate exact-model records. Whisper/BLE remains a later authenticated mobile-transport project.
3. Repeat at least one complete 2-of-3 public-test-network spend and clean descriptor recovery test using two independently administered physical signer families.
4. Treat Jade Plus, BitBox02 Nova, additional Ledger/Trezor models, and every other roadmap device as separate exact-model targets.

Coldcard certification must name the exact model. The current user-reported completed target is **Coldcard Mk4**; the local record remains the source until a sanitized reviewer summary is produced. Passport, legacy Digital BitBox, BitBox02 Nova Whisper/BLE, and unlisted signer models are not first-release claims unless the checklist and threat model are explicitly expanded.

## Pre-mainnet MVP closure — active

Implementation exists for the following items, but the distinction between code-complete and evidence-complete is mandatory:

1. **Hardware matrix:** finish disposable Testnet4 certification for Coldcard Mk4, Trezor Model One, Ledger, BitBox02, and Jade using the local report template. BitBox02 Nova is a separate implementation/certification row and is not inferred from BitBox02. Include cable where supported plus file/UR interchange, address identity, rejection, reconnect, RBF, CPFP, wrong-device, and recovery evidence. This cannot be completed without the physical devices.
2. **Interoperability:** public BIP129/BSMS records and bounded `crypto-psbt` UR v2 are implemented. Complete vendor vectors and round trips with at least two independent descriptor-aware wallets. Encrypted BIP129 signer rounds are deferred.
3. **Fee management:** Funded Regtest RBF/CPFP now covers Groot's production proposal, sequential-signature import, restart, rejection, broadcast-commit, replacement-lineage, and package-fee workflows plus the independent BDK/Core race/reorg matrix. Complete the Testnet4 replacement/package confirmation races and physical hardware signatures.
4. **Recovery:** birthday/gap controls, asynchronous full scan, persisted progress, cancellation, restart-safe interruption, the 65-payment/121-address envelope, and clean file-backed descriptor recovery/reopen are implemented. Complete the independent human clean-storage drill and public-network rehearsal.
5. **Remote Core:** direct TLS and hostname-preserving v3-onion SOCKS5 transport are implemented with bounded failure/no-fallback automation. Complete a real VPS TLS/Tor run for certificate hostname/expiry/revocation and network-level DNS evidence.
6. **Release:** unsigned clean-build/hash-comparison and macOS signature-verification scripts exist. Prove matching unsigned hashes on two clean machines, then sign/notarize, produce SBOM/provenance, and commission an independent review.
7. **Next signer models:** complete Trezor Safe 3 independently, then certify BitBox02 Nova through its enabled HWI 3.2.0 desktop-USB path. Jade Plus remains a distinct later target. Do not inherit Model One, original BitBox02, or Jade Classic evidence by family name. Treat QR and Whisper/BLE transports as separate certification and lifecycle projects.

Mainnet stays compile-time disabled until every checklist artifact is attached to an approved replacement for ADR 0012.

## Gate review — 2026-08-03

- **Gate 1, existing wallet hardening:** green for regtest. Generated words use a native Rust-owned flow, secrets use credential plus device wrapping, notifications and proposals persist, unlock is throttled, and restart/corruption/deletion paths have regression tests. The first macOS mainnet candidate remains blocked on packaged native lifecycle evidence; Android, Windows, and iOS remain independently blocked on their platform storage/lifecycle gates.
- **Gate 2, multiple-wallet registry:** green for regtest. Versioned UUID profiles now route isolated single-key and multisig directories; creation, selection, deletion, switching, and legacy migration/rollback are user-visible and tested.
- **Gate 3, descriptor engine:** green for standard BIP48 WSH and guided Recovery/decay/expansion compilation, checksums, canonicalization, public-only enforcement, and funded immediate/delayed Recovery satisfaction on Regtest. Compatible legacy Inheritance descriptors use the same verified delayed-path boundary. Physical Testnet4 signing and independent recovery review remain external release gates.
- **Gate 4, setup UX:** guided 2-of-3 and configurable Recovery setup, compatible legacy Inheritance state, manual/virtual/HWI xpub sources, descriptor insight, backup drill, bundled local UR/camera decoding, and desktop/mobile flows are green. Assisted recovery is visibly unavailable, and physical camera and signer interoperability certification remain external.
- **Gate 5, signing coordinator:** proposal persistence, exact-PSBT merge validation, file save/import, HWI signing, threshold finalization, broadcast, cancellation, restart-visible listing, and path-bound one-key delayed spends are implemented on Regtest. Exact device-specific Testnet4 evidence remains external.
- **Gate 6, hardware:** the Rust trait, fixed command builders, timeout/kill, bounded output, stderr suppression, xpub/sign, and device address comparison are implemented. Local Regtest records are complete for Coldcard Mk4, Ledger Nano S Plus, Trezor Model One, original Bitcoin-only BitBox02 firmware 9.26.3, and original Jade firmware 1.0.40, subject to their recorded limitations. Sanitized candidate summaries, public-network/package evidence, independent recovery/review, and later exact-model targets remain external gates; Jade Plus and BitBox02 Nova are not certified aliases.
- **Gate 7, mainnet release:** intentionally blocked by ADR 0012. CI proves no current frontend/native build can select mainnet. The threat model, physical-device matrix, reproducible packages, portable encrypted-profile/KDF review, remote backend, independent review, and recovery rehearsal remain required evidence.

## V1 — simple descriptor multisig coordinator

### Reusable organization tags

Add reusable, searchable local tags as optional metadata that is explicitly separate from permanent provenance-label assignments. A payment or receive address keeps one immutable audit-label assignment whose stable label entity may intentionally be reused; users may additionally attach multiple removable tags such as `pizza`, `Bob`, or `expenses` across addresses, payment intents, transactions, and coins. The implementation requires a normalized many-to-many Rust persistence model, bounded tag names/counts, atomic migrations, WalletPort DTOs, add/remove controls, autocomplete and search/filter surfaces, discreet-mode redaction, and tests proving tags cannot rewrite provenance assignments, privacy clusters, signed proposals, or transaction review data.

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
- Offer a recovery test that reconstructs the same first receive address from the exported descriptors.

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
- Recovery test with virtual signers before the wallet may reveal a funding address.
- Property tests over thresholds, signer sets, lock delays, branch ordering, and PSBT merge/finalization.
- Regtest time-travel tests before, at, and after every recovery boundary, including reorgs.

## Later work

- Taproot/Miniscript policies only after interoperability and hardware support are standardized and independently reviewed.
- Optional full-node and remote Esplora backends with identical descriptor semantics.
- Collaborative wallet invitations only with authenticated descriptor exchange; no cloud custody.
- Extend the implemented BIP329 address/transaction/output/public-signer interchange only when a standard record has an exact semantic match; do not add proprietary records for Groot-only intent, policy, cluster, or replacement history.
- Design cross-platform coordination between a phone key and desktop hardware signers as a separate authenticated protocol and threat model. BIP329 metadata files are a portability foundation, not synchronization.
- Wallet health dashboard: backup age, descriptor verification, node status, signer firmware evidence, and recovery-test reminders.
- Batch payments, payment URI/QR requests, address book, and watch-only wallet promotion only after intent-review and privacy design.
- Payjoin V2 sender/receiver sessions remain gated by ADR 0031's durable-state, transport, proposal-review, fallback-consent, interoperability, and denial-of-service evidence. URI parsing alone is not protocol support.
- Compact-filter/P2P synchronization is an optional confirmed-only backend under ADR 0031. Its locally complete foundation, architectural decisions, adversarial gaps, public-network measurements, and platform gates are tracked in [`compact-filter-deferred-work.md`](compact-filter-deferred-work.md); branch merge is not Issue #7 closure.
- Hardware initialization/device management only through audited vendor SDKs with an explicit seed-backup UX. It must never make Groot a seed transport or silently install firmware.
- Desktop/mobile update delivery, rollback protection, release transparency, and long-term data migration compatibility.
- Mainnet remains blocked on a dedicated threat model, external review, reproducible releases, physical-device certification, and end-to-end recovery checklist.
