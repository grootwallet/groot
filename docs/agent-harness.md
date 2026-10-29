# Maintainer harness

Use Node **24.19.0**, pnpm **11.13.1**, Rust **1.97.1** and committed lockfiles. Root/nested AGENTS guides apply. [Engineering standards](engineering-standards.md) own review and supply-chain rules; this page owns execution.

## Before editing

- Inspect status, staged/unstaged diffs and recent commits. Preserve unrelated work. Continue a suitable authorized branch; start new work from the default branch otherwise.
- Verify the tracking issue with `gh issue view` or `gh issue list`; issue state is not implementation/certification proof. Commits use `Refs #N`; `Closes #N` requires complete acceptance. Do not mutate issues or push without authorization.
- Identify process, port and profile ownership. Do not stop another task's app/Vite/Core process or run a second server on its port.
- State compatibility. A breaking persisted format needs an ADR and explicit migration-versus-discard approval before implementation. Never repurpose funded certification data for tests.

## Checks by scope

| Scope                      | Command                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------ |
| Formatting                 | `pnpm format`, review diff; `pnpm format:check`                                      |
| Required handoff           | `pnpm validate`                                                                      |
| Frontend types/units       | `pnpm check`; `pnpm test`                                                            |
| Browser UI                 | `pnpm test:acceptance`; inspect 1180×780 and 390×844, both themes                    |
| Frontend policy coverage   | `pnpm test:coverage`                                                                 |
| Rust format                | `cargo fmt --check` from `src-tauri`                                                 |
| Rust lint                  | `cargo clippy --locked --all-targets --all-features -- -D warnings` from `src-tauri` |
| Rust tests                 | `cargo test --locked --all-features` from `src-tauri`                                |
| Rust API docs              | `RUSTDOCFLAGS="-D warnings" cargo doc --locked --no-deps --all-features`             |
| Native network compilation | `pnpm network:check-builds`                                                          |
| Real Core                  | `pnpm test:integration:regtest`                                                      |
| Rust coverage              | `pnpm test:coverage:rust`; `pnpm test:coverage:rust:all`                             |
| SBOM/license               | `pnpm test:sbom`                                                                     |
| Combined local suite       | `pnpm test:full`                                                                     |

`pnpm validate` covers formatting, scaffolding/boundaries/secrets, supply chain, brand, version/release guards, localization, hardware fixtures, release-verifier fixtures, runtime launcher, types, units and frontend build. It does not run every CI suite. `.github/workflows/ci.yml` additionally owns browser acceptance, dependency/RustSec audits, SBOM, policy/native coverage, Rust docs/tests/lint, all native networks and real-Core tests.

Use focused checks while iterating, then mandatory validation and applicable extended suites. Report actual failures; never weaken a gate to get green output. Documentation-only changes require formatting, reference checks and validation, not manufactured UI/device evidence.

## Native development

`pnpm regtest:start` uses isolated `.regtest` Core data. `pnpm dev:native:regtest` selects the pinned runtime and saved isolated native profile. `pnpm dev:regtest` is only the browser fixture. Real-Core integration creates disposable data; never redirect it to a physical certification profile or replace a saved profile to make a test pass.

## iOS foundation

For ADR 0089 development, run `bash scripts/dev/tauri-ios-foundation.sh check`, then `init` once and `build`. This uses the pinned runtime, a distinct development bundle identifier, fixed Testnet4 under ADR 0091, bundled assets and isolated Cargo output. It creates an unsigned debug archive without installing or selecting a phone. Generated Apple files remain ignored. Device installation requires inspected development signing, an explicitly selected connected/unlocked phone and disposable data; see the [5.3 plan](mobile-5.3-plan.md). Native compile evidence does not certify pairing, signing, recovery or mobile support. Preserve release-source pins and report any mismatch rather than updating reviewed hashes. The [native review/device checklist](testing/5.3-native-review.md) separates the unsigned foundation archive from later pairing and signer acceptance.

The RC2 signer rehearsal follows ADRs 0094–0096 and the [candidate record](testing/5.3.0-rc2-mobile-keys.md). The build script prepares generated version/framework metadata, excludes build-only libraries, verifies the actual Testnet4 library and strips debugging sections before development signing. These packaging checks do not replace physical key authorization, backup/recovery or QR signing acceptance. The metadata helper accepts the approved 5.3.0 baseline as well as numbered 5.3.0 RCs for this isolated unsigned Testnet4 validation archive. It preserves the existing development identifier and build number; this does not authorize installation, mobile distribution, or refreshing source pins.

## Packaging

Build from a clean tracked/untracked commit. Generate fresh target-specific SBOM/provenance after the executable exists. Generated output remains untracked.

