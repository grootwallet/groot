# Code-quality maintenance plan — 2026-09-06

## 2026-09-08 current-source follow-up

Inspection at local `main` commit `87c775e`, after fetching `origin/main` at
`fc02ed1`, found 133 registered native commands. Every registration had an adapter
mapping, but `payjoin_uri_inspect` and `mainnet_core_admission_clear` had no product,
route, component, test-fixture, or script caller. The active Send flow uses the
bounded `payment_request_inspect` command and its V2-only Payjoin URI detection;
the now-dead specialized parser, DTO, error enum, and three duplicate tests are
removed. Mainnet admission is already cleared
by onboarding cancellation, failed admission, wallet creation/recovery cleanup,
unlock, and session locking. Removing the two unused IPC wrappers reduces the
registered command surface to 131 and removes their unused frontend contract,
adapter, fixture, DTO, and error-code branches without changing either underlying
policy.

The same pass found no safe dependency or supported feature removal. All five
frontend runtime dependencies and the Rust dependency families remain tied to
current product or ADR-owned capabilities. Three export filename validators did
repeat the same length, path-separator, NUL, trimming, and extension checks; one
private pure validator now owns those common rules while the existing public-backup,
PDF, and PSBT wrappers retain their exact extensions and stable messages.

Compatibility remains exact for all persisted profiles, wallets, proposals,
backups, registries, payment drafts, diagnostics, and secrets. No migration, schema,
network behavior, transaction behavior, dependency, UI, or BIP support/evidence
change is introduced. The continuity-policy and cross-platform-coordination branches
remain separate; this pass does not merge or rewrite either line.

## Baseline

Read-only branch inspection followed a fresh origin fetch. This maintenance branch
starts at local `main` commit `44e631d` (app-log inspection), one commit ahead of
`origin/main` at `bdae856`. It preserves that local commit and changes no other
branch. The earlier audit targeted `2832acb` plus security-remediation WIP; its line
numbers, counts, grades, and work ordering are historical.

For PR delivery on 2026-09-07, only the maintenance commit was replayed onto
published main `bdae856` as `codex/error-contract-parity`. The unrelated local
app-log inspection commit `44e631d` remains on local main and is not included in
that PR. The branch comparisons below record the original inspection baseline.

| Branch                                                                                                 | Inspected head | Relationship to local main                     |
| ------------------------------------------------------------------------------------------------------ | -------------- | ---------------------------------------------- |
| `codex/continuity-policies-v1`                                                                         | `0cf4ae2`      | 3 commits unique to branch; 91 unique to main  |
| `codex/cross-platform-wallet-coordination`                                                             | `0417985`      | 41 commits unique to branch; 96 unique to main |
| `codex/mainnet-final-enablement` (remote; local worktree named `codex/fix-mainnet-overview-admission`) | `6d11ecf`      | Already contained in main                      |
| `codex/mainnet-internal-rc-fixes`                                                                      | `274104f`      | Already contained in main                      |

The continuity and coordination worktrees were clean. Their changes overlap
`wallet.rs`, wallet contracts, adapters, and multisig setup; this plan does not
merge them or infer release readiness from their presence. Branch comparison is
not a security review of either feature.

The security-remediation source is now in main. Final software, external-signer,
and multisig broadcasts already use blocking workers, protected by the existing
native scheduling source tests. Decimal fee transport and sanitized diagnostics
also supersede portions of the audit. Existing native `expect()` calls mean the
audit's broad panic-free claim cannot be inferred from an `unwrap()` count.

## First change: error contract and safeguard documentation

- Preserve all fourteen existing native API codes missing from the frontend
  allowlist, rather than only the audit's two examples.
- Read the existing Rust error declarations in a source regression, avoiding a
  second hand-maintained list or a new dependency. Keep the limitations explicit:
  this recognizes current source idioms, includes inline test modules, excludes
  dedicated test/performance files, and is not a Rust parser. A new computed-code
  call form fails for review rather than silently escaping coverage.
- Exercise the actual Tauri adapter's rejection mapping with mocked IPC, including
  unknown/non-string codes. This does not claim native runtime conformance.
- Explain operation serialization, short-lived field guards, and repeated
  review/release validation in the architecture guide. The release gate hashes
  the reviewed Rust files, including comments; preserve those files and their
  pins exactly instead of refreshing release evidence for a documentation edit.
  ADR 0041 owns context binding; ADR 0048 only refines hardware review deadlines.
- Correct the contracts-directory map in the agent guides.

Compatibility is exact for all persisted profiles, wallets, proposals, backups,
registries, and secrets. No migration, dependency change, native behavior change,
UI layout change, or diagnostic-log allowlist expansion. BIP impact: none; existing
BIP329 error presentation is preserved without changing interchange behavior or
claiming new interoperability evidence. Performance is unchanged by this slice.

## Subsequent changes, each independently reviewable

1. **Finish command scheduling (A1).** Inventory remaining synchronous commands
   and their lock waits; `tx_prepare`, `tx_max_spend`, acceleration preparation,
   multisig preparation, and `wallet_delete` still need assessment. Start with a
   read-only command. Prove queued wallet switching, session expiry, cancellation,
   worker failure, and credential zeroization behavior before converting mutations.
   Preserve authorization and transaction ordering. Run native tests and isolated
   Core scenarios; responsiveness needs a native candidate, not browser fixtures.
