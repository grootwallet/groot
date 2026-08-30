# Code, dependency, and package-size audit

## Scope and method

This audit starts from committed v0.4.42, commit `423c38d3f22ab29774ff3d12172f28424e7e6a2e`, on macOS arm64. Measurements use the pinned Node 24.19.0, pnpm 11.13.1, and Rust 1.97.1 toolchains. The baseline was built before changing source. The final package was rebuilt through the repository's Testnet4 packaging path, including the reviewed HWI staging and signature checks.

Counts below cover tracked textual source, tests, scripts, documentation, and vendored source. They exclude generated `build/`, `target/`, `node_modules/`, Git metadata, and binary resources. Physical lines include blanks and comments; nonblank lines provide a less formatting-sensitive comparison. File byte counts are exact. Bundle figures distinguish the compiled executable from mandatory resources and filesystem allocation.

No persisted wallet, profile, registry, proposal, descriptor, backup, network-settings, or secret-envelope format changed. No dependency or lockfile changed.

## Findings ranked by impact and risk

### High impact: release symbols and cross-crate duplication were shipped

The baseline Testnet4 executable was 28,002,416 bytes and exposed 54,272 `nm` entries. Its `__LINKEDIT` segment alone was 7,929,856 bytes. An untracked release-profile trial with ThinLTO, one code-generation unit, and stripped symbols reduced a comparable executable to 17,541,264 bytes while preserving the normal release optimization level. This was the largest safe, measured opportunity.

The tracked release profile applies those three settings only to release builds. The final Testnet4 executable is 17,605,136 bytes, a reduction of 10,397,280 bytes (37.13%). It exposes 399 `nm` entries. Clean native linking takes materially longer: the baseline release build took 2 minutes 1 second, the isolated optimization trial took 4 minutes 57 seconds, and the final incremental Testnet4 package link took 4 minutes 23 seconds. Debug and test iteration are unaffected.

### High impact, fixed trust boundary: the native frontend retained both adapters

The composition root previously chose between `DummyWalletAdapter` and `TauriWalletAdapter` by testing `window.__TAURI_INTERNALS__` at runtime. That made both implementations reachable in the compiled graph and allowed an unexpected native initialization state to select the prototype fixture.

Vite now defines the native target at build time from Tauri's `TAURI_ENV_PLATFORM`. Native builds contain the Tauri branch; standalone browser builds retain the deterministic prototype branch. A source-contract regression test pins both halves. The largest native JavaScript chunk fell from 378,483 to 315,263 bytes (16.70%); gzip fell from 107.65 to 92.98 kB. The standalone browser output remains functional and keeps its dummy adapter; its largest chunk is 364,624 bytes.

### Medium impact: large trusted-boundary and route hotspots remain

The largest maintained files are `src/app.css` (10,410 physical lines), `src-tauri/src/wallet.rs` (6,701), `src-tauri/src/wallet/tests.rs` (3,708), `src-tauri/src/wallet/hardware_commands.rs` (3,116), and the multisig create/send routes (2,523 and 2,485). `wallet.rs` contains roughly 267 function declarations or test cases and is also the highest historical churn hotspot. It owns authentication, persistence, transaction, migration, and proposal invariants, so line-count reduction alone would be unsafe.

Prior decomposition already moved command families and the regression suite into sibling modules. The next safe pass should extract cohesive, pure persistence or transaction validators one boundary at a time, with characterization tests and no DTO or format change. The large CSS file should be reduced only alongside visual regression evidence; moving rules into many component-local blocks would redistribute rather than remove complexity.

### Medium impact: repeated orchestration exists, but is security-sensitive

A normalized 14-line cross-file window scan found 323 overlapping windows across only 14 unique file pairs. The main clusters are Send/Receive label-token orchestration, hardware onboarding across Welcome/Hardware/Multisig routes, and repeated proposal identity/revision checks in native single-key and multisig commands. No maintained implementation, test, or script files were byte-identical.

