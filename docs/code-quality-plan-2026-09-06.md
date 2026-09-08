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
