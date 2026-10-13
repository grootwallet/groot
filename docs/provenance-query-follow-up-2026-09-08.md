# Provenance query follow-up — 2026-09-08

## Implemented scope

Two high-value recommendations from the navigation review are implemented:

1. Combine the indexed source-state, label and cluster reads into one prepared
   compound SELECT. Separate row kinds avoid a labels × clusters Cartesian join.
   Output summaries also retrieve the source transaction ID with the lineage row
   instead of requesting that same row twice.
2. Replace the correlated per-output address-reuse count with one materialized
   grouping over all stored output history. Update only changed flags, avoiding
   repeated row writes on unchanged reads. The query-plan test rejects correlated
   scans; the second unchanged refresh writes zero rows.

The prepared statement is connection-local; it caches SQL compilation, not wallet
data. Every read obtains fresh state. No new cache lifetime, public API, dependency,
index, schema/version, migration, network behavior or production UI is introduced.
Labels, clusters, missing-data/corruption behavior, historical reuse and atomic
wallet transaction boundaries remain unchanged. No BIP support/evidence change.

Changed implementation: `src-tauri/src/label_provenance.rs`. Tests live in
`src-tauri/src/label_provenance/tests.rs` and
`src-tauri/src/wallet/performance_tests.rs`.

## Evidence

The same 1,000 independent-receive, in-memory debug fixture as the navigation
review, four samples per run:

| Path                 | Before this follow-up | After this follow-up | SQL statements before → after |
| -------------------- | --------------------- | -------------------- | ----------------------------- |
| Full snapshot        | 687–694 ms            | 569–582 ms           | 25,007 → 20,007               |
| 50-row Activity page | 510–517 ms            | 405–406 ms           | 15,003 → 13,003               |

These runs were sequential on the same machine, not a statistically controlled
release benchmark. Serialized sizes are unchanged: full snapshot 1,164,143 bytes,
Overview 558,051 bytes, Activity 30,600 bytes. Native page construction still scales
with complete history. Database opening, BDK loading, IPC, rendering and transport
time are excluded; do not interpret these numbers as total navigation latency.

Command, from `src-tauri`:

```sh
GROOT_BENCH_TRANSACTIONS=1000 cargo test --locked --all-features --lib snapshot_history_benchmark -- --ignored --nocapture --test-threads=1
```

Focused checks: 21 provenance tests passed, including the new frozen read oracle
across 36 state/label/cluster combinations, incomplete/corrupt evidence,
cross-database isolation, changes between repeated reads, reuse equality and
rollback. The existing eight-seed graph oracle compares persisted tables across
mixed/unknown sources, chains, labels, reuse, replacement and eviction. Its legacy
path now uses the frozen pre-change source reader as well.

Final checks passed:

- `pnpm format` and `pnpm validate`: 82 frontend test files, 572 passing tests,
  zero Svelte errors/warnings and a successful production web build.
- `cargo fmt --check` and strict all-target/all-feature Clippy: passed.
- `cargo test --locked --all-features`: 417 library and three ordinary integration
  tests passed; 13 library and four Core integration scenarios are opt-in there.
- `pnpm test:integration:regtest`: all eight selected native scenarios and four
  Core multisig/recovery scenarios passed against disposable isolated data.
- `pnpm network:check-builds`: all four native network configurations passed.
- `RUSTDOCFLAGS="-D warnings" cargo doc --locked --no-deps --all-features`: passed.
- Focused 1,000-row debug benchmark and tightened statement budgets: passed.

Local logs are under `/tmp/groot-provenance-qa.iawq5c`. The preceding navigation
change's 202 passing desktop/mobile browser tests apply to unchanged production
frontend code; that full browser suite was not rerun for these Rust-only query
changes. The separate concept receives its own responsive browser checks and is
not part of the wallet build. No physical device/public-network latency campaign,
release package, comprehensive security audit or complete coverage/advisory CI
campaign was performed in this follow-up.

## Next, not silently implemented

The next measurement target is RPC call count and connection setup for local
Core, HTTPS Core, Tor Core and compact-filter sync. Connection reuse, read batching
or a persisted graph/filter index needs separate evidence and security review.
Never use a faster fallback endpoint, weaken TLS/onion checks, skip chain or PSBT
validation, or retry an ambiguous broadcast blindly. Further reconciliation write
reduction is also worth profiling; this change eliminates unchanged reuse-flag
writes, not every idempotent write in materialization.

The interface-refresh concept is separate design exploration. No production
component, interaction, capability or network request is changed by that concept.
