# Security-first navigation and history follow-up — 2026-09-08

## Scope and compatibility

Implements the four authorized improvements: wallet/session-scoped background
notification delivery, independent Overview and signer-detail loading, blocking
workers for acceleration quotes, and native bounded Activity pages with a
recent-three Overview projection. The requested exclusion is respected: the
1.8-second startup gate is unchanged.

No wallet, profile, registry, backup, proposal, descriptor, notification-table or
secret-envelope format changes; no migration, new dependency, persistent cache,
network transport change or reusable UI component. BIP support levels and protocol
behavior are unchanged. Existing mainnet admission, protected-storage access,
operation serialization, PSBT-derived review and signing checks remain in place.
Release-policy source hashes were refreshed for reviewed changed sources; the
source gate was extended to the new Activity module and session-identity owner,
not relaxed.

## Security finding and remediation

The previous notification drain was keyed only by wallet kind. A pending read
for wallet A could complete after selecting same-kind wallet B, emit A's event
into the active UI, then acknowledge a database-local identifier in B's database.
An identifier such as `transaction:1` is not globally wallet-unique. This was a
wallet-context race affecting notification privacy and delivery integrity, not
evidence of key extraction or unauthorized signing.

The invariant is that delivery work must still belong to its initiating frontend
wallet generation, and native acknowledgement must target the exact selected
wallet and unlock session that supplied the rows. Ordinary matching-wallet
delivery and durable retry must continue to work, without refreshing idle timeout.

The shared native read-context guard runs under the existing operation lock before
database access. Notification reads require the wallet UUID and return an ephemeral
unlock-session UUID; acknowledgements require both. Lock, expiry and re-unlock
invalidate that identity. The adapter checks wallet/generation before emitting
and acknowledging, coalesces only matching-context drains, and invalidates work
on wallet lifecycle changes. Notification failures no longer turn a successful
snapshot or broadcast into a reported failure; durable rows retry on a later read
or sync. No delivery occurs without subscribers.

The `fix-finding` skill required an independent read-only boundary investigation
before the patch and one independent bypass/regression review afterward. The
review found no concrete surviving bypass or regression in the scoped paths.
This is agent review, not an independent professional wallet audit.

Primary files: `src/lib/wallet/tauri.ts`, `src-tauri/src/session.rs`,
`src-tauri/src/wallet.rs`, and `src-tauri/src/wallet/profile_commands.rs`.
Regression evidence: `src/lib/wallet/notification-isolation.test.ts` covers
switch, switch-back, lock, expiry, delete, reset, concurrent drain, successful
delivery, retry, absent subscribers and snapshot/broadcast independence.
`src-tauri/src/wallet/tests.rs` covers colliding database-local notification IDs
and rejection of an old unlock session while preserving the matching-wallet
acknowledgement control. These are focused boundary tests and mocked IPC races,
not an end-to-end exploit through a packaged webview.

## Loading and query behavior

- Overview paints its balance/recent transactions before proposal, draft and
  signer-detail reads finish. Secondary failure has durable retry without hiding
  the authoritative balance. Mainnet node admission still precedes wallet data.
- Send starts saved public signer metadata before the heavier coin snapshot;
  multisig signer metadata is also shown independently. A saved identity does
  not claim that the physical device is connected. Software identity no longer
  waits for fee-acceleration quotes. Required data remains gated before payment
  progression, and failures remain visible.
- RBF/CPFP quotes run on blocking workers, with wallet and unlock-session context
  checked after acquiring the operation lock. Fee, frozen-coin and transaction
  review rules are unchanged. This removes event-loop blocking, not network time.
- Activity asks Rust for 50 rows (native maximum 100). Filtering and sorting apply
  to the complete history, not the loaded subset. A deterministic transaction-ID
  tie-break prevents duplicate/omitted rows in an unchanged revision. Cursors bind
  wallet, unlock session, query, sort and transaction content; changed history
  requires refresh. Failed subsequent pages preserve earlier rows and offer retry.
- Overview retains all current UTXOs for existing maturity/security presentation
  and computes pending outgoing accounting before truncating recent activity.
  Activity does not construct receive-address, UTXO or label-suggestion DTOs.

Primary files are `src-tauri/src/wallet/activity.rs`, the wallet snapshot helper,
`wallet/transaction_commands.rs`, `wallet/hardware_commands.rs`, the wallet
contracts/adapters/presentation helper, and the Overview, Activity and two Send
routes. Tests include six native paging/accounting tests, command scheduling and
existing route-contract tests, and `e2e/navigation-performance.spec.ts`.
Canonical product, architecture, flows, design, implementation, BIP and testing
documents are updated in the same change.

## Synthetic measurement

Command, from `src-tauri`:

```sh
GROOT_BENCH_TRANSACTIONS=1000 cargo test --locked --all-features --lib snapshot_history_benchmark -- --ignored --nocapture --test-threads=1
```

One in-memory synthetic wallet containing 1,000 independent unconfirmed receives,
four debug-build samples on this machine:

| Read shape                 | Construction time    | SQLite statements      | Serialized bytes |
| -------------------------- | -------------------- | ---------------------- | ---------------- |
| Existing complete snapshot | 687–694 ms           | 25,007                 | 1,164,143        |
| Activity page, 50 rows     | 510–517 ms           | 15,003                 | 30,600           |
| Overview projection        | Not separately timed | Not separately counted | 558,051          |

The Activity path uses about 40% fewer statements and a 97.4% smaller response
than the full snapshot in this fixture. Timing is illustrative, not a release
latency guarantee: the benchmark excludes opening/loading the database, IPC,
network access and rendering. The overview response remains proportional to its
UTXO set. SQL tracing is test-only and counts statements without logging values.