2. **Expand contract coverage (A3/A4).** Establish small shared behavior matrices
   for profiles, session/timeouts, and notification delivery before send controllers.
   A Rust-only JSON snapshot does not prove TypeScript parity: pass serialized Rust
   fixtures through the frontend consumer and cover enum variants, optional/null
   fields, numeric units, and event payloads. Keep Rust authoritative for policy.
3. **Measure snapshot cost (A5).** Benchmark realistic isolated Regtest histories
   and count queries. Optimize batching/replacement lookup separately from moving
   files, preserving transaction order, conflict winners, labels, and notifications.
   Index changes need explicit schema compatibility and reopen/idempotence tests.
4. **Extract one controller or pure rule (A6/B3).** Start with a demonstrated
   duplicate and characterize cancellation, stale responses, wallet isolation, and
   teardown. Coordinate with the two feature branches before editing shared setup
   or hardware lifecycles. No generic send framework until both flows justify it.
5. **Reduce Rust concentration (B1/B2/B4).** Move one coherent module with unchanged
   visibility/contracts. Keep behavior changes separate. Preserve distinct policy
   and review checks; do not unify transaction preparation merely to reduce lines.

Localization, pin checks, and reachable panic sites can be addressed as separately
verified defects. Do not mix fee semantics, database migration cleanup, CSS
reduction, dependency changes, or a WalletPort redesign into these steps.

Every implementation slice runs `pnpm validate`; Rust changes also follow the
format/lint/test and applicable real-Core harness in `agent-harness.md`. UI changes
require desktop/mobile inspection. Keep evidence tied to the tested commit and do
not transfer physical-device or release approval from earlier candidates.

## 2026-09-08 simplification follow-up

At the shared `87c775e` base, an independent current-source reachability pass also
found 133 registered native commands and a matching production adapter invocation
for every command. After the preceding two-command cleanup, all 131 remaining
registrations retain a matching production adapter invocation. The clipboard,
dialog, and opener plugins each retain a production caller, and all five frontend
production dependencies retain direct imports. An all-target Cargo feature graph
likewise confirmed the intentionally documented wallet, Tauri, HWI, Core,
compact-filter, Payjoin V2, TLS, and UR families. No plugin, dependency, or feature
was removed merely to reduce counts.

One orphan was proven instead: `src-tauri/src/airgap.rs` was referenced only by its
own units and one integration test written specifically for that unused generic
decoder. It had no Tauri registration, adapter path, persisted data, or product
documentation contract. The live animated-QR path is `ur_transport.rs`, whose
existing tests retain out-of-order/redundant fountain frames, canonical CBOR,
frame/payload bounds, hostile header rejection, and PSBT validation. Removing the
orphan deletes 114 production-source and 28 dead-test lines without reducing
coverage of a reachable boundary.

The Rust coverage classifier also retained `airgap.rs` in its adapter allowlist
after the file disappeared. The gate now requires every classified top-level
module to exist as well as requiring every existing module to be classified, so a
future deletion or rename cannot leave stale coverage policy behind. The matching
low-level architecture artifact now names only the active BSMS and UR modules.

Three Rust callers also repeated the same whitespace-collapse expression for
permanent labels, multisig signer labels, and hardware signer labels. They now use
one pure helper; caller-specific empty/48-character validation and exact stable
errors remain at each authority boundary and keep their existing tests. This is a
maintainability/review-surface improvement, not a claim of stronger runtime
security: the orphan had no reachable application path, release link-time removal
could already omit it, and no trust boundary moved.

Compatibility is exact for wallets, profiles, proposals, registries, backups,
payment drafts, node settings, and secret envelopes. There is no schema migration,
UI change, dependency change, or release-policy change. BIP impact: none; the
bounded BIP174/UR PSBT transport and existing interoperability evidence are
unchanged.

## 2026-09-08 live-sync read follow-up

Measurement of the ten-second foreground scheduler found two avoidable native
reads before every attempted sync: `wallet_exists` and `wallet_profiles`. The
shell already owns the selected profile and updates that state only after Rust
commits selection, so those reads repeated registry work without adding an
authority check. At a steady ten-second cadence they accounted for up to 720
extra IPC calls per active hour.

The scheduler now receives only the selected profile kind from its `AppShell`
owner and skips work when no profile is selected. The selected native sync
command remains authoritative: Rust still resolves the current selected profile,
requires its live session, validates its protected network setup, serializes the
wallet operation, and emits the wallet-ID-bound snapshot. Selection still stops
and cancels the old scheduler before the shell exposes the newly committed native
selection. Tests retain single-key/multisig routing, no-selection behavior,
failure backoff, cancellation, coalescing, and restart deferral.

Compatibility is exact for every persisted format and public contract. There is
no schema migration, UI change, dependency change, native command removal, or
BIP impact. This reduces periodic coordination work and makes scheduler ownership
explicit; it does not move wallet authority into the webview.
