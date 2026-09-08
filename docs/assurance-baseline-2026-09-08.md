# Session lifecycle assurance and snapshot baseline

Source baseline: `4d025c3c02bd1f98a3eca036083e88a4ad4bc4c2`.
Scope: frontend session/sync lifecycle, selected-wallet coordination, and
synthetic native snapshot construction. This is a bounded maintenance pass,
not an independent security audit or physical-device certification.

## Reproduced lifecycle defects

Deferred-promise frontend tests failed on the source baseline in four scenarios:

- A pending session-expiry reply calls the lock handler after the monitor stops.
- The same reply survives a stop/start cycle.
- The reply calls the lock handler after hardware review pauses the monitor.
- An old sync's `wallet_locked` failure reaches the shell error handler after
  selection stops and restarts the scheduler. It can redirect the new wallet to
  unlock and carry the old failure into the new retry cadence.

The session monitor now checks its lifecycle generation and current pause state
after the native request settles. The sync scheduler ignores obsolete failures
and does not carry their retry state into a new generation. Existing native
requests still drain normally; this does not cancel signing, extend a session,
or change Rust authorization. Regression tests prove fresh checks resume after
the obsolete reply is discarded.

Source inspection also verified that native selection cancels foreground sync
before acquiring the wallet-operation guard; the shell publishes the selected
identity only after native selection returns. Native session tests exercise
wallet isolation and non-refreshing background authorization. These observations
do not constitute an end-to-end proof of every native scheduling interleaving.

## Synthetic snapshot baseline

Environment: Apple M1 Pro, 16 GiB RAM, macOS 26.6.2 (25G83), pinned Rust 1.97.1,
unoptimized debug test build. Each fixture uses an in-memory SQLite database,
real BDK wallet transactions, one distinct external receive output per
transaction, and no private user data. All transactions are unconfirmed and
unlabeled; there are no replacements, dependent spends, or delayed policies.
Fixture construction is outside the measured interval. SQL statement tracing
counts executions without reading or logging SQL text or parameter values.
Assertions check transaction count, UTXO count, and total satoshis every run.

| Transactions | SQL statements per snapshot | Initial snapshot | Subsequent snapshots |
| ------------ | --------------------------- | ---------------- | -------------------- |
| 10           | 1,157                       | 32.5 ms          | 30.6–30.8 ms         |
| 100          | 92,507                      | 2.46 s           | 2.45–2.46 s          |
| 300          | 817,507                     | 21.95 s          | approximately 22 s   |

The statement counts are deterministic for these fixtures, including repeated
snapshots. Times are local debug measurements, not packaged-app latency or a
statistically established percentile. No production memory or disk-I/O baseline
is claimed.

Reproduce one size from `src-tauri`:

```sh
GROOT_BENCH_TRANSACTIONS=100 cargo test --locked --all-features --lib snapshot_history_benchmark -- --ignored --nocapture
```

The benchmark is explicitly ignored in ordinary test runs and capped at 1,000
transactions. Start with 10 or 100 because the baseline scales poorly.

## Next performance change

`label_provenance::reconcile_wallet_outputs` visits every canonical transaction
`transaction_count + 1` times on every snapshot. Repeated passes propagate
provenance through dependent change outputs, but also repeat all SQL work for
independent receives and already reconciled histories. The measured statement
growth confirms this is a priority performance issue.

The next isolated implementation should reconcile canonical transactions in
dependency order and prove equivalent labels, unknown/mixed provenance, cluster
links, replacement winners, and reorg/restart behavior against the current
implementation. Include dependent spends and retained historical rows in that
comparison. Avoid adding a persistent cache or schema until measurement shows
one is necessary. This pass retains current provenance semantics and establishes
the reproducible baseline for that separate change.

Compatibility: no wallet, registry, proposal, backup, descriptor, secret, or
database format changes. No dependencies, release-policy pins, or UI layout
changes. BIP impact: none; no interoperability evidence is added or transferred.

## Verification

`pnpm validate` passed, including 550 frontend tests and the production web build.
Rust formatting, warnings-as-errors clippy, and all-feature tests passed: 403
library plus three integration tests executed; 17 tests were ignored, including
the explicitly manual benchmarks and real-Core scenarios. The snapshot benchmark
was separately executed at all three sizes above. No native production Rust code
changed, and this pass did not rerun the real-Core or physical-device campaigns.
