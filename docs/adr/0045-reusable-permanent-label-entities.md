# ADR 0045: Reusable permanent-label entities

## Status

Accepted. Supersedes only ADR 0030's prohibition on reusing normalized label text.

## Context

Permanent assignments protect receive-address history and payment review, but treating label text as
globally single-use inside one wallet prevents an intentional relationship such as repeated salary,
client, household, or vendor activity. Copying slightly different text also makes provenance less
honest. The existing schema already separates a stable label entity from immutable subject
assignments and already lets acceleration proposals inherit a payment label.

Suggestions are sensitive financial metadata. They must not appear before authentication, survive
in renderer persistence, or combine history from different wallet profiles.

## Decision

- Keep every receive-address and payment-intent assignment immutable and append-only. There is no
  relabel, unassign, or history-erasure API.
- Normalize bounded label text in Rust. When its case-insensitive, whitespace-collapsed key matches
  an existing wallet label, assign that stable entity to the new exact subject instead of creating
  a second entity or rejecting the operation.
- Repeated text is an intentional relationship. Provenance and coin selection use the shared label
  identity, while distinct onchain clusters remain distinct. A PSBT that joins them still reports a
  new public link.
- The selected unlocked wallet snapshot may expose up to twelve recently assigned label
  suggestions with receive/payment usage summary. Suggestions never select, overwrite, or submit a
  field. They come from the selected wallet's isolated SQLite database, are unavailable through
  locked command surfaces, and are not rendered while discreet mode is active.
- Advance the label-schema marker from version 1 to version 2 without rebuilding any table. Existing
  label rows—including legacy duplicate-text entities—assignments, addresses, proposals,
  transactions, output lineage, privacy clusters, and delayed Recovery/Inheritance data remain
  unchanged. New matching uses the canonical entity that owns the normalized reuse key.

## Compatibility

This is a backward-compatible additive semantic migration. Existing databases open in one
idempotent transaction and only the schema-version marker advances. There is no migration-versus-
discard decision because no supported data is rewritten, dropped, or made unreadable.

Wallet registry, secret-envelope, proposal, public metadata, BDK, and Groot descriptor-backup
formats do not change. Descriptor backups continue to recover descriptors and policy metadata; as
before, local transaction history, address assignments, proposals, provenance, and suggestions live
in the isolated wallet database and are rediscovered or retained with that database rather than
embedded into the public descriptor backup.

## Consequences

The UI must state that reuse groups related activity and that an actual spend can still create a new
public link. English, French, and Spanish copy must preserve that distinction. Migration tests must
prove v1 row preservation, and session/acceptance tests must prove explicit selection plus locked and
cross-profile isolation.
