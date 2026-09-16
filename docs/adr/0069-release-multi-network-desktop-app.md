# ADR 0069: Release one restart-bound multi-network desktop app

- Status: accepted for GA scope; distribution remains blocked by the release checklist
- Date: 2026-09-16
- Supersedes: ADR 0053 and ADR 0055 where they require a dedicated Mainnet-only GA artifact; ADR 0068 where it classifies the multi-network artifact as permanently internal-only
- Extends: ADR 0027, ADR 0052, ADR 0068

## Context

ADR 0068 introduced a restart-bound internal desktop build that can select
Regtest, Testnet4, or Mainnet without allowing one network to read another
network's registry, profiles, databases, proposals, credentials, or node setup.
Earlier release planning assumed that public artifacts would remain fixed to one
network and that only a dedicated Mainnet build could become GA.

The release owner has now selected one multi-network macOS desktop application
as the intended GA product so users can deliberately choose a testing network or
Mainnet without installing separate applications. This is a release-scope
decision, not evidence that the current internal package is ready to distribute.

## Decision

The first macOS Apple-silicon GA artifact will use the reviewed `multi` native
identity and offer exactly Regtest, Testnet4, and Mainnet in Settings. Signet
remains a fixed rehearsal build and is not a GA runtime choice.

A network change remains explicit, confirmation-bound, persisted by Rust, and
effective only after a full application restart. Rust loads and validates the
choice before the common application-root process lock and before any HWI chain,
wallet registry, node configuration, or database can be selected. Restart must
tear down every wallet session, decrypted credential, admission, mnemonic,
proposal, hardware capability, and in-flight operation before another network
can open.

Each network retains its existing isolated namespace. The common root owns the
single process lock and the non-secret network-selection file; it is not a
shared wallet-data namespace. Mainnet retains every exact-genesis Core admission,
backend restriction, transaction cap, one-recipient rule, HWI policy, signing/
broadcast recheck, and release gate that applies to the dedicated certification
build. Selecting Mainnet never converts Regtest or Testnet4 data and never
weakens those controls.

The GA package uses the general Groot product identity and must visibly identify
the active network on onboarding, lock, wallet, review, signing, and Settings
surfaces. Regtest and Testnet4 must be described as test networks; Mainnet
selection must explicitly warn that it uses real bitcoin. A network switch must
never be inferred from an RPC URL, wallet descriptor, imported file, or renderer
preference.

This decision changes no wallet, registry, database, profile, proposal, backup,
descriptor, credential-envelope, or selector format. Existing fixed-build and
internal multi-network data remains untouched. There is no automatic migration
between the fixed Mainnet application-data root and the multi-network Mainnet
namespace. Any future migration or import of an existing fixed-candidate profile
requires a separate compatibility decision and explicit release-owner approval;
backup recovery remains the current transition path.

## Additional GA evidence

Before distribution, the frozen multi-network artifact must complete the normal
Mainnet checklist plus:

1. independent review of selector-file integrity, startup ordering, common-root
   locking, restart teardown, and every fixed-build non-regression;
2. create/restart/switch/return tests with a disposable wallet and node setup in
   all three selectable namespaces, proving exact isolation of wallets, labels,
   proposals, credentials, notifications, and cached public network status;
3. malformed, oversized, symlinked, unknown-version, and unknown-network
   selector-file rejection before wallet access;
4. switching while wallets are locked and unlocked, while sync or hardware work
   is active, after a crash, and after forced termination, with no stale session
   or late result crossing the restart boundary;
5. Mainnet transaction-policy, HWI, Core-admission, recovery, packaging,
   reproducibility, signing/notarization, update/rollback, and independent-review
   evidence on the exact multi-network binary; and
6. signed release notes that name all three choices, their isolated storage, the
   real-bitcoin Mainnet warning, and the fact that Signet is not selectable.

No evidence from one selected network certifies another. The fixed Mainnet
candidate remains useful supporting evidence, but the final critical rows must
be repeated on the exact signed multi-network GA artifact.

## Consequences

The release no longer requires users to install separate Regtest, Testnet4, and
Mainnet applications. The final evidence surface is larger because network
selection, restart teardown, and cross-network isolation become production
security boundaries. The current internal multi-network app remains
non-distributable until the new evidence above and every applicable Mainnet
release row pass, ADR 0053's remaining risk decision is accepted as amended by
this ADR, and ADR 0012 is superseded for distribution.
