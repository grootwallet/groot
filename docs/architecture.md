# Architecture

## Ownership

`route → existing component → WalletPort → native adapter → Rust command → domain/persistence/network`

Svelte owns presentation and transient orchestration. Rust owns entropy, secrets, credentials, descriptors, wallet policy, PSBT review/signing, persistence, sync and broadcast. DTOs and stable errors cross IPC; BDK internals and private key material do not.

Windows/Linux internal Testnet4 packages use the same trusted Rust/HWI boundary. Their build verifies official HWI 3.2.0 source and executable digests, extracts a sealed runtime, and compiles both source and runtime-manifest digests into Groot. Runtime never searches PATH or falls back to another helper. Public support still requires platform signing and physical certification (ADR 0106).

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

Mainnet fee protection, Bitcoin supply bounds, the single-recipient rule and coin/recovery rules are native policy. ADR 0099 removes the rollout payment/debit ceiling at preparation and shared final-PSBT authorization; exact native spend errors remain specific through EN/FR/ES localization. The UI cannot invent change, balances, maturity, signer readiness or fees. Exact error/event contracts remain stable across code movement.

## Network boundary

Core owns chain/mempool truth, fees and broadcast. The temporary fee-estimate DTO permits a null value per missing target; native conversion validates every returned rate, preserves available targets and never fills unavailable targets. Existing complete-target mempool adjustment remains bounded. This changes no persisted data format. Check the selected chain name and exact genesis before wallet-data reads. Mainnet database permits bind purpose, profile and the verified saved route; the separate throttle permit grants no wallet-data access.

- Local Core is loopback-only.
- Direct remote Core is HTTPS with platform certificate validation, no redirects, and bounded I/O. v3 onion HTTP requires an explicit numeric loopback SOCKS5 proxy; no local DNS/direct fallback.
- Managed Mainnet enrollment happens in Rust and protects each revocable principal under that wallet credential. The private Fulcrum history index must match Core's tip; matched transactions are verified against full active-chain blocks. Omission/availability and metadata exposure remain operator trust boundaries.
- Custom remote Core uses bounded filter-index `scanblocks`; local Core retains its full-block path. A pruned node cannot supply missing history.
- Optional Kyoto compact filters discover confirmed activity on test networks. Core still provides fees/broadcast. Manual/proxy modes forbid public-discovery fallback. Wallet checkpoints are durable; peer filters are memory-only. [Remaining work](compact-filter-deferred-work.md) limits support claims.

Initial genesis scans need explicit privacy consent. Shell-owned pause/resume prevents automatic sync races; saved scan status can reattach after route changes, lock or restart. Only atomic completion is verified history. Normal selected-wallet foreground sync runs every 35 seconds after each settled attempt.

A saved proposal opens from its persisted review without a fresh fee quote. Ordinary proposal lists can read the last committed state during Core refresh. Continuity retains the serialized maturity check. New-payment fee RPCs use a separate serialized worker lane so an unreachable node does not queue local wallet reads behind them. Rust binds the request to the selected wallet, unlock session and saved node credentials and verifies that binding again before publishing an observation. During Core's staged refresh, explicit lock can cancel the refresh and revoke the session through the persisted-read gate. The refresh rechecks cancellation after closing that gate and before starting its database transaction.

## Hardware and interchange

macOS discovery is passive bounded OS inventory, not HWI/vendor sessions. Short-lived opaque capabilities select one exact device path. Each account operation still proves full saved fingerprint/origin/xpub identity under a coordinated lease. Cancellation/switch/timeout revokes capabilities. Model-specific PIN/reconnect paths must retain their native guards (ADRs 0041/0048/0075).

Packaged HWI has a pinned digest and platform trust/installation policy. Internal multi-network RCs seal a manifest-pinned extracted runtime inside the app (ADRs 0098/0101). RC12 extends Testnet4 use to Coldcard, Ledger, BitBox02, Trezor and Jade, with one fresh full account proof and at most one action on one isolated client per operation (ADR 0102). For the owner-approved Developer ID 5.3.0 Mainnet path, release inputs include a separately signed and frozen extracted runtime. Independent executable builds and the final signed app bind the same runtime manifest (ADR 0104). The operation retains signature/digest checks and caches no live device state. Windows release verification currently fails closed; Linux installation ownership and passive discovery need platform certification. A compiled binary or upstream supported model is not Groot device certification.

Public descriptor/BSMS/JSON and PSBT/UR imports are bounded, parsed natively, network checked and private-material filtered. Signatures cannot alter reviewed non-signature PSBT fields. BIP329 imports prove ownership and commit additive metadata atomically. Multipath presentation does not change persisted descriptor pairs.

## Mobile foundation

ADRs 0093–0096 restore the retained coordination domains through WalletPort, with native iOS secret sheets and worker-based commands. New iOS wallet-secret files add a device-bound Keychain layer (secure-store v6, with credential-based access under ADR 0097); desktop/node-auth files retain their existing portable format, and existing files are not silently converted. The fixed Testnet4 development identity and actual linked-library/network check remain mandatory. Native capability guards reject other mobile signing platforms/networks and keep USB signing/multisig broadcast on desktop.

