# ADR 0058: Sanitized diagnostic event log

- Status: accepted
- Date: 2026-09-06

## Context

Support and internal release testing need a durable account of meaningful wallet
operations without turning logs into a second wallet database or a source of
correlatable secrets. Renderer-authored diagnostic payloads, generic string maps,
full identifiers, and dependency logs would make reliable redaction impossible.

## Decision

Rust owns one app-scoped, version-1 append-only JSONL diagnostic file outside every
wallet directory. Records use closed enums and fixed optional scalar fields. They
contain a Unix timestamp, app version, source commit, compiled network, platform,
event, outcome, trigger, wallet kind, sync source, bounded percentage/count, export
format, and a strictly allowlisted stable error code. Unknown errors collapse to
`internal_error`. No command accepts diagnostic context from the renderer.

The schema has no fields for credentials, recovery words, seeds, private or public
descriptors, keys, RPC authentication or endpoints, PSBTs, raw transactions, full
addresses, txids, outpoints, device paths/identifiers, wallet IDs/names, labels, or
amounts. Dependency diagnostics are not forwarded. Records stop rather than rotate
at a 16 MiB bound, preserving append-only history without unbounded writes.

The utility route is available from the application shell while locked and treats
network status as locked. It reads only the sanitized app-level file. Native export
produces deterministic JSON or CSV through an explicit save dialog. Automatic sync
records one start and terminal outcome per bounded run; polling ticks are not events.

## Compatibility and consequences

No wallet database, registry, proposal, backup, descriptor, node-setting, or secret-
envelope format changes. Existing profiles require no migration. Removing a wallet
does not erase the sanitized app history. The log is diagnostic rather than an
authoritative transaction ledger and cannot be used to reconstruct wallet state.
Mainnet distribution remains governed by ADR 0012 and the internal candidate gate.