| Purpose                            | Command/boundary                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supporting unsigned build          | `pnpm release:unsigned`; fixed Mainnet: `pnpm release:unsigned:mainnet`                                                                                                                                                                                                                           |
| Production multi-network evidence  | `pnpm release:unsigned:multi`; normally two clean machines, frozen signed HWI and signed extracted-runtime inputs, identical executable. ADRs 0088/0105 permit two clean checkouts with fresh isolated build state on the same Mac for v5.2.0/v5.3.0 only                                         |
| Freeze signed HWI                  | `pnpm release:prepare:signed-hwi`; pinned upstream digest, approved HWI-only entitlement, timestamp and provenance                                                                                                                                                                                |
| Freeze 5.3 signed HWI runtime      | `node scripts/release/signed-hwi-runtime.mjs prepare /absolute/hwi /absolute/signed-hwi-manifest.json /new/absolute/runtime`; signed Mach-O files and framework, exact runtime manifest, same Developer ID team. Use `verify` with the same three paths before both evidence builds and packaging |
| Production macOS package           | `pnpm release:package:macos:ga`; compare reproduced executable before outer signing/notarization/stapling; no rebuild or HWI entitlement on Groot                                                                                                                                                 |
| Private test candidate             | `pnpm build:native:multi:internal` or `pnpm build:native:mainnet:internal`; exact clean commit, pinned HWI, ad-hoc `REHEARSAL_ONLY`, verified app/DMG                                                                                                                                             |
| Canonical-identity owner candidate | `pnpm build:native:multi:ga-candidate`; exact clean commit, pinned HWI, ad-hoc `REHEARSAL_ONLY`, verified app/DMG; accesses the released app's existing network-specific profiles, so use only after a verified backup                                                                            |
| Windows/Linux 5.4 owner candidate  | `.github/workflows/experimental-desktop.yml`; native x86-64 runners, Testnet4-only identity, official archive/source and inner HWI digests, sealed unpacked runtime and driver probes, MSI/NSIS plus DEB/AppImage, SBOM/digests/build facts. Unsigned and never public-release evidence           |

Public packaging requires the accepted version/tag authorization and identical local HEAD, fresh `origin/main` and peeled annotated tag. For 5.3.0, `GROOT_SIGNED_HWI_RUNTIME` must name the same verified frozen runtime for each unsigned evidence build; the macOS packager takes that runtime directory between the signed-HWI manifest and output arguments and binds its digest to the reproduced executable before copying it into the app. It never creates/imports/prints signing credentials. Developer ID/notarization credentials must already be configured. Internal builders provide no production signing, notarization, push or public authorization.

The cross-platform workflow's Linux job must run mandatory `pnpm validate` and confirm it stops at the unchanged public Mainnet source-policy gate. It then runs the remaining candidate checks explicitly; this preserves the release stop rather than refreshing or weakening it. Windows independently runs every platform-neutral quality, frontend and hardware-preflight check; the POSIX gateway and macOS release-evidence suites stay on their supported hosts. Both hosts run the complete native Rust checks. Build inputs stay outside the checkout, and the package builder requires a clean exact commit before staging resources. Follow [the 5.4 human test](testing/5.4.0-cross-platform-hardware.md); compilation and device-free driver probes do not certify a signer or platform.

[Mainnet checklist](mainnet-release-checklist.md), [HWI provenance](hwi-artifact-provenance.md), [release signing](release-git-tag-signing.md) and [update/rollback](release-update-rollback.md) own evidence details. Earlier package/device passes apply only to their recorded candidate.

## Evidence and hardware

Label claims precisely: fixture, frontend unit, Rust unit/integration, isolated real Core, physical device, or independent review. Never imply a public release, platform, secure-erasure or privacy certification from automation.

Before physical testing run `pnpm hardware:preflight`. Record model, firmware, exact candidate, observed result and limitations in the [certification worksheet/matrix](hardware-certification.md). Retest relevant identity, trusted display, unlock, disconnect, cancellation, signing and restart behavior after changes. No secrets or live identifiers in reports.

Trezor Model One uses the bounded host PIN flow; Trezor Safe 3 unlocks on-device. BitBox02 and BitBox02 Nova need distinct exact-model evidence. `setup needed` identifies missing initialization, not a retry loop. Discovery readiness never means **Policy verified**; a saved policy requires its full account proof and first-address match. The supported seven-model matrix and firmware exceptions live in certification, not this harness.

## Handoff

Review the final diff. Update only documents owning changed behavior/evidence. State compatibility, BIP impact, actual verification, unverified physical/release work and commit identity. Do not append test transcripts or historical totals to current guides.

Internal RC9 Coldcard Testnet4 packaging follows ADR 0098: verify the original HWI digest, complete extracted-runtime manifest and app seal, then compare device-free startup separately from physical identity/display/signing time. Use a disposable profile for physical acceptance; RC8 remains the compatible rollback. Never refresh reviewed-source pins to package this rehearsal.