The native repetitions frequently restate fail-closed wallet identity, proposal revision, and signer checks at separate trusted-boundary entry points. Consolidating them without explicit equivalence tests would increase review risk. The UI clusters are reasonable candidates for shared pure controllers, but repository policy requires proving the gap and obtaining approval before adding a reusable component. They are therefore reported rather than broadly refactored here.

### Medium impact: dependency graph is broad but feature-backed

The frontend declares 5 production and 14 development dependencies; the pnpm lock contains 184 package snapshots. Each production dependency has a direct source use. The Rust manifest declares the wallet, Bitcoin Core, compact-filter, Payjoin, hardware, encryption, platform, serialization, and Tauri boundaries explicitly. The host `cargo tree` spans 484 rendered lines; `Cargo.lock` contains 597 package records representing 509 crate names, with 62 names at more than one version.

The largest graph families are intentional: Tauri/WebKit supplies the application shell; BDK/Bitcoin/Miniscript supplies wallet semantics; Kyoto supplies the implemented compact-filter source; Payjoin PDK supplies the ADR-gated V2 parser foundation; and HWI supplies required hardware support. Multiple cryptographic and Bitcoin support versions are transitive consequences of those pinned graphs. Removing a feature family would violate implemented or explicitly recorded requirements, so this audit does not trade capability or reviewability for a smaller dependency count.

Developer caches are not package content: the installed `node_modules` occupied 161,260 KiB and the multi-profile Rust `target` cache 2,092,352 KiB during the audit. Neither appears in the `.app`.

### Medium maintenance risk: accepted transitive Rust advisories remain

The current RustSec database reports no denied vulnerability, but it does report 17 warnings already allowed by repository policy: the Linux GTK3/Tauri stack is unmaintained and includes the `glib` iterator unsoundness advisory; `proc-macro-error` is unmaintained; and five `unic-*` crates are unmaintained. Dependency tracing places `glib` under Tauri's Linux `gtk`/WebKit runtime and the `unic-*` family under Tauri's `urlpattern` utility graph. They are not contributors to the measured macOS executable, but they remain cross-platform maintenance work.

Resolving them requires coordinated upstream/Tauri graph movement, not a safe local feature deletion. Because this audit explicitly prohibits opportunistic dependency updates, it records the accepted warnings and leaves the exact lockfile unchanged. The production npm advisory audit reports no known vulnerability.

### Low risk, removed: dead source and unused vendoring

`BrandMarkStudy.svelte` had no import or route reference and survived the earlier marketing-route removal. It was deleted; public brand presentation remains in the separate marketing repository.

The repository also contained a complete vendored `security-framework` crate that Cargo did not resolve. The active patch resolves only `security-framework-sys`; `cargo tree -i security-framework` selects the registry parent crate. The unused vendor directory contributed 47 files and 520 KiB on disk, including 11,983 physical source/package lines. It was removed while the required reviewed `security-framework-sys` patch remains.

The only explicit Rust dead-code allowance is the persisted label-origin variant `Imported`; it was retained because removing a schema/domain variant without a compatibility review is inappropriate. No `todo!`, `unimplemented!`, `TODO`, or `FIXME` implementation markers were found.

### Low impact: tests and release scaffolding are substantial and justified

The repository contains 57 frontend unit-test files plus five E2E files, 56 embedded Rust test modules, 348 Rust test functions, and 319 frontend/E2E test declarations. Dedicated test code is 9,562 physical lines before counting embedded Rust tests. Scripts contribute 2,574 physical lines and encode network identity, SBOM, HWI provenance, package-signature, release-gate, coverage, and disposable Regtest checks.

No test or scaffold was byte-identical, and the release/security scripts cover different trust or packaging boundaries. None was removed. Build caches are large, but deleting them from a developer checkout would not improve source or shipped size.

## Exact source composition

