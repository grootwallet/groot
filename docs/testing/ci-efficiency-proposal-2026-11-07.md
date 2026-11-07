# CI acceptance and efficiency

Implemented 2026-11-07, refs #121, after owner approval. No dependency, coverage threshold, wallet behavior, stored format, contract or BIP support changed.

## Current execution

- **One frontend unit pass:** `validate:ci` derives the mandatory inventory from strict `validate` and substitutes the coverage-enabled unit command. Agents use affected tests while editing and complete acceptance after implementation stabilizes.
- **Explicit internal acceptance:** `validate:internal` requires all 28 release-test outcomes, exactly the typed frozen source-approval failure and only the known macOS fixture skip on other platforms. It then runs source semantics and every structural release guard independently. Combined failures, missing tests and unexpected skips fail. Strict validation and public packaging retain their approval stop.
- **One funded coverage lane:** ordinary deterministic library units run once, then core thresholds **99/100/97** pass before any of the same 15 isolated Core scenarios contribute. Whole-library thresholds remain **62/59/59**. Ordinary all-target/all-feature tests, doctests, docs, native-network compilation and audits remain required.
- **Isolated caches:** ordinary and instrumented Cargo targets use separate keys. Internal packages reuse the existing pinned cache action. Only disposable Groot package objects are cleared; dependency caches survive. Profiles, credentials and trusted release executables are not cached.
- **Independent browser projects:** desktop Chromium and mobile WebKit run all existing cases with one worker each, a 25-minute test bound inside a 30-minute job, and retained logs/traces. The existing required `frontend` check aggregates all frontend, browser and Rust results and rejects missing, failed, skipped or cancelled lanes.
- **Evidence and negative tests:** timed pipelines preserve nonzero exits. Harness fixtures inject aggregate, source-review and coverage failures, check scenario inventory and verify owned cleanup. Actual tool and application runs supplement command stubs.

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