Pagination does **not** make the native work proportional to page size. Each page
still loads/reconciles the wallet graph, derives the complete transaction view,
sorts it and hashes the filtered result. Browsing many pages repeats that work;
bounded responses alone do not reduce the total cost of reading every page.
No persistent index/cache has been added
just to conceal that cost. Existing full-snapshot consumers and sync events still
carry complete history where their contracts require it.

## Verification

Outcome: **fixed** for the scoped notification-context finding. All ordered
verification gates passed; this is not an absence-of-vulnerabilities claim.

Ordered verification gates:

1. **Syntax, contracts and build:** `pnpm format`, `pnpm check` and
   `pnpm validate` passed. The final standard validation includes 82 Vitest files,
   572 passing tests, zero Svelte errors/warnings and a successful production web
   build. `cargo fmt --check` and
   `cargo clippy --locked --all-targets --all-features -- -D warnings` passed.
2. **Security trigger and legitimate controls:** all 16 notification-isolation
   frontend tests passed. Native tests rejected A's notification context against
   B's colliding row and an old session after lock/re-unlock; the matching-wallet
   acknowledgement succeeded. Frontend switch-back and expiry scenarios emitted
   no stale event and submitted no stale acknowledgement. Retry and normal delivery
   passed. This is the concrete evidence that the original scoped race no longer
   reproduces at the tested boundaries.
3. **Owning-package regressions:** `cargo test --locked --all-features` passed:
   413 library tests plus three ordinary integration tests; 13 library and four
   real-Core integration tests are opt-in in that command. The separate isolated
   `pnpm test:integration:regtest` run passed all eight selected native scenarios
   and all four Core multisig/recovery scenarios. The manual 1,000-row benchmark
   passed. `pnpm network:check-builds` passed Regtest, Signet, Testnet4 and the
   isolated mainnet compile configurations. Warning-denying
   `cargo doc --locked --no-deps --all-features` passed with
   `RUSTDOCFLAGS="-D warnings"`.

The final separate `pnpm exec playwright test` run passed **202 tests**, with
four existing conditional skips, across desktop Chromium and mobile WebKit.
Desktop (1180×780) and mobile (390×844) Activity top/footer screenshots were
manually inspected in light/dark themes: no horizontal overflow, and the paging
control remains above mobile navigation. These are browser fixtures, not installed
mobile-app certification. Test artifacts are local under
`/tmp/groot-navigation-qa.JOwfy0` and are not tracked wallet data.

During iteration, source-contract tests were updated for the deliberately changed
loading sequence; a duplicate generic error on the RBF funding-shortfall path was
fixed while preserving its existing dedicated failure/retry presentation. A
browser run overlapped frontend generation/build and reported module-import
errors and timeouts. That overlap was a confounding factor, not a proven cause
for every failure; the separate complete rerun passed without test failures.
Vite still logged module-import warnings during the passing run, so those logs
alone are not evidence of the cause of the earlier failures.
No authentication, assertion or release gate was disabled.

Not performed: physical signer latency testing, installed iOS/Android testing,
public-network/remote HTTPS/Tor timing, release packaging or an exhaustive
repository security audit. The full Rust coverage and supply-chain advisory CI
jobs were not rerun locally; dependencies and lockfiles are unchanged. This change
does not establish mainnet release readiness or absence of other vulnerabilities.

## Recommended next work, in order

Follow-up: the first compound-read and grouped address-reuse optimization pass
below is now implemented and measured in
[`provenance-query-follow-up-2026-09-08.md`](provenance-query-follow-up-2026-09-08.md).
Broader reconciliation batching and network transport profiling remain next work.

1. **Reduce repeated provenance reads and reconciliation work.** The benchmark
   still counts 15,003 statements for one page. `output_summary_with_context` in
   `src-tauri/src/label_provenance.rs` performs separate reads of the same outpoint
   row and further per-output label/input lookups. Start with combined SELECTs and
   call-scoped batched data, preserving missing-data behavior and transaction
   atomicity. Inspect query plans and address-reuse reconciliation, not just SQL
   counts: a single correlated statement can still do quadratic work. Verify
   receive, change, self-spend, RBF, reorg and multi-label histories against the
   existing output. This is a bounded improvement before any new persisted index.
2. **Measure backend round trips, then remove verified duplication.** Separately
   measure cold/warm local Core, remote HTTPS Core, Tor Core and compact-filter
   sync. The current loopback and Tor transports open connections per request
   (`direct_rpc.rs`, `tor_rpc.rs`, explicit `Connection: close`); HTTPS also issues
   individual requests. Connection reuse or supported read batching is a candidate,
   not a measured win here. Any implementation must retain endpoint/proxy isolation,
   TLS/onion validation, response bounds, cancellation and timeout behavior, and
   must not retry broadcasts blindly or fall back from Tor to direct networking.
3. **Measure release-build navigation and lock contention.** Record first
   authoritative balance, first saved signer identity, Activity page completion,
   operation-lock wait and sync apply time on representative desktop and mobile
   hardware. Use synthetic/consented test data and timing-only counters, without
   credentials, labels, amounts, addresses, wallet identifiers or endpoints. Use
   evidence to decide whether a smaller coin/maturity projection or persisted
   history/filter index is justified. Any persisted-format change needs its own
   compatibility/ADR decision and explicit approval; do not silently add a cache.

These are recommendations, not implemented transport/index changes. No broad
cleanup, framework replacement, speculative global cache or loosened security
check is warranted by the evidence gathered in this change.
