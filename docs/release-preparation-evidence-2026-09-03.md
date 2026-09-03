# Release preparation evidence — 2026-09-03

Status: preparation evidence only; not an exact final-candidate release record

## Inputs

- Preparation source: `6dc31cc43670ebc68bd37dd47cdd5c4f02417c66`
- Dependency locks: the committed `pnpm-lock.yaml` and `src-tauri/Cargo.lock`
- Node.js: 24.19.0
- pnpm: 11.13.1
- Rust: repository-pinned 1.97.1 toolchain
- Intended first-release target: macOS arm64

No generated SBOM, advisory database, package, credential, or wallet data is
committed by this record.

## Results

| Check                                            | Result                | Qualification                                                                                                                                                     |
| ------------------------------------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm audit --prod --audit-level=high`           | PASS                  | The npm advisory service reported no known production vulnerabilities.                                                                                            |
| `cargo audit --file Cargo.lock` from `src-tauri` | PASS with 17 warnings | No vulnerability caused failure. RustSec reported 16 unmaintained warnings and one unsoundness warning.                                                           |
| `pnpm test:sbom`                                 | PASS                  | Two independently generated target-specific CycloneDX documents matched with 539 locked components, source/lock identity, artifact binding, and license evidence. |
| `pnpm release:test:update`                       | PASS                  | The signed-update fixture verified and rejected tampering. This is not an actual release signing/rollback drill.                                                  |
| `pnpm release:test:hwi`                          | PASS                  | HWI 3.2.0 provenance verified; tampering and wrong-version fixtures were rejected; the sealed-package fixture passed.                                             |
| `pnpm release:test:compare`                      | PASS                  | The unsigned comparator rejected incomplete, substituted, and mismatched evidence. Build B remains pending.                                                       |
| `cargo fmt --check`                              | PASS                  | Rust formatting is clean.                                                                                                                                         |
| strict all-target/all-feature Clippy             | PASS                  | `cargo clippy --locked --all-targets --all-features -- -D warnings` completed without a warning.                                                                  |
| `cargo test --locked --all-features`             | PASS                  | 378 library tests and 2 adversarial integration tests passed; explicitly environment-dependent tests remained ignored.                                            |
| `pnpm validate`                                  | PASS                  | The complete standard repository validation passed under pinned Node.js 24.19.0 and pnpm 11.13.1.                                                                 |

## RustSec warning disposition

The one unsoundness advisory is `RUSTSEC-2024-0429` for `glib 0.18.5`. The
dependency is in Tauri's GTK3 Linux target graph and `cargo tree --target
aarch64-apple-darwin -i glib` reports no matching package, so it is not linked
into the first macOS arm64 candidate. The GTK3 `atk`, `gdk`, `gtk`, and related
unmaintained warnings share that excluded Linux target graph.

The `unic-*` unmaintained warnings remain in the macOS Tauri `urlpattern` /
`tauri-utils` build and runtime graph. They are maintenance-risk evidence, not
a reported vulnerability. No opportunistic dependency update is authorized in
this preparation; the independent reviewer must evaluate their use and the
exact final candidate must rerun the advisory scan.

`proc-macro-error 1.0.4` is not present in the macOS arm64 target graph. This
record does not waive any new advisory or warning appearing before release.

## Still required

- clean CI and all release gates on the exact final commit;
- independent-machine Build B and a strict complete-evidence comparison;
- complete final provenance, Developer ID signing/notarization, update signing,
  and an actual rollback drill;
- independent review of the frozen baseline and the later enablement diff; and
- exact signed-candidate physical evidence required by the applicable
  checklist rows.

## Superseded heterogeneous-machine diagnostic

An unsigned mainnet Build A from commit `18d888e5` completed on macOS 26.6.2,
but its `BUILD-INFO` used the complete `uname -srvmp` value. That value embeds an
Apple hardware-family kernel suffix, so the strict comparator could not accept a
genuinely independent Mac with a different Apple silicon family even when all
source and toolchain inputs reproduced. Its executable and SBOM are retained as
diagnostic evidence only and must not be used for final reproducibility, signing,
or notarization.

The corrected evidence format records the stable exact inputs instead: macOS
product version and build, arm64 architecture, Xcode version and build, Apple
Clang version and target, SDK, Node/pnpm/Tauri and Rust/Cargo versions, source
commit, network, signing team, HWI digest, lockfiles, and mainnet configuration.
The comparator continues to require all four evidence files to be byte-identical.
This release-tooling-only correction changes no runtime behavior, persisted
format, descriptor, protocol implementation, or BIP support.
