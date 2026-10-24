# Independent review of the post-5.3 candidate — 2026-10-23

Refs #121. Reviewed release-to-candidate range: `6a39bf50b2a6a042354b43369765a9af2174d061..321cdb4c4541fed84beb4b282c72d505326dc5b4`. Two separate read-only review agents inspected the diff. Neither reviewer implemented the changes or ran the full test suite. Execution evidence is recorded separately; this record grants no source-hash, merge, hardware or release approval.

## Native review

The native reviewer covered all 19 changed `src-tauri` paths, removed code, isolated fuzz tooling/workflow, the Core harness and package attribution. No new actionable correctness or security finding remained in this scope.

All 41 extracted profile, notification and recovery functions were compared with the release. Forty preserve their implementations apart from ownership, visibility and formatting. `cleanup_failed_profile` intentionally changes preservation behavior after an uncertain registry commit. Command names/arguments, authorization, selected-wallet checks, operation locks, scan cancellation and database transaction order stay in Rust. Persisted formats and key/credential encodings are unchanged.

The reviewer checked the intentional full-prevout requirement, conservative phone work/response limits, distinct transport limits/errors and uncertain-save reconciliation. Earlier review gaps were addressed with composed parser assertions, valid seeds, exact work-map/QR boundaries and completion-boundary fault tests. The invalid 4,096-byte fuzz fragment was corrected to the supported 400-byte maximum before review completion. The macOS linker workaround keeps sanitizer instrumentation enabled.

This is scoped source review, not a whole-repository audit or proof of physical-phone responsiveness. The reviewer did not approve a validation cache, new fee threshold, support expansion, dependency upgrade or release.

## Frontend review

The frontend reviewer covered both Send quote integrations, node-form and Settings snapshot helpers, Settings action lifetimes, rescan/cancellation, phone signing, multisig retry/load ordering, related tests, translated copy/errors and measurement tooling. No new actionable frontend regression remained in this scope.

The initial review found three Settings defects: a dismissed backup could retain its busy state; failed wallet selection could invalidate still-relevant work; and late rescan-status/cancellation outcomes could affect obsolete UI. These were fixed and re-reviewed. A follow-up removed optimistic local wallet selection so a rejected native switch preserves the confirmed wallet's pending snapshot and actions.

The quote helper's pre-dispatch cancellation check and English/French/Spanish compatibility rewrite are intentional behavior/copy changes. The copy agrees with current product policy: Continuity is experimental; named Miniscript signer families are candidates, direct USB Miniscript is uncertified, Coldcard/Trezor delayed policies are unsupported through this integration, and phone pairing remains standard multisig only.

No standalone CSS changed in this range. The five changed Svelte files retain their released style blocks. The earlier CSS refactor was already in the release and was not re-audited here.

A subsequent test-only correction uses the scanner's real retry/reset control before review exists. The reviewer confirmed that it retains the stale-success/error assertions; the prior test setup incorrectly assumed a Scan again button existed at that stage. The navigation fixture also now uses the existing Settings link rather than an injected link obscured by app navigation. Runtime source is unchanged by these test corrections.

## Limits

Browser fixtures establish controlled asynchronous behavior, not actual native lock transitions, every device callback, camera operation, OS key storage or recovery on physical hardware. Measurements of first visible DOM surfaces do not establish native data readiness. Independent review does not replace the fixed-source test results, owner policy decisions, physical acceptance, final package verification or explicit source/release authorization.

## Tooling follow-up

Execution exposed an argument-order defect missed in the first source review: the old Cargo wrapper appended `--locked` after the program separator for `cargo run`. Initial PSBT and UR sanitizer runs still executed, and the initial Cargo build used the lockfile, but those runs do not establish that every Cargo subprocess was locked. The corrected wrapper inserts the flag immediately after `build` or `run`. Three exact-argument tests cover both paths and unsupported commands. A second independent review inspected commits `82cb77ad` through `29eacacd` and confirmed the fix and external corpus/cache boundary. Its optional symlink-boundary and CI-path-filter suggestions were also addressed and checked separately.

The full browser run exposed a tooltip geometry test that focused during the existing dialog transition. Waiting for that transition before measuring passed 20 repetitions with the same spacing bounds. Independent frontend review accepted that test-only correction and the production measurement server's use of immutable static build directories. Neither correction changes wallet behavior.

A further build defect was reproduced before editing: Cargo executes build.rs from the native crate, but its `git ls-files` result was prefixed with the repository root. That produced nonexistent watch paths and omitted individually tracked frontend files. The narrow correction runs enumeration from the repository root. A disposable-Git regression compiles and executes the actual watcher functions from both working directories, checks native/frontend/nonignored-untracked paths, space handling and exclusion of individually ignored files. Parent-directory observation remains intact; ignored children can still trigger recursive watches. Independent review confirmed the diagnosis and approach. `build.rs` and the mandatory test-script registration join the source-pin divergence inventory; no pin is refreshed.

## Final native follow-up — 2026-10-24

The separate native reviewer inspected `e0ebd6fcf2ea08ec9ab9a8493ad26f76752a4522` (source watcher), `dffc9a31332968cb6197fb75b35c340744484a0a` (canonical fuzz corpus boundary and CI trigger) and `da7b81731173233b3576a17c020e468238f99566` (prepared label query). No new actionable regression was found. The earlier reviewed label source blob is `15f6f374429b91995dab4d65678dce121f246cd1`.

For the query optimization, the reviewer independently recomputed all four raw logs' counts, medians, p95s and statement counts and verified the log and executable hashes. Repeated before/after/after/before release measurements support retaining it: approximately 30.8% less time for the synthetic full snapshot and 30.1% for its first history page. This removes repeated SQL preparation, not SQL executions. Process memory observations overlap; they do not establish a memory saving or material regression.

