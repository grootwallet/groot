# Groot 5.3 mobile delivery plan

Tracking: [issue #6](https://github.com/grootwallet/groot/issues/6), verified open on 2026-10-16. This plan delivers the public watch context first; the issue's independent signer and relay acceptance criteria remain later work.

## Scope and acceptance

The owner selected Testnet4 on 2026-10-18 for connected-phone development. [ADR 0091](adr/0091-testnet4-ios-development.md) supersedes the earlier Signet-only development network and gives it a separate bundle/storage identity. Earlier Signet archives remain historical evidence.

The shipped baseline is `733bc513d5fe570a1ceb27d8815ed00a4b2a0459` (5.2.0). Development on `codex/5.3-mobile-foundation` preserves its tag, published artifacts, authorization and update trust keys. The manifests retain the baseline version until a separately reviewed development-version decision; the isolated app is named **Groot Testnet4 Dev**, never a 5.3 release candidate.

First deliver a usable Testnet4 iPhone watch-only build: authenticated public wallet enrollment, verified balance/history, desktop-authorized receive addresses with permanent labels, and bounded unsigned PSBT review/transfer. No mobile Bitcoin key, signing, broadcast, cloud custody, seed transfer or proprietary recovery. Mainnet and Android public certification are outside this increment. Desktop operation, supported local signing, backups and recovery must work with the phone offline, revoked or lost.

## Audit and reuse decisions

| Surface                    | Observed state                                                                                                                                                                                                                                                    | Decision                                                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline                   | Tauri mobile entry point, iOS Rust targets and icons exist; no generated Apple project, iOS override, pairing commands or mobile routes in the clean baseline                                                                                                     | Add isolated build configuration and native safety guards first                                                                                         |
| Mobile branch              | `codex/cross-platform-wallet-coordination` at `85e794a28a222a6591cb080b6a23efcbbc1582d2`; roughly 10,000 lines beyond its shared release base, including BIP129 setup, phone key creation, native mnemonic sheets, staging storage and signing                    | Do not merge wholesale. Port public descriptor validation, bounded UR framing and selected lifecycle fixes only after current-baseline tests and review |
| Pairing design             | Branch uses invitation token, encrypted BIP129 setup rounds, signer proof and final policy checks; comparison code is derived from invitation/session material. Branch evidence explicitly leaves device wrapping, full recovery and lifecycle testing incomplete | Do not treat it as a reviewed persistent authenticated watch channel, revocation system or signing authorization                                        |
| Continuity branch          | `codex/continuity-policies-v1` at `03e8e1d07f02b8ab5bde92b669ef19263d43d66a`; proposed fixed household policies and delayed paths                                                                                                                                 | No reuse in 5.3 mobile scope; keep policy creation gates intact                                                                                         |
| Existing public interfaces | Registry already has `watch_only`; descriptor/BSMS validation, permanent labels, transaction review, BIP329 and bounded PSBT/UR live in Rust                                                                                                                      | Reuse domain boundaries through WalletPort; do not equate enum presence with a completed mobile flow                                                    |
| Native platform            | Xcode 26.1.1, XcodeGen and pinned iOS Rust targets installed. Baseline iOS compilation calls desktop-only `WebviewWindow.print()`                                                                                                                                 | Make mobile PDF preparation fail explicitly; retain desktop printing                                                                                    |
| Physical device            | Xcode listed an iPhone 13 mini as unavailable; owner will connect it later                                                                                                                                                                                        | No physical evidence claimed; installation waits for connection/unlock/trust                                                                            |

Historical simulator/device claims on the other branch apply only to their recorded candidates. They do not certify this source. Its duplicate ADR 0048 number must not be imported over the accepted transaction-review ADR.

## Delivery sequence

### 1. Isolated native foundation — current increment

- Fixed Testnet4 build under ADR 0091, `app.groot.wallet.mobile.testnet4.dev`, separate Cargo output, bundled assets, no LAN development server and no desktop-profile override.
- Native guards reject mobile key generation, software creation/recovery, secret backup operations, software/hardware signing and all broadcast commands before work. Return `mobile_operation_unavailable`; renderer controls cannot override the gate.
- Generate the ignored Apple project, compile/check the physical-device target, then produce an unsigned debug archive. Do not install or select a device implicitly. Do not add camera permissions until an actual scan flow is reviewed.
- Run mandatory validation and Rust checks. Preserve the 5.2 source pins: a changed pinned source requires new independent review, not a refreshed hash merely to make validation pass.
- On the connected phone later: inspect development signing and isolated identifier; install with existing configured development credentials, launch and verify stable errors for prohibited actions. Stop only for actual OS trust/unlock/signing requirements. Never use funded profiles.

### 2. Reviewed authenticated watch enrollment

Before implementing transport, add a dedicated protocol ADR and threat model that fixes the reviewed cryptographic construction/library, dependency provenance, authenticated transcript and key storage. Do not invent custom encryption from UR framing or accept a fingerprint/device ID as authentication.

Implementation contract:

- Rust owns pairing identities, keys, challenges, counters and parsing. Pairing keys are distinct from Bitcoin keys. No mnemonic, credential, RPC password or private descriptor crosses devices or IPC.
- Invitation is versioned, short-lived and single-use. Bind both device identities, random challenges, network/genesis, exact canonical descriptor identity, granted capabilities and protocol version into the authenticated transcript. Both devices confirm a transcript-derived short authentication string before activation. Replaced QR/key/policy must fail, including a malicious endpoint that changes the comparison transcript.
- Persist revocation generation and replay state before acknowledging acceptance. Separate enrollment state from existing wallets in a versioned additive store; specify crash reconciliation and unsupported-version behavior before implementation. A new store must not rewrite registry/profile/backup/proposal formats.
- First implementation is user-driven QR/file exchange. No relay, push, account, background-network promise or new inbound listener. Any later relay gets its own authorization, retention and metadata review.
- Public wallet package binds receive/change descriptors, exact wallet identity, chain, first address and verification provenance. Reject private keys, ambiguous origins, wrong chain, unsupported scripts, excessive size and conflicting identities in Rust before committing. UI displays public data only after explicit privacy consent.
- Initial proposed limits: invitation 4 KiB, envelope overhead 4 KiB, public package 256 KiB, complete PSBT 1 MiB, at most one active enrollment per device pair, and 15-minute invitation lifetime. Reconcile with existing parser limits and reviewed protocol overhead; never silently widen them. Enforce bounds before allocation/UR decoding, and bind purpose, sender/recipient, revision, sequence, expiry and revocation generation to authenticated data.

Exit evidence: two fresh disposable installs, both confirmations, hostile substitution/replay/reorder/expiry/network/policy/oversize cases, concurrent completion, revoke-before-delivery, clock changes, and process kill at every persistence boundary. Revoke stops future communication; it cannot erase public information already copied to a lost phone.

### 3. Public watch and receive behavior

- Import the validated public account into the existing watch-only domain with an independent local app credential. Inspect compatibility and duplicate handling before wiring mobile creation. Do not transfer desktop credentials or inherit desktop-local certification evidence.
- Phone sync uses its own explicitly configured and privacy-approved backend. Distinguish unverified, scanning, committed, stale and offline data; a desktop snapshot is not independently verified balance/history. Retain committed observations after failures and show retry.
- Desktop remains receive-index/label authority for this first paired increment. A phone request has a unique idempotency key; desktop atomically assigns its next address and one-to-five permanent labels before returning an authenticated result. Retrying a request returns the same address/assignment. Phone displays that exact assignment only after validation and durable acceptance. Offline phone may redisplay a previously assigned request, but cannot allocate a fresh address or invent a successful label. Desktop can keep receiving when the phone disappears.
- Define additive label-request storage and conflict rules before implementing it. BIP329 is backup/interchange, not live synchronization. Preserve unknown-source and immutable-label rules.
- Reuse existing components for notices, credentials, labels, QR and details. Verify 1180×780 and 390×844, both themes, translated copy, keyboard/safe-area spacing, VoiceOver and denial/retry behavior.

Exit evidence: exact descriptor/first-address equality, independent Testnet4 sync, deterministic Regtest history, duplicate receive requests and concurrent desktop/phone requests, recovery gap, atomic labels, wrong-wallet responses, lock/switch cancellation, offline/revoked phone and desktop-only recovery.

### 4. Bounded PSBT transfer and independent review

- Export the exact persisted desktop proposal bytes and revision via the authenticated envelope; preserve existing PSBTv0 and signature-only merge contracts. Reuse bounded UR/file parsing behind WalletPort.
- Phone parses the PSBT in Rust and derives recipients, amounts, verified change, fee, input ownership and network/policy identity independently. Bind review to exact bytes, expiry and session generation. No Sign, Approve or Broadcast action and no phone key generation.
- Reject stale/mutated/non-signature changes, foreign inputs, false change, missing UTXOs, unsupported sighash, wrong wallet/network, replayed envelopes and resource exhaustion. Interruption must preserve desktop proposals and allow explicit retry/cancel without false delivery claims.

Exit evidence: funded isolated Regtest proposal transfer/review, hostile fixtures and offline QR/file interchange. This phase adds no phone signatures and cannot close issue #6.

### 5. Separately gated signer work

Keep native signing guards until authenticated pairing, durable replay/substitution protection, revocation, interruption recovery, independent recovery and isolation have implementation, tests and independent review. Any phone-held key requires a dedicated backup/recovery and platform-protection decision, exact-device lifecycle evidence, loss/remaining-threshold drills and accurate Secure Enclave claims. Communication revocation cannot remove a Bitcoin signer from an onchain policy. Desktop wallets must never depend on a phone approval or proprietary service for independent recovery.

## Compatibility, standards and verification

This increment changes no wallet database, registry, profile, encrypted envelope, backup, proposal, label or update format. All existing networks/profile kinds remain readable; no migration, discard or data copy is performed. Mobile safety rejection is a capability restriction only. No dependencies, update keys, release authorization, published artifacts or existing ADRs are replaced.

No BIP support changes: BIP39/48/84/129/174/329 and descriptor semantics are unchanged. iOS compilation is platform build evidence, not new standards interoperability. Future enrollment and receive metadata require a fresh compatibility/BIP assessment before implementation.

Run `bash scripts/dev/tauri-ios-foundation.sh check`, then `init`, then `build`. The build action produces an unsigned arm64 debug archive and never installs it. Use the pinned Node runtime via the existing runtime selector. The generated Apple project and build products remain ignored. Version remains the baseline 5.2.0 with a dirty development commit marker until a development-version decision is accepted; do not present it as the shipped package.

Required evidence is mandatory `pnpm validate`, Rust formatting/lint/tests and the physical-target compile/archive result. A 5.2 reviewed-source hash mismatch must remain a reported gate until independently reviewed. No Core integration or UI/device evidence is manufactured for guard/configuration work; the subsequent functional phases require the named Core, browser and physical suites above.

## Foundation evidence — 2026-10-16

The earlier Signet archive and its uninstalled-device observations remain historical evidence in `release-artifacts/native-5.3-review/`. Current Testnet4 build, native/web handoff correction and connected-phone results are recorded in the [Testnet4 development handoff](testing/5.3-ios-testnet4.md), with exact source/build hashes. These are development observations, not a mobile functional or release certification.
