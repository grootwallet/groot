# ADR 0046: Multiple permanent-label assignments

## Status

Accepted. Extends ADR 0045 without changing its reuse and isolation rules.

## Context

A receive request or payment intent can belong to several useful relationships, such as a client,
project, and accounting period. Flattening those relationships into one string harms later search and
provenance. Existing releases and legacy columns nevertheless expect exactly one primary label.

## Decision

- A newly submitted receive request or payment intent has one to twelve distinct permanent labels.
- Each label remains bounded to 48 characters and is deduplicated by the existing case-insensitive,
  whitespace-collapsed reuse key. Assignments remain append-only and cannot be edited or removed.
- The first submitted label remains the primary assignment and continues to populate legacy address
  and proposal label fields. Additional assignments live in a schema-v3 additive table.
- Suggestions selected in the draft UI become removable chips and disappear from the available list.
  Removing a chip before submission has no persisted effect.
- Provenance carries every receive-origin label. Multiple labels on one source cluster remain Known;
  Mixed means distinct public source clusters were actually joined.

## Compatibility

Schema v3 creates `groot_additional_label_assignments` without rewriting or deleting existing rows.
Existing v2 primary assignments, address and proposal labels, transactions, BDK state, descriptors,
wallet registry data, secrets, and backups are unchanged. A v0.4.38 rollback reads the primary label,
ignores the additive table, and leaves it intact; reopening with v0.4.39 restores the full set. No
discard or destructive migration is required.

## Consequences

Rust accepts and validates the complete label array and persists it atomically with the subject.
DTOs expose the full ordered set while keeping the primary `label` field for compatibility. Review,
receive history, and address details render the complete set, and accessibility names remain useful.