BIP129 QR enrollment authenticates signer records and binds the final complete public policy. Mobile review parses the actual PSBT and signs its exact revision; desktop keeps signature-only validation and merge. Desktop owns receive allocation for paired/watch-only phone views; standalone software wallets retain local authority. No live metadata sync or relay is introduced. [Current candidate evidence](testing/5.3.0-rc2-mobile-keys.md) distinguishes unit/Core passes from unfinished physical acceptance.

## App updates

Shell presentation → WalletPort app-update methods → Rust `updates.rs`. This application-wide service never reads wallet state. Native state holds selected assets and opaque reveal capabilities; raw paths/URLs/keys are not accepted from IPC. Local preferences own notes dismissal and once-daily opt-in. The compiled owner-verified key is separate from the release being checked. ADR 0086 owns bounds, redirect, cache and cancellation policy.

Both QR components use `qr-camera.ts` for user-initiated permission, local decoder startup and teardown. It releases late permission streams and rejects obsolete decoder callbacks; payment parsing and UR/proposal validation remain with their existing native owners.

## Diagnostics and release

Allowlisted diagnostics retain stable codes and coarse scalar context, never arbitrary errors or sensitive payloads. Clipboard is explicit and typed; no secret reads or analytics sink. The [security model](security-model.md) owns control details.

[Current status](implementation-status.md) owns capability claims, [ADRs](adr/) own decisions, and the [Mainnet checklist](mainnet-release-checklist.md) owns exact-candidate evidence. Under ADR 0109, external acceptance of a full commit is the internal package authorization boundary; focused source hashes, clean-state checks, provenance and signatures remain separate supporting controls. Documentation cleanup does not refresh public authorization or reviewed-source hashes.

## Retained Miniscript boundary

Rust compiles fixed Continuity roles and derives primary BDK conditions recursively, checking that no timelock survives selection. Proposal signer context recompiles and compares descriptors and path metadata before counting eligible owner/parent keys. Existing primary/delayed proposal persistence is unchanged. ADR 0100 binds named delayed paths to the exact uniform block-based CSV sequence in the persisted PSBT and verified descriptor metadata. No separate cached hardware-state or path identifier is persisted. Current confirmed-input age, frozen status, role quorum and canonical proposal identity are native authorization inputs; reorgs can make a saved proposal unavailable. Fixed templates use existing components and WalletPort operations; direct USB and phone Miniscript enrollment remain blocked.

Fixed continuity finalization binds the witness script to canonical wallet prevouts and uses the pinned Miniscript PSBT satisfier/interpreter against the transaction's actual timelocks. Current chain age is checked separately; it cannot authorize a different witness branch than the encoded sequence. Immutable analysis stays within the operation's signing context, while availability is read fresh.

The snapshot carries one transient list of path definitions compiled from the verified policy plus per-UTXO path status rows keyed by path index. Each row contains confirmed age, exact earliest inclusion height, remaining blocks and presentation blockers. This avoids one IPC request or repeated descriptor analysis per coin. Signer metadata is returned once per snapshot, not copied into every UTXO. Groot JSON recovery inspection derives the same definitions from verified policy context instead of treating every backup key as one flat threshold. The frontend validates indexes, order, thresholds, signer groups and fingerprints before joining or presenting those rows; inconsistent presentation data is hidden rather than guessed.

Rust owns the exact block facts. The webview may turn a recent observation and bounded seconds-remaining hint into an explicitly approximate local calendar time, but that value is transient display data and cannot select or authorize a spending path. Regtest suppresses the estimate because manual mining has no meaningful wall-clock schedule. Frozen and stale-chain states are action blockers kept separate from cryptographic path availability. The same native proposal checks still run before signature import and finalization, so the snapshot is not an authorization cache.

This is an additive DTO/presentation change. It does not alter descriptors, BIP68 sequences, PSBTs, wallet/profile/backup/proposal schemas, database transactions or signer authority. Existing profiles need no migration.

## Post-5.3 ownership

`wallet/profiles.rs` owns the existing registry/profile identity, preparation, commit and rollback helpers; `wallet/notification_delivery.rs` owns snapshot notification construction and transactional enqueue; `wallet/recovery_commands.rs` owns recovery settings and rescan IPC. Command names, DTOs, guard ordering and caller transaction boundaries are unchanged. These are nested orchestration adapters, retaining the existing coverage classification.

`wallet/acceleration-quotes.ts` shares public quote reads and stale-response rejection for both Send routes. Its currentness callback remains route-scoped; it owns no wallet truth, credential, proposal or persistent state. `wallet/node-form.ts` supplies fresh presentation defaults only; native network validation remains authoritative.

Phone review and signing authenticate supplied previous transactions against each PSBT outpoint and witness output, without a network dependency. This differs from desktop canonical-history binding: full previous transaction data proves the committed output value/script but does not establish current spendability or confirmation. Existing native broadcast checks retain that role.

The shared `ur_transport/fountain.rs` guard validates canonical multipart headers before either QR decoder allocates work. Each transport retains its own limits and error mapping. `proposal/prevouts.rs` owns pure, non-mutating full-prevout authentication; phone commands retain their authorization, work-budget and credential checks. Settings snapshot reads live in `settings-data.ts`; `settings-actions.ts` owns per-action result lifetimes for one route instance. Dialog state remains route-local. Native work is neither cancelled nor authorized by a frontend lifetime check. These extractions change no persisted or IPC contracts.
