# ADR 0055: Authorize an isolated mainnet certification candidate

- Status: accepted for certification only; distribution remains blocked; unlock presentation, remote-Core exclusion, and the source-merge prohibition are partly superseded by ADR 0056 and ADR 0061
- Date: 2026-09-03
- Extends: ADR 0012, ADR 0026, ADR 0052, ADR 0053, ADR 0054

## Context

The disabled mainnet policy, transaction limits, hardware scope, and pre-wallet
Bitcoin Core admission have received focused review. The remaining release gates
cannot be exercised against an unreachable build. Producing evidence therefore
requires one explicit mainnet build identity without prematurely approving a
release or transferring Testnet4 evidence.

## Decision

One dedicated macOS Apple-silicon mainnet candidate may be compiled from the
isolated enablement branch for review and certification. It uses bundle identifier
`app.groot.wallet.mainnet`, separate application storage, and a compile-time
`mainnet` identity. No runtime preference can turn another build into mainnet.

The candidate includes only the software, hardware, and standard multisig scope in
ADR 0052. Before any mainnet wallet database is created or opened, Rust must admit
an authenticated, synchronized Bitcoin Core instance over admitted loopback HTTP or
direct HTTPS with the exact
mainnet genesis. The admission is purpose-, wallet-, configuration-, and
time-bound. Mainnet activity sync uses that Core instance only. Esplora backend,
Tor, compact filters, Payjoin, batch payments, guided Miniscript policies,
mobile, Windows, and automatic updates remain unavailable.

Every payment remains subject to the trusted one-recipient, positive-amount,
1,000,000-satoshi ceiling and final persisted-PSBT revalidation. A persistent
high-visibility mainnet warning distinguishes real bitcoin from rehearsals.

This authorization permits source review, two-machine unsigned reproducibility,
Developer ID packaging/notarization, exact-candidate lifecycle tests, approved
physical-device tests, and a deliberately minimal-value owner-controlled mainnet
rehearsal. It does not authorize public distribution, broader
wallet/device claims, or use of meaningful funds.

## Exit and rollback boundary

The candidate must remain isolated until its exact enablement diff is independently
reviewed, clean machines produce matching unsigned evidence, the signed package and
SBOM/provenance are verified, and every applicable checklist item has linked
evidence. Any mismatch, unresolved finding, signing/provenance concern, unexpected
network path, or accounting discrepancy stops testing and invalidates the
candidate. Test data must be disposable and sanitized.

ADR 0012 continues to block distribution. ADR 0061 separately authorizes merging
its compile-time-isolated candidate implementation to `main` without accepting a
release decision. ADR 0053 remains the release decision and may be accepted only
after all of its exit conditions and the mainnet release checklist are complete.

## Consequences

Mainnet code is reachable only in the dedicated candidate build, allowing the
remaining gates to be tested honestly. The build is intentionally non-distributable
and not a mainnet-readiness claim. Testnet4 results remain supporting evidence tied
to their exact binaries.
