# ADR 0068: restart-bound multi-network Settings mode

- Status: accepted for internal builds; public distribution remains blocked
- Date: 2026-09-15
- Extends: ADR 0027, ADR 0053, ADR 0055

## Context

Groot's audited release artifacts bind one Bitcoin network into the native binary,
frontend bundle, application identifier, and release evidence. That makes a release
easy to identify, but it prevents an internal user from moving between Regtest,
Testnet4, and Mainnet from Settings. Treating an RPC URL or renderer preference as
the network would be unsafe: an existing registry, descriptor, credential, proposal,
or database could be interpreted under the wrong chain.

## Decision

Add an explicit `multi` native build identity for internal use. Its Settings screen
offers exactly Regtest, Testnet4, and Mainnet. A change requires confirmation, is
persisted by Rust as a small versioned owner-only file, and restarts Groot. Rust loads
the choice before the process lock is acquired and before any command can derive an
HWI chain, load node configuration, or open a wallet database. The trusted startup
response applies that non-secret choice to the frontend configuration before any
wallet route mounts. Fixed builds keep the existing native/web identity check and
fail closed on mismatch.

The multi-network application keeps the existing `app.groot.wallet` Regtest data at
its current location for compatibility. Testnet4 and Mainnet receive distinct
`networks/testnet4` and `networks/mainnet` directories below that application root.
The process lock moves to the common root so two processes cannot race the global
selection. There is no wallet/profile/registry/secret/database migration, and no
network can read or mutate another network's data.

Fixed Regtest, Signet, Testnet4, and isolated Mainnet builds retain their existing
compile-time identity, storage location, and disabled network switch. The multi build
does not become a distributable Mainnet artifact merely because its code is
functional. When it is on Mainnet, every existing exact-genesis Core admission,
database-open gate, approved-policy restriction, transaction amount cap, backend
restriction, HWI verification requirement, and signing/broadcast recheck still
applies. Public Mainnet distribution remains blocked by ADR 0012 and the complete
release checklist.

Malformed, oversized, symlinked, unknown-version, or unknown-network selection files
abort startup. The Regtest test-only data override forces Regtest and disables
switching. Signet remains available through its fixed rehearsal build but is not a
choice in the new three-network product control.

## Consequences

Network changes are slightly slower than an in-process toggle because they restart
the application, but startup remains constant-time and the restart removes every
wallet session, decrypted node credential, pending mnemonic, proposal, hardware
capability, and in-memory admission. Normal wallet operations pay only an atomic
read of the process-lifetime network selector.

Any proposal to distribute the multi-network build, share data across its network
directories, add another selectable network, remove the restart, or relax the
Mainnet controls requires a new threat-model and release decision.
