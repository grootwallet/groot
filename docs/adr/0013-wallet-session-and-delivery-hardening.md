# ADR 0013: wallet-scoped sessions and durable delivery

Status: accepted

The wallet-switch revocation clause is superseded by ADR 0017. UUID isolation and the five-minute monotonic idle deadline remain in force.

## Context

Satchel supports multiple isolated wallets, persisted PSBT proposals, and webview notifications. A process-global unlock flag, restart-reset authentication delay, destructive notification drain, or UI-recomputed review field can turn otherwise correct boundaries into cross-wallet authorization, brute-force, lost-event, or transaction-intent failures.

Hardware Wallet Interface execution also crosses a process boundary. Resolving an executable by ambient `PATH` would let an untrusted binary impersonate HWI.

## Decision

- An unlock session is bound to the selected wallet UUID, expires after five minutes of inactivity using monotonic time, and is cleared on wallet switch, deletion, reset, or explicit lock.
- Failed-authentication counters and retry deadlines are persisted in the selected wallet database. Restarting Satchel does not reset the delay.
- Sensitive and state-changing wallet commands are serialized within the process. Persisted proposal/signature updates additionally use compare-and-swap conditions so stale concurrent updates fail closed.
- Transaction review uses only the authoritative Rust proposal returned from the persisted PSBT. Satoshi amounts must be safe integers; the returned fee rate is the integer rate actually applied to the builder.
- Core broadcast is idempotent by expected txid. Once accepted, proposal broadcast state and the notification row are committed atomically. Failure to refresh the chain afterward is reported as `syncPending`, not as a failed broadcast.
- Notification rows are durable, unique, ordered, and remain pending until explicit acknowledgement. This provides at-least-once delivery across crashes; consumers must use stable IDs and persistent wallet state idempotently. Satchel does not claim impossible cross-process exactly-once UI delivery.
- Single-key deletion requires the credential and exact `DELETE`; multisig deletion requires the credential, exact wallet name, and an in-session recovery drill bound to the current descriptor.
- HWI is launched only from an absolute build-time or known operating-system installation path. `PATH` lookup is prohibited. Device commands include both the freshly enumerated device type and exact path, as required by HWI. Device-sensitive operations re-enumerate and require a fingerprint belonging to the selected wallet.

## Consequences

Unlocking one wallet cannot authorize another. Authentication cooldown survives ordinary restart attacks. A renderer crash cannot silently consume a notification, and a post-broadcast sync outage cannot encourage an accidental duplicate payment. Retry may display an already-pending notification again, which is safer than loss and is handled idempotently.

The in-process serialization is not a cross-process file lock. Production packaging must enforce a single app instance or add an interprocess registry lock. Physical device compatibility, HWI artifact hash/version verification, platform keystore certification, background notification scheduling, and external review remain mainnet blockers under ADR 0012.

## Hardening addendum — 2026-08-04

- A denied or unavailable Apple Keychain lookup is distinct from an absent item and must fail closed; it must never create a replacement device-wrapping key.
- The legacy regtest-to-UUID profile migration may copy the existing device-wrapping key from its known legacy Keychain account only after that key and the submitted wallet credential authenticate the already-encrypted envelope. It never generates a replacement key, and all denial, absence, mismatch, and wrong-credential paths remain closed.
- A macOS Keychain access error may retry the same item through the original Keychain Services API to allow native authorization after an ad-hoc development rebuild. Successfully read device keys are held in zeroizing process memory for the current launch only; denial and cancellation still fail closed.
- Wallet databases and private metadata reject symlink/non-regular storage. SQLite connections use owner-only permissions on Unix, a busy timeout, foreign keys, untrusted-schema mode, and defensive mode.
- HWI execution canonicalizes the configured binary, rejects group/world-writable executables on Unix, and clears the inherited environment before spawning. A later BitBox compatibility amendment restores only the canonical home directory resolved by Tauri because HWI must read the existing BitBoxApp pairing cache; no other ambient variable is inherited.
- Credential and mnemonic IPC inputs are bounded. Credential fields are cleared on every attempt and route teardown.

## Cross-process addendum — 2026-08-11

This addendum supersedes the earlier consequence that cross-process exclusion was not implemented. Native startup now acquires an operating-system file lock for the exact resolved application-data directory before wallet commands become available and retains the open file for the process lifetime. A second Groot process using the same registry and wallet directories fails closed. The lock file is owner-only on Unix, rejects symlink and non-regular paths, is deliberately never deleted or replaced, revalidates device/inode identity on Unix, and denies delete sharing on Windows while the handle is open. Kernel lock release after forced process termination provides crash recovery without stale-PID deletion races. Distinct explicitly isolated regtest application-data directories may still run concurrently. Packaged-app second-launch presentation and each later platform build remain release acceptance evidence; they are not reasons to weaken the exclusion boundary.

## Authentication clarification — 2026-08-12

[ADR 0028](0028-security-review-remediation-boundaries.md) narrows “authentication cooldown survives ordinary restart attacks” to a command-complete rule: every native command that verifies a wallet credential participates in the persisted wallet throttle, and a process-monotonic retry floor prevents wall-clock rollback from shortening a live-process delay. The persisted deadline necessarily uses operating-system wall time; clock control combined with repeated process restart remains an explicit residual until a platform trusted-time and boot-identity design is reviewed.
