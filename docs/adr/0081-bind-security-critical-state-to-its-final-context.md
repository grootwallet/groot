# ADR 0081: Bind security-critical state to its final context

- Status: accepted
- Date: 2026-10-04
- Supersedes: ADR 0077's version-4 write format

## Context

The v0.4.96 security reviews identified several defense-in-depth gaps: final
external/multisig PSBTs did not all pass the canonical prevout binder, software
signing was not bound to the exact reviewed PSBT serialization, labels accepted
invisible formatting, acceleration preparation could occupy the native command
thread, destination policy admitted uncertified witness versions, and encrypted
envelope AAD did not name the wallet and secret purpose.

## Decision

- Canonicalize and verify wallet prevouts immediately before every external and
  multisig finalization/broadcast.
- Give each software proposal a domain-separated binding to its ID and exact
  reviewed PSBT bytes; signing rejects a missing, stale, or changed binding.
- Reject control, bidi, and invisible formatting characters in new and imported
  permanent-payment and signer labels. Existing labels remain unchanged.
- Run RBF and CPFP preparation on the blocking worker pool.
- Permit send destinations only for legacy P2PKH, P2SH (including nested
  SegWit), SegWit v0 P2WPKH/P2WSH, and SegWit v1 P2TR. P2A and witness v2-v16
  fail closed. This does not add Taproot receive-wallet support.
- Write secure-store version 5. Its payload and credential-wrap AAD include the
  immutable wallet UUID and purpose (`wallet-secret` or `node-auth`). Correctly
  authenticated v2/v3/v4 envelopes migrate automatically and atomically on
  use. Wrong credentials, corruption, unsupported versions, or write failure
  leave the original bytes unchanged.

Automatic migration is approved for existing profiles. Once any envelope is
rewritten as v5, Groot v0.4.96 and older cannot reopen that migrated protected
record. No downgrade path is provided.

## Consequences

Transaction and destination policy become stricter but descriptors, PSBT wire
encoding, keys, and wallet databases do not change. The envelope change is a
persisted-format migration; wallet identity and purpose are now authenticated
without binding profiles to a filesystem path or device. Item 12 (automatic
coin-confirmation policy) and every other unapproved report proposal remain
deferred.

## BIP impact

Groot may pay BIP16/legacy, BIP49-compatible P2SH, BIP84/SegWit-v0, and
BIP350/Taproot-v1 destinations. Taproot key management, receiving, descriptors,
signing, recovery, and hardware certification remain unsupported.
