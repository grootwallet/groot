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

## Superseded absolute-path diagnostic

Independent Machine A and Machine B builds of commit `8d38f617` produced the
same normalized `BUILD-INFO` digest and the same 539-component inventory, which
confirmed that the stable OS/toolchain evidence matched. Their Groot binary,
executable-bound SBOM, and `SHA256SUMS` bytes differed. Inspection found each
machine's absolute Cargo registry source path, including its local username,
inside its executable. The Build A executable digest was
`66a5a18f23294c228b06337f097c043cea6d5eeabeb2e385a5885dbf87bdd384`;
Build B was
`cc9551b7e88898b2c4fe4fcc1f58df207b64a2012fc66c6ace3420e438d5419a`.
This is a failed reproducibility campaign, not a pass, and neither artifact may
be signed or promoted.

The repository-controlled builder now rejects caller-provided Rust flags,
applies encoded Rust path-prefix remapping for the physical checkout, effective
Cargo home, and Cargo target, and scans the resulting executable for any
remaining checkout, Cargo-home, Cargo-target, or user-home path before emitting
evidence. A focused fixture compiles from two different synthetic usernames,
checkout roots, Cargo registry roots, and target roots and requires that only
the stable virtual prefixes remain.
Fresh independent builds are required at the new commit. Machine B temporarily
made Homebrew OpenSSL 3.5.8 available on `PATH`; `cargo tree --locked --target
aarch64-apple-darwin -i openssl-sys` reports no matching package in the macOS
arm64 graph, so it is not a linked input to this target. Exact four-file
comparison remains the final authority. The one production `CARGO_MANIFEST_DIR`
use belonged to the Regtest cookie-directory fallback. That fallback is now
compiled only for Regtest; public-network builds return a stable fail-closed
error if the unreachable fallback is invoked, so they contain no repository
path from that macro. The remaining path was Tauri's development-context
configuration parent: the unsigned builder had not activated Tauri's production
`custom-protocol` feature. The builder now activates that exact feature so its
raw evidence executable matches the packaged execution mode. A focused
release-mode Mainnet build with that feature passed the complete host-path scan.

## Superseded Mach-O UUID diagnostic

Fresh independent Machine A and Machine B builds of commit `b2f680bd` removed
the physical checkout, Cargo-home, Cargo-target, and user-home paths, and their
sanitized `BUILD-INFO` files were byte-identical. Their executable hashes still
differed: Machine A produced
`b0375e1cbfbcc9d38768f12cb075f31976c052e7fad68a4b8e5047354b0913cb`
and Machine B produced
`4569666a732240a2056a6a449aeaf7b7e782412cb4bb2bb178e33182e15cd3dd`.
The equal-size executables differed in only 47 bytes: 15 byte differences in
the 16-byte `LC_UUID`, with one coincidentally equal byte, and the 32-byte
linker-generated ad hoc-signature code-page hash covering that header. After
removing the signatures from disposable diagnostic copies, only the UUID
remained different; zeroing that UUID in those copies made their payloads
byte-identical. The normalized SBOM inventories were also byte-identical after
removing only the executable-hash binding. This is a failed reproducibility
campaign, not releasable evidence, and neither original artifact may be changed,
signed, or promoted.

The repository-controlled Rust environment now passes Apple ld's
`-reproducible` option while retaining `LC_UUID`. Its focused regression requires
byte-identical executables and equal non-empty Mach-O UUIDs across synthetic
usernames, source roots, Cargo homes, and target roots. Fresh independent builds
are required at the new frozen commit. This release-tooling-only correction
changes no runtime behavior, persisted format, descriptor, protocol, migration,
or BIP support.