RC12 extends the internal Testnet4 runtime to Coldcard/Ledger/BitBox02/Trezor/Jade and a fresh operation-scoped client (ADRs 0101/0102). `pnpm test:hardware-preflight` includes device-free Python protocol fixtures. Explicit packaged probes must exit before `get_client`; Jade uses HWI's shared `test` selector only when native Testnet4 is active. Compare physical timings separately and preserve RC11 rollback.

## Maintenance measurements and parser corpus

After `pnpm build`, run `node scripts/quality/measure-frontend.mjs` and retain its JSON outside the repository. Pass a built client directory and earlier JSON as the first two arguments for a compatible per-file gzip comparison. The report records Node/zlib/platform identity and rejects a different runtime when comparing baselines. Compare identical toolchain, network mode and compression. Aggregate assets include lazy chunks; they do not measure initial navigation, native startup or hardware latency.

`GROOT_MEASURE_FRONTEND=1 E2E_PORT=<inspected-unused-port> CI=1 pnpm exec playwright test e2e/maintenance-performance.spec.ts` attaches repeated browser route-readiness/resource observations. This default command measures Vite fixtures; use the immutable production-build protocol below for production-profile browser comparisons. Neither mode measures native readiness, and neither has a noise-sensitive wall-clock assertion. Keep source fixed and avoid concurrent builds.

`cargo test --locked --all-features --test adversarial_parsers` runs the deterministic bounded PSBT/UR/descriptor/pairing mutation corpus without I/O or additional dependencies. Ordinary native tests include all-input phone authentication, fresh-review retries, missing/mismatched prevouts and no-mutation failures. Keep the full isolated-Core mobile round trip and Continuity maturity/reorg/restoration cases for actual transaction evidence. This finite corpus is regression coverage, not unbounded fuzzing or a physical certification.

The ordinary real-Core harness uses Cargo invocation-only `opt-level=3` overrides for the Groot and Miniscript packages in its two long fixed-Continuity cases, matching the earlier RC10 evidence method. This retains test assertions, overflow/debug checks, exact delays and Core transaction validation; manifests, production profiles and coverage-mode profiles stay unchanged. The initial post-5.3 unoptimized run was interrupted during CPU-bound policy construction, not counted as passing evidence.

### Production-profile maintenance comparisons

For route fixtures, build once and retain each complete static output outside the repository. Run `GROOT_MEASURE_FRONTEND=1 GROOT_MEASURE_PRODUCTION=1 GROOT_MEASUREMENT_COMMIT=<full-source-sha> GROOT_MEASUREMENT_BUILD=/absolute/static-build E2E_PORT=<unused-port> CI=1 pnpm exec playwright test --config playwright.performance.config.ts --grep 'records repeated browser-fixture route readiness and assets'`. The dedicated config serves that immutable directory without reading mutable SvelteKit server output. It excludes five warmups and records 100 document navigations per route/view. This still measures browser fixtures and first visible DOM markers, not native IPC/data readiness. Keep builds and CPU-heavy tests out of the observation window; compare baseline variation before claiming a change.

For native core timings, use `GROOT_MEASURE_NATIVE=1 cargo test --release --locked --lib measure_mobile_review_and_signing -- --ignored --nocapture --test-threads=1` and the same command with `measure_operation_lock_and_registry_save`. For 1,000 synthetic transactions/coins, run `GROOT_BENCH_TRANSACTIONS=1000 cargo test --release --locked --lib snapshot_history_benchmark -- --ignored --nocapture --test-threads=1`. The first two reject debug timing; all use five warmups and 100 observations. Review/sign-and-QR excludes keychain/IPC/device wait; lock timing is uncontended; save timing uses an empty synthetic registry. History reports statement counts and DTO bytes as well as durations. Never infer real queue contention or physical phone latency from these tests.

`GROOT_MEASUREMENT_COMMIT=<full-source-sha> node scripts/quality/measure-package.mjs /absolute/Groot.app` attributes regular-file bytes, including the native executable and hardware runtime. It does not verify signatures or measure download compression. Compare like-for-like artifacts and retain exact executable hashes. Startup fixtures must use fresh disposable Regtest data, a distinct app identifier and nonpersistent webview storage so measurement cannot affect a saved wallet or its cache. Record the observed checkpoint; native startup is not verified webview readiness.

### Sanitizer campaigns

See [isolated parser fuzzing](../fuzz/README.md) for exact toolchain/library versions, reviewed lockfiles, seed generation and bounded commands. The production dependency graph stays separate. Run `node --test scripts/quality/fuzz-cargo-wrapper.test.mjs` when changing the runner. Keep both the build cache and active corpus outside the repository; the runner resolves paths before invoking Cargo. The CI smoke budget is 90 seconds per target, with a two-second per-input timeout and 512 MiB memory limit. Extended campaigns and actual run counts belong in a dated evidence record. Preserve synthetic crashes as regressions. A quiet campaign is not a security or hardware certification.
