# ADR 0047: Cap explicit label drafts

## Status

Accepted. Supersedes only the twelve-label creation limit in ADR 0046; its persistence,
immutability, reuse, isolation, and provenance decisions remain in force.

## Context

Five labels cover the useful explicit relationships for a new receive request or payment intent while
keeping the in-field token editor compact and reviewable. Wallet history and provenance can still
accumulate more labels after consolidation or other onchain activity, and existing schema-v3 records
may already contain up to twelve assignments.

## Decision

- A newly submitted receive request or payment intent has one to five distinct permanent labels.
- The renderer and Rust command boundary enforce the same limit. The suggestion strip disappears at
  the limit, and further text input is ignored until a draft token is removed.
- Existing records and provenance-derived views may contain and display more than five labels. This
  cap applies only to new explicit receive and payment drafts.

## Compatibility

No schema, assignment, proposal, address, or registry format changes. Existing records containing
six to twelve labels remain readable and immutable; the new limit applies only when creating a new
address or proposal.
