# ADR 0060: Structured app-log error context

- Status: accepted
- Date: 2026-09-08
- Extends: ADR 0058 and ADR 0059

## Context

A terminal failure identified only by a stable error code is safe but often too thin
for support. In particular, `node_history_unavailable` did not state which recovery
birthday and anchor were requested or which full blocks the configured pruned Bitcoin
Core node still retained. Finding failures also required text search because App logs
could filter only by event type.

Persisting the original error message is not acceptable. RPC failures, hardware-tool
output, transport errors, and future call sites can contain node endpoints,
authentication material, onchain identifiers, user-authored labels, or other values
that the diagnostic boundary explicitly excludes.

## Decision

Version-1 diagnostic records may add two optional fields to failed events:

- `errorMessage` is selected from a fixed message table keyed by the already
  allowlisted stable error code.
- `errorDetails` is a closed typed object whose fields must be individually reviewed.
  The first approved fields are recovery-scan block heights: requested birthday,
  required anchor, earliest retained full block, and minimum usable birthday.

Unknown error codes remain `internal_error`, use its fixed generic explanation, and
drop all structured details. Arbitrary native error messages and request/response
payloads never enter the record. JSON and CSV exports include the approved fields.
The viewer displays the source commit, groups failure detail visibly, and offers an
independent closed-enum multi-select outcome filter. Recovery-scan forms show the same
block facts using the existing durable inline error pattern.

## Compatibility and consequences

The JSONL change is additive: all new fields are optional and existing version-1
records continue to deserialize without migration. Wallet databases, registry,
profiles, proposals, backups, descriptors, node settings, and secret envelopes are
unchanged. The record remains bounded by the existing per-record and 16 MiB file
limits. New error-detail fields require the same threat review and allowlist treatment
before they can be persisted. This changes no scan semantics or BIP support evidence.
