# ADR 0030: Label provenance and privacy-aware coin selection

## Status

Accepted

## Context

Receive labels and payment labels previously lived only on address and proposal rows. A change output was presented as generic “Change,” so the wallet could neither explain its source nor avoid unnecessary privacy-cluster merges during automatic selection. Treating an outgoing payment purpose as the source of change would also be incorrect: payment intent describes the destination, while change retains the provenance of the inputs.

## Decision

Rust owns a normalized, versioned label schema with immutable labels, exact subject assignments, output lineage, input lineage, and persistent privacy-cluster links. Existing address and proposal labels are backfilled in one idempotent SQLite transaction. New normalized label text cannot be reused for a distinct intent.

An exact incoming wallet output inherits its receive-address label. Change inherits the union of its wallet-input provenance. Multiple sources are `mixed`; unavailable source data remains explicitly `unknown`. Payment intent is assigned independently to proposals and bound to the actual txid atomically with broadcast. RBF and CPFP proposals inherit that intent, while their change still follows input lineage.

Automatic selection is executed inside the Rust/BDK transaction builder. Balanced is the default compromise, More private gives first priority to avoiding reused/unknown/unrelated sources, and Lower fee ranks effective value after each descriptor-derived input weight. Frozen coins remain unspendable in every automatic strategy, and manual selection remains exact. BDK remains authoritative for input weight, fee, dust, and change calculations. Random tie-breaking uses the RNG injected through BDK's selector boundary and is deterministic under a seeded test RNG.

The webview receives typed label/provenance summaries and renders them without reconstructing lineage. Discreet and locked surfaces do not expose permanent-label text.

## Consequences

- Provenance survives restart, reorg presentation, replacement history, and proposal acceleration without conflating payment purpose with source.
- Selection heuristics improve privacy but do not claim to prove unlinkability; the final PSBT review reports concrete warning conditions.
- Historical duplicate legacy labels remain readable during migration, but all newly created intents enforce non-reuse.
- Mainnet remains disabled under ADR 0012 and this decision does not relax its release gate.

## Tracking

Closes [issue #9](https://github.com/thibistaken/groot/issues/9).
