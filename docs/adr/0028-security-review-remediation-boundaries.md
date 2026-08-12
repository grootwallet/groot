# ADR 0028: Security-review remediation boundaries

- Status: Accepted
- Date: 2026-08-12
- Applies to: Regtest, Signet, and Testnet4 builds; mainnet remains blocked

## Context

An independent read-only review of commit `dc16efa` identified gaps in public-network secret-envelope loading, credential throttling, imported-PSBT signature validation, locked-state descriptor privacy, RPC credential memory hygiene, durable cooldown time semantics, and failed-creation Keychain cleanup. The same review also found smaller error-typing, network-copy, timeout-policy, and proposal-resumption documentation inconsistencies.

These gaps cross settled Groot boundaries: the Rust layer owns credentials and PSBT truth; locked wallet metadata is private financial data; public-network builds must preserve the same envelope semantics as Regtest; and a failed wallet creation must not leave a device key without an owning profile.

## Decision

1. A version-2 secret envelope is always opened first with its current UUID-scoped device key. The Regtest legacy-account migration is attempted only when that key is specifically missing and only in a Regtest build. Wrong credentials, corrupt metadata, or unavailable secure storage never enter migration.
2. Every command that verifies a wallet credential, including external-signer descriptor export, uses the selected wallet's persisted authentication throttle. The process also maintains a monotonic retry deadline so wall-clock changes cannot bypass a cooldown while the process remains alive.
3. Every ECDSA partial signature in an imported PSBT is verified against the actual input sighash and public key before it can be counted, merged, persisted, or displayed. Groot continues to accept only `SIGHASH_ALL`. Invalid signatures return `invalid_signature` without changing proposal state.
4. Full multisig descriptors and cosigner xpub metadata require the selected multisig wallet to be unlocked. Setup preview remains public-data computation and does not read saved wallet metadata.
5. Recurring Core RPC client construction borrows the unlocked session credential directly into the narrow transport constructor instead of cloning it into `bitcoincore_rpc::Auth::UserPass`. Credential assembly and local request buffers are zeroizing. Copies necessarily owned by the pinned HTTP/TLS libraries remain a documented process-memory residual and are bounded by the unlocked session and request lifetime.
6. Failed software, external-signer, standard multisig, recovered multisig, BSMS recovery, and Miniscript recovery creation share one rollback boundary that removes the UUID device key before removing the partial profile directory.
7. The inactivity timeout allowlist is exactly 1, 5, 15, 30, or 60 minutes at the Rust persistence boundary. Network-specific address errors derive from the compiled network. Dust and coin-selection failures use stable actionable error classes.

## Residual risks

- A restart-safe cooldown ultimately depends on the operating system wall clock. The monotonic floor prevents same-process clock manipulation, but an attacker able to change the system clock and repeatedly restart Groot can still influence durable retry timing. Removing that residual requires a reviewed platform trusted-time/boot-identity design; it must not be approximated with an untrusted persisted monotonic value.
- The pinned RPC libraries may allocate internal credential-derived HTTP header buffers that Groot cannot zeroize directly. Groot removes avoidable application-owned plaintext copies, keeps RPC secrets wallet/session scoped, and clears the source session on lock, expiry, deletion, and process exit.
- Static and automated evidence does not replace signed-package memory inspection, physical-device certification, or funded public-network rehearsal.

## Consequences

Public-network wallet credentials use the same authenticated envelope path as Regtest. A malformed signer import cannot create false progress or occupy a signer's slot. Locked renderer access no longer reveals saved multisig derivation metadata. Creation rollback is symmetric across wallet kinds. These changes restore documented behavior and do not enable mainnet.

Regression evidence is recorded in [`../security-hardening-2026-08-12.md`](../security-hardening-2026-08-12.md). ADR 0013 remains authoritative for wallet sessions and persisted throttling; this ADR narrows its time and command-coverage semantics. ADRs 0015, 0016, 0017, and 0027 remain authoritative for external signers, RPC transport, independent sessions, and compile-time networks respectively.
