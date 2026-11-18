# CI acceptance and efficiency

Implemented 2026-11-07, refs #121, after owner approval. No dependency, coverage threshold, wallet behavior, stored format, contract or BIP support changed.

## Current execution

Contract updated 17 November 2026 under [ADR 0122](../adr/0122-development-ci-and-public-release-approval.md). Measurements and local acceptance below remain evidence for their recorded historical source.

- **One frontend unit pass:** both coverage profiles derive the complete shared inventory from `validate`. A fail-closed selector runs `validate:internal` for a verified pull-request context and strict `validate:ci` for pushes to `refs/heads/main`; missing, inconsistent or unsupported context fails.
- **Development regression evidence:** `validate:internal` requires all 30 real release-test outcomes, exactly the typed frozen public-source approval stop and only the named macOS fixture skip elsewhere. It also requires exact reviewed internal digests, source semantics and every structural release guard. Additional failures, missing tests, unexpected skips or drift fail. The [mobile source review](0.5.4-mobile-source-review-2026-11-17.md) permits only its five named internal digest updates. Public pins remain frozen, and green pull-request CI grants no packaging or public-release approval.
- **One funded coverage lane:** deterministic library units run once. Core thresholds **99/100/97** pass before the same 15 isolated Core scenarios contribute to whole-library thresholds **62/59/59**. Ordinary all-target/all-feature tests, doctests, API docs, native-network compilation and audits remain required.
- **Isolated caches:** ordinary and instrumented Cargo targets use separate keys. Only disposable Groot package objects are cleared; dependency caches survive. Profiles, credentials and trusted release executables are not cached.
- **Complete browser obligations:** desktop Chromium uses two case-level shards and mobile WebKit four, one worker per isolated shard. The harness proves their inventories nonempty, disjoint and complete; logs and traces retain shard identity. The required `frontend` aggregate rejects missing, failed, skipped or cancelled lanes.
- **Evidence and negative tests:** timed pipelines preserve nonzero exits. Harness fixtures cover profile-selection errors, aggregate/source-review failures, exact release outcomes, coverage failures, scenario inventory and owned cleanup. External exact-commit package acceptance remains governed by ADR 0109.

The complete internal structural check exposed a stale first-release roadmap assertion previously hidden by the source-pin failure. It now checks the canonical historical v5.3.0 platform scope. No release authorization was added. The pinned coverage tool also rejected a proposed flag combination during a real trial; the final invocation uses its supported append behavior.

[The harness](../agent-harness.md) owns exact commands. The [owner handoff](internal-hardware-handoff-2026-11-07.md) limits manual acceptance to physical behavior. Browser capability-file splitting, replacing behavioral source-text assertions and changed-path selection remain conditional improvements: first prove fixture isolation and equivalent obligations; retain secret-boundary guards. No blanket test deletion or nightly-only security gate is introduced.

## Measured baseline

Read-only historical GitHub job metadata:

| Run                                                                                                               | Expensive steps                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Main CI 39855635323](https://github.com/grootwallet/groot/actions/runs/39855635323), source `6a39bf50`           | Core integration 1,130 s; whole-library coverage including Core 1,340 s; deterministic-core coverage 231 s; ordinary native tests 262 s; browser acceptance 1,110 s |
| [Internal packages 42373214648](https://github.com/grootwallet/groot/actions/runs/42373214648), source `0ea17f63` | Linux native validation 458 s + package build 484 s; Windows validation 430 s + package build 725 s                                                                 |

The old package workflow had no Rust cache. Main CI restored a cache then globally cleaned it before coverage. Frontend units ran once in validation and again for coverage. The changes remove these duplications; they do not promise a particular speedup. Hosted cold/warm cache hits, peak disk use and total duration still require actual GitHub runs. Preserve current test inventories, thresholds, deliberate-failure results, immutable action pins, read-only permissions and lock enforcement when evaluating those runs.

Design references: [Cargo build cache](https://doc.rust-lang.org/cargo/reference/build-cache.html), [GitHub cache boundaries](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching), [Playwright CI](https://playwright.dev/docs/ci) and [sharding](https://playwright.dev/docs/test-sharding).

## Local acceptance

Pinned Node 24.19.0, pnpm 11.13.1 and Rust 1.97.1 on macOS arm64. Native wallet source, build.rs, Cargo manifest/lock and frontend runtime inputs remain unchanged from `51a09f43`; CI helpers are verified by their final source hashes. No user wallet profile or physical device was accessed.

| Layer                         | Result                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend                      | 932 tests/107 files; enforced policy coverage 100%; types 0 errors/warnings; build passed                                                     |
| CI harness                    | 48 regression cases covering failure propagation, exact release inventory, source-stop transport, Core inventory/cleanup and platform scoping |
| Browser                       | 425 passed, 19 intentional skips, zero failures/retries; all enabled cases on both viewports                                                  |
| Additional visual/startup     | Four opt-in tests captured 72 route/theme/viewport combinations without overflow; six cold-start cases passed without generated Svelte files  |
| Ordinary native               | 627 tests passed; fmt, all-target/all-feature Clippy, doctest command (none defined), API docs and all five compiled networks passed          |
| Deterministic native coverage | 621 passes/22 ignored; lines 99.09%, functions 100%, regions 97.36%, gated before Core                                                        |
| Funded Core/whole library     | Same 15 scenarios passed once; lines 63.76%, functions 59.11%, regions 61.51%; exact executed inventory checked against logs                  |
| Supply chain                  | Production pnpm audit and deterministic SBOM passed; Cargo audit exited 0 with the same 13 documented transitive warnings                     |

The [dependency triage](post-5.3-dependency-triage.md) owns the existing RustSec warnings, including Tokio/glib unsoundness advisories. No dependency or advisory suppression changed. This is not a warning-free security assessment. Strict `pnpm validate` retains the source-approval failure; `validate:internal` passes every other obligation and independently checks source semantics and the full structural release gate.

The native campaign held HEAD at `51a09f43` and verified unchanged covered source/helper hashes before and after. Final commits preserve those bytes; the ignored evidence directory `release-artifacts/ci-efficiency-2026-11-07` records the exact commit, commands, reports, logs, source bundle and checksums. The local instrumented run took 2,307 seconds; it is neither an app-latency measurement nor a hosted CI speed comparison. POSIX coverage command fixtures run on Linux/macOS; both source-inventory assertions also run on Windows. Actual hosted Windows/Linux cache and timing behavior remains for the combined integration run.

The timelock coin UX was subsequently integrated in `41a2ed91..f3d9ab4e` on the post-5.3 maintenance branch. The results above remain historical evidence for `51a09f43`; they are not evidence for later wallet/UI or release-integrity changes. A final combined candidate must be built from its recorded clean commit and must carry fresh exact-source checks, automated acceptance and artifact digests before the [minimal owner checklist](internal-hardware-handoff-2026-11-07.md) begins.
