# ADR 0074: Move multisig network adoption after creation

- Status: accepted for the internal candidate; distribution remains blocked
- Date: 2026-09-26
- Supersedes: ADR 0066's creation-screen network-copy choice only

## Decision

At the release owner's request, multisig creation no longer offers another
wallet's network setup in the final backup/PIN step. Adoption remains an explicit
Settings action after creation, with source unlock and Core validation unchanged.
This removes a cross-wallet unlock dependency from an otherwise complete setup.
Default managed Mainnet admission remains governed by ADR 0071; no connection is
silently copied from a locked wallet. Native callers that explicitly request a
source still retain ADR 0066's fail-closed pre-publication copy contract.

No persisted schema, identity, backup, key isolation, or signing change occurs.
Existing wallets and resumable drafts remain compatible without migration.