| Tracked category             | Baseline files | Baseline lines | Baseline nonblank | Baseline bytes | Final files | Final lines | Final nonblank |   Final bytes |
| ---------------------------- | -------------: | -------------: | ----------------: | -------------: | ----------: | ----------: | -------------: | ------------: |
| Rust product modules         |             33 |         28,813 |            27,251 |      1,018,957 |          33 |      28,813 |         27,251 |     1,018,957 |
| Rust dedicated tests         |              5 |          5,546 |             5,216 |        192,544 |           5 |       5,546 |          5,216 |       192,544 |
| Frontend product             |            137 |         43,461 |            42,639 |      1,513,633 |         136 |      43,390 |         42,571 |     1,511,130 |
| Frontend unit tests          |             57 |          4,002 |             3,654 |        154,158 |          58 |       4,024 |          3,673 |       155,137 |
| E2E                          |              5 |          3,734 |             3,558 |        202,590 |           5 |       3,735 |          3,559 |       202,664 |
| Scripts                      |             42 |          2,574 |             2,324 |         93,599 |          42 |       2,574 |          2,324 |        93,599 |
| Config and textual assets    |             44 |          3,070 |             2,544 |        149,411 |          44 |       3,081 |          2,554 |       149,811 |
| Vendored source/package text |             68 |         13,023 |            11,327 |        454,017 |          27 |       2,339 |          2,041 |        91,346 |
| Documentation                |             92 |          7,768 |             6,278 |      1,028,998 |          93 |       7,909 |          6,372 |     1,049,830 |
| **Total**                    |        **483** |    **111,991** |       **104,791** |  **4,807,907** |     **443** | **101,411** |     **95,561** | **4,465,018** |

The complete tracked textual set, including this report and its regression tests, is 10,580 physical lines and 342,889 bytes smaller. Almost all of that reduction is the provably unused vendored crate. The functional changes add a small contract test and configuration; they do not pursue line count as a goal.

## Exact macOS package composition

| Component                 | Baseline bytes |    Final bytes |                    Change |
| ------------------------- | -------------: | -------------: | ------------------------: |
| Groot executable          |     28,002,416 |     17,605,136 |     -10,397,280 (-37.13%) |
| Bundled HWI 3.2.0         |     11,478,672 |     11,478,672 |                 unchanged |
| Application icon          |        239,407 |        239,407 |                 unchanged |
| CodeResources             |          2,652 |          2,652 |                 unchanged |
| Info.plist                |          1,126 |          1,126 |                 unchanged |
| **Allocated `.app` size** | **39,735,296** | **29,339,648** | **-10,395,648 (-26.16%)** |

The final HWI SHA-256 is `87a8991848a0216213ddf6497c753cebbda492626afaf5608c30931155c922c3` and matches the pinned source artifact byte for byte. The packaging verifier also validates the containing ad-hoc development signature. HWI alone is 11,478,672 bytes and approximately 39.1% of the final file payload. The remaining platform WebKit runtime is dynamically linked and is not copied into the bundle; the native frontend is embedded in the Groot executable. Filesystem/package overhead beyond the listed files is negligible at this scale.

A few-megabyte full application is therefore not a credible target under current requirements. HWI alone exceeds that aspiration, before the Tauri shell, WebKit bridge, Rust wallet/network/cryptography graph, and frontend are included. Further reductions should be judged against the measured 17.6 MB executable and 11.5 MB mandatory HWI lower-bound components, not against a bare command-line program.

## Changes made

1. Added release-only ThinLTO, one code-generation unit, and symbol stripping.
2. Selected browser versus native wallet adapters at compile time and added a regression test.
3. Removed the unreferenced brand-study component.
4. Removed only the unused vendored `security-framework` parent crate; retained the active `security-framework-sys` patch.
5. Corrected one stale multisig E2E transition so the v0.4.42 token commit is followed by the explicit **Continue to amount** action, matching the shipped flow and the other Send tests.
6. Updated canonical architecture and implementation-status documentation.

## Verification

The baseline browser, native Regtest, and full Testnet4 package builds completed before optimization. Post-change verification was:

