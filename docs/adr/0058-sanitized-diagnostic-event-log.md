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

An event is recorded when a durable user-visible state changes, or when a bounded
operation needs start, coarse-progress, and terminal evidence to diagnose failure or
interruption. Passive reads, UI form edits, repeated status polling, and reconstructed
wallet history are not events. Receive-address creation records only the number of
permanent labels assigned; it never records label text, the address, or its index.
Successfully retiring an eligible unused address records a separate discard event.

The utility route's only normal navigation entry is a standalone Settings section
immediately before wallet deletion; it is not in the persistent desktop or mobile
shell. The route reads only the sanitized app-level file. Native export produces
deterministic JSON or CSV through an explicit save dialog. Automatic sync records
one start and terminal outcome per bounded run; polling ticks are not events.

## Compatibility and consequences

No wallet database, registry, proposal, backup, descriptor, node-setting, or secret-
envelope format changes. Existing profiles require no migration. Removing a wallet
does not erase the sanitized app history. The log is diagnostic rather than an
authoritative transaction ledger and cannot be used to reconstruct wallet state.
The new discard enum value and optional generation count are additive version-1 log
records: current readers retain compatibility with every existing record, so the
file needs neither migration nor discard. A downgrade that encounters the newer
enum may make the diagnostic viewer unavailable, but it cannot affect wallet data
and preserves the file for a current build.
Mainnet distribution remains governed by ADR 0012 and the internal candidate gate.
