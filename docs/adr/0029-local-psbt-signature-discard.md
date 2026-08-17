# ADR 0029: Local PSBT signature discard is not revocation

- Status: Accepted
- Date: 2026-08-12
- Applies to: Active external-signer and multisig proposals

## Context

Groot persists one canonical PSBT revision per active proposal. A signer can therefore be added accidentally, while an earlier less-signed revision is not retained. Users need a way to return the local proposal to a lower signature count without rebuilding the transaction, but Bitcoin signatures copied outside Groot cannot be revoked.

## Decision

Groot offers **Discard local signature** on a signer that is validly signed on every proposal input. This applies both to a signer in a multisig proposal and to the one authenticated signer in an external-hardware single-key proposal. After explicit confirmation, Rust verifies the current PSBT, removes only that wallet signer's partial signatures from every input, verifies the resulting progress, and atomically replaces the exact reviewed PSBT revision. The unsigned transaction, PSBT metadata, and every other signature remain unchanged. If the threshold is no longer met, proposal status returns from `ready` to `collecting`.

The confirmation states that this is not revocation. Previously exported, copied, scanned, or shared PSBT revisions may still contain the signature and remain usable or broadcastable when sufficiently signed. Groot does not retain a local PSBT revision history in this change.

## Consequences

An accidental local signature can be removed without rebuilding payment intent or invalidating honest signatures. Concurrent changes fail closed through an exact-PSBT compare-and-swap. The feature provides local state control only; actual revocation still requires replacing or abandoning the transaction under Bitcoin's transaction and key-management rules.
