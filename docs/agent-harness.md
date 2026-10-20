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

The RC2 signer rehearsal follows ADRs 0094–0096 and the [candidate record](testing/5.3.0-rc2-mobile-keys.md). The build script prepares generated version/framework metadata, excludes build-only libraries, verifies the actual Testnet4 library and strips debugging sections before development signing. These packaging checks do not replace physical key authorization, backup/recovery or QR signing acceptance.

## Packaging

Build from a clean tracked/untracked commit. Generate fresh target-specific SBOM/provenance after the executable exists. Generated output remains untracked.

| Purpose                           | Command/boundary                                                                                                                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supporting unsigned build         | `pnpm release:unsigned`; fixed Mainnet: `pnpm release:unsigned:mainnet`                                                                                                                                         |
| Production multi-network evidence | `pnpm release:unsigned:multi`; normally two clean machines, frozen signed HWI input, identical executable. ADR 0088 permits two clean checkouts with fresh isolated build state on the same Mac for v5.2.0 only |
| Freeze signed HWI                 | `pnpm release:prepare:signed-hwi`; pinned upstream digest, approved HWI-only entitlement, timestamp and provenance                                                                                              |
| Production macOS package          | `pnpm release:package:macos:ga`; compare reproduced executable before outer signing/notarization/stapling; no rebuild or HWI entitlement on Groot                                                               |
| Private test candidate            | `pnpm build:native:multi:internal` or `pnpm build:native:mainnet:internal`; exact clean commit, pinned HWI, ad-hoc `REHEARSAL_ONLY`, verified app/DMG                                                           |

Public packaging requires the accepted version/tag authorization and identical local HEAD, fresh `origin/main` and peeled annotated tag. It never creates/imports/prints signing credentials. Developer ID/notarization credentials must already be configured. Internal builders provide no production signing, notarization, push or public authorization.

[Mainnet checklist](mainnet-release-checklist.md), [HWI provenance](hwi-artifact-provenance.md), [release signing](release-git-tag-signing.md) and [update/rollback](release-update-rollback.md) own evidence details. Earlier package/device passes apply only to their recorded candidate.

## Evidence and hardware

Label claims precisely: fixture, frontend unit, Rust unit/integration, isolated real Core, physical device, or independent review. Never imply a public release, platform, secure-erasure or privacy certification from automation.

Before physical testing run `pnpm hardware:preflight`. Record model, firmware, exact candidate, observed result and limitations in the [certification worksheet/matrix](hardware-certification.md). Retest relevant identity, trusted display, unlock, disconnect, cancellation, signing and restart behavior after changes. No secrets or live identifiers in reports.

Trezor Model One uses the bounded host PIN flow; Trezor Safe 3 unlocks on-device. BitBox02 and BitBox02 Nova need distinct exact-model evidence. `setup needed` identifies missing initialization, not a retry loop. Discovery readiness never means **Policy verified**; a saved policy requires its full account proof and first-address match. The supported seven-model matrix and firmware exceptions live in certification, not this harness.

## Handoff

Review the final diff. Update only documents owning changed behavior/evidence. State compatibility, BIP impact, actual verification, unverified physical/release work and commit identity. Do not append test transcripts or historical totals to current guides.

Internal RC9 Coldcard Testnet4 packaging follows ADR 0098: verify the original HWI digest, complete extracted-runtime manifest and app seal, then compare device-free startup separately from physical identity/display/signing time. Use a disposable profile for physical acceptance; RC8 remains the compatible rollback. Never refresh reviewed-source pins to package this rehearsal.

RC11 extends the internal Testnet4 runtime to Coldcard/Ledger/BitBox02 and a fresh operation-scoped client (ADR 0101). `pnpm test:hardware-preflight` includes device-free Python protocol fixtures. Explicit packaged probes must exit before `get_client`; compare physical timings separately and preserve RC10 rollback.
