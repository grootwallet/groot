# Architecture

## Ownership

`route → existing component → WalletPort → native adapter → Rust command → domain/persistence/network`

Svelte owns presentation and transient orchestration. Rust owns entropy, secrets, credentials, descriptors, wallet policy, PSBT review/signing, persistence, sync and broadcast. DTOs and stable errors cross IPC; BDK internals and private key material do not.

| Area                     | Owner                                                                        |
| ------------------------ | ---------------------------------------------------------------------------- |
| Routes                   | `src/routes/`; no direct Tauri commands, dummy imports or wallet policy      |
| Reusable UI              | `src/lib/components/`; scoped styles; global foundations via `src/app.css`   |
| Public API/errors/events | `src/lib/wallet/contracts/`, public `contracts.ts` barrel                    |
| Pure frontend policy     | `src/lib/wallet/policy.ts`, `src/lib/multisig/`                              |
| Composition              | `src/lib/wallet/index.ts`; native builds exclude browser fixtures            |
| Native wallet domains    | `src-tauri/src/wallet.rs`, `wallet/`, descriptors/PSBT/store/network modules |
| Test prototype           | `dummy.ts`; deterministic non-secret data, never native fallback             |
| Marketing                | Separate `groot-site` repository                                             |

## Secrets and credentials

Rust requests 256 OS-random bits for the 24-word BIP39 mnemonic. Native generation/recovery UI never returns words through IPC. Credential inputs cross only for the requested operation, are bounded and zeroized natively, and are cleared in UI state afterward.

### Portable secret-envelope flow

Secure-store v5 uses AES-256-GCM payload encryption and an Argon2id credential wrap (64 MiB, three iterations, one lane). Authenticated AAD binds wallet UUID and secret purpose, not device/path. Correct authenticated v2/v3/v4 unlock migrates atomically; wrong credentials or failed writes preserve the original. Older applications cannot read migrated v5 profiles (ADR 0081).

Software credentials also select the BIP39 wallet and cannot change. Hardware/multisig app PINs protect only a local verifier and node secrets. PIN rotation locks the selected profile and atomically writes existing envelopes with a ciphertext-only rollback journal; pending rollback is restored before authentication (ADR 0085). There is no new wallet/backup schema. Portable encrypted files allow offline guessing; host security and strong credentials remain necessary.

## Identity, persistence and concurrency

Each network has its own app-data namespace. `wallet-registry.json` selects UUID-isolated profile directories and independent databases. Exact canonical public receive descriptors define wallet identity. Display names and descriptor checksums cannot substitute for it.

One process-lifetime OS lock owns the data root before wallet commands become available. Never replace/delete its live lock file; the kernel releases it on exit. Registry changes, wallet state and notification markers use failure-atomic persistence. Unsupported formats remain intact until explicit deletion or an approved compatibility plan.

Native operation serialization protects selected-wallet context, database transactions and hardware leases. Keep short-lived field locks separate from blocking work. Every command that waits for the wallet operation lock runs that wait and its serialized work on a blocking worker, including cancellation and short metadata operations. A native backup worker may hold the operation lock while dispatching its sheet to the main thread; a synchronous main-thread waiter would deadlock that handoff. Newly queued wallet-specific mutations bind selection before scheduling and recheck it under the operation lock. Expensive credential, filesystem, RPC and signing work runs off the UI thread. Do not relax repeated final authorization checks merely because earlier review succeeded: the wallet, session, proposal, device or chain may have changed.

Every asynchronous result/event binds the immutable wallet identity and current operation/session generation. Wallet switch, lock, deletion, cancellation or teardown invalidate stale delivery. Durable proposals and labels live in Rust; temporary presentation state lives with its route/controller, not a wallet-truth global store.

## Transaction boundary

1. Validate recipient/network, amount, fee and eligible coins.
2. BDK constructs the unsigned PSBT; Rust derives review data from its actual inputs/outputs.
3. Persist the proposal and exact review identity before signature collection.
4. Authenticate; bind software authorization to the exact reviewed PSBT. Verify hardware identity and every returned/imported signature before merge.
5. Recheck canonical wallet prevouts, wallet-owned change, outputs, policy and acceleration eligibility before finalization/broadcast.
6. Atomically persist accepted broadcast, labels/lineage and notification markers. A later refresh failure cannot reverse broadcast success.

After Core acceptance, a failed local commit returns `persistencePending` with the accepted txid and no snapshot. Native sync repairs existing active proposals only by their exact unsigned SegWit transaction ID in the canonical wallet graph, atomically with labels, replacement lineage and notifications (ADR 0090). No new persistent receipt format is introduced.