| Command/evidence                                                    | Result                                                                                                                                                                                          |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm validate`                                                     | Green: formatting, architecture/secret/supply-chain/brand/version/localization gates, release/update/HWI tests, Svelte diagnostics, 58 frontend files / 267 tests, and production browser build |
| `cargo fmt --check`                                                 | Green                                                                                                                                                                                           |
| `cargo clippy --locked --all-targets --all-features -- -D warnings` | Green in 50.56 seconds                                                                                                                                                                          |
| `cargo test --locked --all-features`                                | Green: 337 passed, 11 fixture/environment-dependent tests ignored                                                                                                                               |
| Rustdoc with warnings denied                                        | Green in 8.09 seconds                                                                                                                                                                           |
| `pnpm test:coverage`                                                | Green: 100% statements, branches, functions, and lines across the named frontend policy modules                                                                                                 |
| `pnpm test:coverage:rust`                                           | Green: deterministic core 97.39% regions, 100% functions, 99.09% lines                                                                                                                          |
| `pnpm test:acceptance`                                              | Green after correcting the stale transition: 159 desktop/mobile tests passed, 3 intentionally project-scoped tests skipped, 3.1 minutes                                                         |
| `pnpm network:check-builds`                                         | Regtest, Signet, and Testnet4 trusted Rust all compile                                                                                                                                          |
| `pnpm test:integration:regtest`                                     | Green: eight disposable-Core compact-filter, acceleration, recovery, delayed-policy, and multisig cases                                                                                         |
| `pnpm test:sbom`                                                    | Green: two deterministic CycloneDX runs, 537 locked components, matching license evidence                                                                                                       |
| `pnpm audit --prod --audit-level high`                              | No known vulnerability                                                                                                                                                                          |
| `cargo audit --file Cargo.lock`                                     | No denied vulnerability; 17 policy-allowed transitive maintenance/unsoundness warnings documented above                                                                                         |
| Full Testnet4 portable package                                      | Green: HWI staging/version/digest, ad-hoc development signing, strict deep signature verification, and packaged-HWI re-verification                                                             |
| Fresh optimized Regtest package lifecycle                           | Green: second process failed closed and forced-termination restart reacquired the isolated profile lock; executable 17,706,368 bytes                                                            |

The sandbox initially denied loopback socket creation for 11 Rust tests, the
Rust coverage run, and the Playwright server. Each was rerun with loopback
permission and passed; those first failures were execution-environment denials,
not assertions. Physical hardware, Developer ID notarization, mainnet, and
independent-machine reproducibility were outside this dated code-size pass. The
unsigned reproducibility gate was later completed for frozen commit `2110eaf`;
see
[`reproducible-mainnet-builds-2026-09-04.md`](reproducible-mainnet-builds-2026-09-04.md).
The other release gates remain unchanged.

## Remaining opportunities and intentional non-changes

- Profile release-size contributors with crate-level tools before changing Cargo features. Current transitive multiplicity is evidence for investigation, not proof that a feature is removable.
- Decompose `wallet.rs` only along already-tested domain seams. Do not move secrets, authenticated identity checks, or transaction review into the webview.
- Characterize repeated Send/Receive and hardware-flow state machines before proposing shared controllers or components.
- Evaluate source-map and CSS selector reachability only with desktop/mobile and accessibility regression evidence. The current app CSS is large, but blind purging risks dynamic Svelte states.
- Keep Kyoto, Payjoin foundation, HWI, recovery, security, SBOM, network-build, and release scaffolding until the corresponding product or ADR boundary is deliberately changed.
- Keep runtime-oriented release optimization. `opt-level = "z"`, abort-on-panic, or removing error text may save more bytes but could harm runtime speed, diagnostics, unwinding assumptions, or reviewability and was not justified by this audit.
- Keep HWI as a separately verified resource. Compressing, downloading, or discovering it at runtime would weaken offline operation and the signed provenance boundary.
