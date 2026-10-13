# ADR 0076: Require Mainnet multisig verification to intersect every quorum

- Status: accepted for the isolated certification candidate; distribution remains blocked
- Date: 2026-10-02
- Supersedes: ADR 0065's threshold-only receive-readiness count

## Decision

Before issuing a new Mainnet multisig receive address, Groot requires matching
interactive policy-and-first-address evidence from `max(t, n - t + 1)` distinct
signers. This both forms a spendable verified quorum and ensures every possible
signing quorum contains a verified key. Coldcard policy-file acknowledgements
remain mandatory but do not count as interactive address evidence. Non-Mainnet
behavior is unchanged.

## Consequences

A 2-of-4 wallet now needs three interactive verifications; two are insufficient
because the other two keys could form an unverified quorum. Configurations that
cannot meet the rule with supported Ledger, BitBox02, or Jade verification stay
receive-blocked. No persisted format changes.