Mainnet caps and coin/recovery rules are native policy. The UI cannot invent change, balances, maturity, signer readiness or fees. Exact error/event contracts remain stable across code movement.

## Network boundary

Core owns chain/mempool truth, fees and broadcast. Check the selected chain name and exact genesis before wallet-data reads. Mainnet database permits bind purpose, profile and the verified saved route; the separate throttle permit grants no wallet-data access.

- Local Core is loopback-only.
- Direct remote Core is HTTPS with platform certificate validation, no redirects, and bounded I/O. v3 onion HTTP requires an explicit numeric loopback SOCKS5 proxy; no local DNS/direct fallback.
- Managed Mainnet enrollment happens in Rust and protects each revocable principal under that wallet credential. The private Fulcrum history index must match Core's tip; matched transactions are verified against full active-chain blocks. Omission/availability and metadata exposure remain operator trust boundaries.
- Custom remote Core uses bounded filter-index `scanblocks`; local Core retains its full-block path. A pruned node cannot supply missing history.
- Optional Kyoto compact filters discover confirmed activity on test networks. Core still provides fees/broadcast. Manual/proxy modes forbid public-discovery fallback. Wallet checkpoints are durable; peer filters are memory-only. [Remaining work](compact-filter-deferred-work.md) limits support claims.

Initial genesis scans need explicit privacy consent. Shell-owned pause/resume prevents automatic sync races; saved scan status can reattach after route changes, lock or restart. Only atomic completion is verified history. Normal selected-wallet foreground sync runs every 35 seconds after each settled attempt.

## Hardware and interchange

macOS discovery is passive bounded OS inventory, not HWI/vendor sessions. Short-lived opaque capabilities select one exact device path. Each account operation still proves full saved fingerprint/origin/xpub identity under a coordinated lease. Cancellation/switch/timeout revokes capabilities. Model-specific PIN/reconnect paths must retain their native guards (ADRs 0041/0048/0075).

Packaged HWI has a pinned digest and platform trust/installation policy. Windows release verification currently fails closed; Linux installation ownership and passive discovery need platform certification. A compiled binary or upstream supported model is not Groot device certification.

Public descriptor/BSMS/JSON and PSBT/UR imports are bounded, parsed natively, network checked and private-material filtered. Signatures cannot alter reviewed non-signature PSBT fields. BIP329 imports prove ownership and commit additive metadata atomically. Multipath presentation does not change persisted descriptor pairs.

## Mobile foundation

ADRs 0093–0096 restore the retained coordination domains through WalletPort, with native iOS secret sheets and worker-based commands. New iOS wallet-secret files add a device-bound Keychain layer (secure-store v6, with credential-based access under ADR 0097); desktop/node-auth files retain their existing portable format, and existing files are not silently converted. The fixed Testnet4 development identity and actual linked-library/network check remain mandatory. Native capability guards reject other mobile signing platforms/networks and keep USB signing/multisig broadcast on desktop.

BIP129 QR enrollment authenticates signer records and binds the final complete public policy. Mobile review parses the actual PSBT and signs its exact revision; desktop keeps signature-only validation and merge. Desktop owns receive allocation for paired/watch-only phone views; standalone software wallets retain local authority. No live metadata sync or relay is introduced. [Current candidate evidence](testing/5.3.0-rc2-mobile-keys.md) distinguishes unit/Core passes from unfinished physical acceptance.

## App updates

Shell presentation → WalletPort app-update methods → Rust `updates.rs`. This application-wide service never reads wallet state. Native state holds selected assets and opaque reveal capabilities; raw paths/URLs/keys are not accepted from IPC. Local preferences own notes dismissal and once-daily opt-in. The compiled owner-verified key is separate from the release being checked. ADR 0086 owns bounds, redirect, cache and cancellation policy.

## Diagnostics and release

Allowlisted diagnostics retain stable codes and coarse scalar context, never arbitrary errors or sensitive payloads. Clipboard is explicit and typed; no secret reads or analytics sink. The [security model](security-model.md) owns control details.

[Current status](implementation-status.md) owns capability claims, [ADRs](adr/) own decisions, and the [Mainnet checklist](mainnet-release-checklist.md) owns exact-candidate evidence. Release/source-hash guards, provenance and signatures are independent of runtime tests. Documentation cleanup does not refresh authorization or reviewed-source hashes.

ADR 0097 retains iOS v6 ciphertext and device binding while using a separate passcode-protected, device-only Keychain account without per-read user presence. Legacy keys are copied only after successful Groot credential decryption; originals are retained. No persisted wallet format changes.