SQL, parameters, ordering and error propagation are unchanged. Regression tests check enabled/disabled statement caching, fresh committed labels, rollback, subject and connection isolation, and schema-error recovery. No query results or authorization decisions are cached. Equal serialized DTO sizes alone do not prove byte-for-byte equality; behavior-preservation evidence comes from the unchanged query and functional tests as well.

This final follow-up is read-only source/evidence review. It is not full candidate test execution, physical certification, source-pin approval, merge approval or release authorization.

## Handoff accuracy review — 2026-10-24

The separate frontend reviewer also inspected the handoff drafts and measurement summary against the fixed source. Corrections distinguish the full 79-path repository diff (including 12 documentation paths), Settings navigation/teardown tests from dialog-dismissal tests, mixed browser timing observations from statistical equivalence, and phone-signing PIN lifetime from other credentials. The report keeps physical/release acceptance, size savings and unmeasured performance paths explicitly incomplete. No extra owner gate was invented. Final campaign results are supplied by the executing agent and remain separate from this read-only review.

## Isolated iOS tooling follow-up

The native reviewer inspected the exact delta `da7b81731173233b3576a17c020e468238f99566..5b6535f8ab2c9418f201392c1ed37d5b6b6e7ff1`. The current 5.3.0 source was rejected by the unsigned archive metadata helper's RC-only version expression. ADRs 0092, 0104 and 0105 support the narrow correction: accept exactly 5.3.0 or existing numbered 5.3.0 RCs for the already isolated unsigned Testnet4 development archive. Every other identity, build-number, network, signing and resource check is retained. The change does not choose a new version or authorize installation/distribution. The reviewer found no actionable issue in the one-line helper change, regression tests or harness clarification. The before test failed on 5.3.0 as expected; all 18 boundary cases passed after the fix. Native Rust and source pins are unchanged. Archive construction and linked-network verification are separate execution evidence.

## Final plan-to-evidence check

The native reviewer compared the final report with the approved plan and identified missing named recipient-only, no-recipient and monetary-arithmetic helper regressions. Commit `641fd4addc07e40edf48473d1b726b1d2f864119` adds them without changing runtime logic. The reviewed test blob is `eb1fc3a1f0cc5a36e220334824f0b4a9c4f29598`. Corrected focused execution passed six tests with one opt-in timing test ignored. An initial diagnostic incorrectly expected the lower-level signing helper to repeat the full review; the native command already performs review before secret access. The test now targets that actual review owner rather than inventing a different helper contract.

The reviewer confirmed the report's broader profiling and size limitations are fairly disclosed. The final report also distinguishes actual partial-write/pre-rename/post-rename fault stages and states that policy/map/QR limits plus one-input timings do not calibrate worst-case phone cost. No new production defect emerged from this scope check.

## Persisted-owner and composed-parser test follow-up

The first completed whole-library campaign passed all 15 Core scenarios but missed the unchanged function-coverage gate: 58.34% against 59% (lines 63.17%, regions 60.94%). The recipient/arithmetic follow-up reached 58.46%. No clean released-baseline comparison establishes when this gap arose; it is not attributed to a new runtime regression. No threshold or coverage exclusion was weakened.

Seven additional tests exercise actual persisted identities for software, multisig and watch-only wallets; reject altered metadata without rewriting the database; preserve uncertain profile commits and unrelated authentication; reject invalid cleanup/session paths and private-storage links; and drive actual watch-only QR and phone-recovery parsing entrypoints. These are owner/composition gaps relevant to the plan, not application changes.

The separate native reviewer confirmed exact blobs `bd7f85f4f28a4088fb57c65b5cf5e02d1a0e6ad0` (wallet tests) and `e8e84ac7e329b255d58501756f5f9201bf206de1` (coordination tests). Review corrected the expected stable error to `invalid_coordination_payload` and strengthened the private-material assertions to require `private_material_rejected` at both command boundaries. A valid wrong-type UR fixture also checks framing/type composition. No additional blocker remained. These tests do not establish AppHandle authorization or physical phone behavior; a composed rejection does not prove every redundant downstream guard executed. Final clean fixed-source verification is recorded separately.

Commit `f4f22cd1` contains this test-only follow-up. A final additional malformed-record case proves rejection preserves a pending pairing, a legitimate retry succeeds and a second acceptance is rejected as replay. Its exact final blob was independently reviewed with no new finding. Supplemented coverage reached 63.68% lines, 59.06% functions and 61.41% regions; this diagnostic combines prior runs and is not the required clean fixed-source campaign.

The later clean fixed-source campaign at `6a95822a` independently reached the same 63.68% line, 59.06% function and 61.41% region totals while running all 619 ordinary library tests and all 15 Core scenarios in one clean campaign. The matching totals do not turn the earlier combined diagnostic into final evidence; the clean rerun is the accepted result.

## UR memory-cap follow-up

An independent read-only review inspected the original extended UR log, saved input and pinned libFuzzer implementation. On macOS, this libFuzzer version uses historical peak RSS for its limit. The failure snapshot reported 37.3 MB live heap and 66.1 MB quarantined, with dominant live contexts in libFuzzer corpus/features/buffers. The target and shared transport/prevout helpers expose no obvious per-iteration global collection. This evidence favors accumulated fuzzing/sanitizer overhead over a large retained parser allocation, but it does not exclude sequence-dependent parser growth: current RSS/VM attribution was absent and the sampled input may be incidental. The original campaign remains failed. Independent review of the fresh diagnosis and any tooling or parser change is required.
