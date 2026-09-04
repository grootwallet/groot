# Release preparation evidence — 2026-09-03

Status: preparation evidence plus the later exact unsigned-reproducibility
closure; not a signed or distributable final-release record

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
| `pnpm release:test:compare`                      | PASS                  | The unsigned comparator rejected incomplete, substituted, and mismatched evidence. The later exact `2110eaf` Build A/Build B comparison also passed.              |
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
- independent review of the recorded `2110eaf` Build A/Build B evidence;
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
At that stage, fresh independent builds were required at the new commit.
Machine B temporarily
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

The subsequent independent Machine A and Machine B builds of commit `6aad2584`
again had byte-identical `BUILD-INFO`. Machine A produced executable hash
`cf379a86718fd3333a887a2a5eab8c8cf66f69d5ffc9068764e831615652cb83`
with UUID `0ECE7724-29C3-3B1E-9610-419B2C911485`; Machine B produced
`b614ae7b12c2cbedef7a289bc49e988fdb80c896aaeca214a2bc88351cac2c79`
with UUID `DD6AF84A-15D4-3514-B463-FD3DB1E28C8A`. The equal-size originals
differed in exactly 48 bytes: all 16 UUID bytes and the 32-byte ad hoc-signature
page hash that covers them. Removing signatures from disposable copies left
only the 16 UUID bytes different; neutralizing those bytes made the complete
unsigned payloads byte-identical. Their SBOMs were structurally identical after
removing only the executable-hash binding. This campaign is also failed
diagnostic evidence and its originals remain unchanged and ineligible for
signing or promotion.

Apple's linker source documents and implements an additional hash input from
the ambient `RC_UUID_SALT` environment variable. A local controlled test using
two different salt values reproduced the campaign's exact 48-byte difference
despite `-reproducible`. The repository-controlled Rust environment now clears
that non-source linker input before passing Apple ld's `-reproducible` option
while retaining `LC_UUID`. Its focused regression injects different host salts
and requires the helper to remove them, then requires byte-identical executables
and equal non-empty Mach-O UUIDs across synthetic usernames, source roots, Cargo
homes, and target roots. At that stage, fresh independent builds were required
at the next frozen commit. This release-tooling-only correction changes no runtime behavior,
persisted format, descriptor, protocol, migration, or BIP support.

## Superseded salt-clearing diagnostic

Fresh independent Machine A and Machine B builds of commit `1371f376` both
reported `RC_UUID_SALT` absent and passed the salt-clearing regression. Their
`BUILD-INFO` files were byte-identical, but Machine A produced executable hash
`0e6698c9519dc8970db1294c61006315b3791305afb42ef6e19047d36eca02be`
with UUID `72050244-B3B0-34F0-934A-CB32BD649ED8`, while Machine B produced
`469d1ec72854074009704846035123c9785f75e6579feb4cb88f66bafead7951`
with UUID `1BF79866-81B3-3657-AC58-181C8EC7156D`. The equal-size originals
differed in exactly 48 bytes: all 16 UUID bytes and the 32-byte ad hoc-signature
page hash covering them. Removing signatures from disposable copies left only
the UUID bytes different; neutralizing those bytes made the complete unsigned
payloads byte-identical. Their SBOMs were structurally identical after removing
only the executable-hash binding. Both sealed evidence sets remain unchanged and
are ineligible for signing or promotion.

The release builder no longer relies on Apple ld's UUID derivation as the final
authority. Before evidence generation, a repository-controlled normalizer
accepts only a thin little-endian 64-bit Mach-O with exactly one `LC_UUID`, one
final embedded signature, and one primary ad hoc CodeDirectory using full
SHA-256 code slots with no special slots. It zeroes the UUID in memory, derives
a version-3/standard-variant UUID from SHA-256 of the finished bytes before the
signature region, writes that UUID, recomputes the affected CodeDirectory
code-slot hashes, verifies every code-slot hash, atomically replaces the target
executable, and requires strict `codesign` verification. It does not create a
Developer ID, CMS, timestamped, or other
identity signature. The focused regression first forces distinct linker UUIDs
with different salts, then requires normalization to produce byte-identical
executables, equal non-empty UUIDs, and valid ad hoc signatures. This correction
is release-tooling-only and has no runtime, persisted-format, descriptor,
protocol, migration, or BIP impact.

## Independent reproducibility closure — 2026-09-04

Fresh Machine A and Machine B builds of detached commit
`2110eaf0afd0339754c1b9bbba31011c66aa3d69` independently passed the complete
builder and post-build validation procedure. All four evidence hashes matched:

- `BUILD-INFO`:
  `547a12a34094d313589b3788d582e3a312e2dd515bad46078633d2da676f32bb`
- `Groot`:
  `8ce9ed773f8f0c43d84f555c7a0d2a5d2d21a111c6b5e7c79ff970670561f2bb`
- `SHA256SUMS`:
  `4938cd3f70b337abc847a01503cc6a4e14ada9c797da6658ba3d4caf7e577754`
- `groot.cdx.json`:
  `681189b7d87962145472e10ac1b7ee55228788aa3788d29435db15c1b6c75712`

Both executables retained UUID `4BE90441-1EF6-373F-B2C0-2982D591703B` and a
strict-valid ad hoc/linker signature only. Both CycloneDX 1.6 SBOMs contained
539 unique locked components and bound the matching executable digest. Each
machine passed 74 frontend files/366 frontend tests and 46 quantified Node
release/quality tests, retained a clean worktree, and found no physical build
path in evidence. The complete frozen environment, source hashes, inventories,
path scans, deviations, and disposition are recorded in
[`reproducible-mainnet-builds-2026-09-04.md`](reproducible-mainnet-builds-2026-09-04.md).
Private coordination issue [#79](https://github.com/thibistaken/groot/issues/79)
records Machine B's independent report and the subsequent comparison. The
unsigned reproducibility checklist row is closed; every other mainnet release
gate retains its prior status.
