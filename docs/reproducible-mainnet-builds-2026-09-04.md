# Reproducible unsigned Mainnet builds — 2026-09-04

Status: **PASS for frozen `2110eaf` evidence; final-candidate repetition pending**

This record proves the two-machine unsigned-build procedure at frozen commit
`2110eaf0afd0339754c1b9bbba31011c66aa3d69`. Subsequent final-candidate
test/policy-gate hardening changed the source commit, so the exact-final-source
row in [`mainnet-release-checklist.md`](mainnet-release-checklist.md) is open
again until fresh independent builds match. Mainnet distribution remains
blocked by the other unchecked rows and ADR 0012. Neither evidence set was
Developer ID signed, packaged, notarized, launched, or used with a wallet,
node, or hardware device.

## Frozen source and inputs

- Repository: `thibistaken/groot`
- Branch at build time: `codex/mainnet-final-enablement`
- Detached source commit:
  `2110eaf0afd0339754c1b9bbba31011c66aa3d69`
- Release version: `0.4.92`
- Compiled network: `mainnet`
- Bundle identifier: `app.groot.wallet.mainnet`
- Reviewed signing-team metadata: `6Z85HGDUU7`
- Source epoch: `1788501950`
- HWI 3.2.0 archive SHA-256:
  `dd1e1c37dc9c1d3f4ba63dd1e50c0b360828090ad1b97b4e1c805ef043691d31`
- Staged HWI executable SHA-256:
  `87a8991848a0216213ddf6497c753cebbda492626afaf5608c30931155c922c3`
- HWI manifest SHA-256:
  `88bb5dc0cfdf3ce916d8293040d34bdc4acbcf65f6aa5aaddc29e5f8b06a7f12`

Both machines resolved the remote branch to the detached commit above and
verified the same source inputs:

| Input                                              | SHA-256                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `src-tauri/Cargo.lock`                             | `8ccc834f37c28e8d6c523d72b6ef10e27d82ace66055f9255f9b9d9927fee483` |
| `pnpm-lock.yaml`                                   | `16e2d20cc9dfbd666bcaddeca9c441ef367840f86fb0499780cecb5eaea4fe20` |
| `src-tauri/tauri.mainnet.conf.json`                | `4f77b92faa441dbb75e5401b9dc7644ab28a5b98fb3ddb3e2b44e51e91caa58e` |
| `package.json`                                     | `e579e2fd0c12b4b828005c2628d8b744f6a672c9e6e9930285f69021dfb9e54f` |
| `scripts/release/build-unsigned-mainnet.sh`        | `35b13554ff2de5ff9e7fa5a43d28338502fadbda23a9f0e4a41b688a830ed160` |
| `scripts/release/reproducible-rust-env.sh`         | `8f309ced5719b7e57ef314df6574c875b1495b491be591d62a59bd2fc58e13ae` |
| `scripts/release/normalize-macho-uuid.mjs`         | `6a0c4442e911dc5ed93ccafcd0006f9cbedf24ebf1565d689f3475119800494b` |
| `scripts/release/test-reproducible-rust-env.sh`    | `df5789e12624ebb04231b77945e836475995f877557e1cf2819d02e5b3d239cd` |
| `scripts/release/verify-mainnet-source-policy.mjs` | `3949d50b8cebcf4249f937ffe848f0ae1891025a6e9c0cf07c941ce2fc0ebd40` |

## Frozen environment

Both native arm64 machines reported macOS 26.6.2 build 25G83, Xcode 26.1.1
build 17B100, macOS SDK 26.1, Apple clang 17.0.0
(`clang-1700.4.4.1`) targeting `arm64-apple-darwin25.6.0`, Node v24.19.0,
pnpm 11.13.1, repository-locked rustc 1.97.1
(`8bab26f4f 2026-07-14`), Cargo 1.97.1
(`c980f4866 2026-06-30`), Rust host `aarch64-apple-darwin`, and Tauri CLI
2.11.4. Both used `LC_ALL=C`, `LANG=C`, and `TZ=UTC`, supplied
`GROOT_MACOS_SIGNING_TEAM_ID=6Z85HGDUU7`, and removed external `RUSTFLAGS` and
`CARGO_ENCODED_RUSTFLAGS` before invoking `pnpm release:unsigned:mainnet`.

Each build used a fresh GitHub clone, detached checkout, Cargo home, Cargo
target, pnpm store, HWI download/extraction/staging area, and evidence
destination. Machine A's first dependency installation downloaded all 144
packages with zero reuse; Machine B independently reported the same isolation.
The owner-local absolute evidence paths are retained in private coordination
issue [#79](https://github.com/thibistaken/groot/issues/79), while this sanitized
record uses only the Build A and Build B labels.

## Reproducibility correction

The failed `8d38f617`, `b2f680bd`, `6aad2584`, and `1371f376` campaigns remain
diagnostic evidence only. They successively isolated physical Cargo paths,
Apple ld UUID behavior, ambient `RC_UUID_SALT`, and finally residual host
variation confined to all 16 `LC_UUID` bytes plus the dependent 32-byte ad hoc
CodeDirectory page hash.

Commit `2110eaf` adds a fail-closed post-link normalizer before evidence
generation. It accepts only the reviewed thin arm64 64-bit little-endian Mach-O
layout with exactly one `LC_UUID`, one final embedded signature, and one primary
linker-generated ad hoc CodeDirectory using full SHA-256 code slots and no
special slots. It verifies every existing code-page hash, zeroes the UUID in
memory, derives a version-3/standard-variant UUID from SHA-256 of the complete
pre-signature payload, writes the UUID, recomputes only affected code slots,
verifies every code-page hash again, and atomically replaces the executable
while preserving its mode. The builder requires strict `codesign` verification
both before and after normalization. No identity, CMS blob, Developer ID, or
timestamp is created.

The regression deliberately produces different linker UUIDs from identical
source under different salts, requires normalization to make the executables
byte-identical with the same nonempty UUID and valid ad hoc signatures, and
requires rejection after a signed code-page byte is altered.

## Independent results

Machine A was sealed before Machine B reported. Machine B was instructed not to
compare with Machine A or any earlier campaign. Private issue #79 recorded
`BUILD_B_STARTED`, the independent result, and the final comparison.

| Evidence file    | Machine A SHA-256                                                  | Machine B SHA-256                                                  | Result |
| ---------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------ |
| `BUILD-INFO`     | `547a12a34094d313589b3788d582e3a312e2dd515bad46078633d2da676f32bb` | `547a12a34094d313589b3788d582e3a312e2dd515bad46078633d2da676f32bb` | Match  |
| `Groot`          | `8ce9ed773f8f0c43d84f555c7a0d2a5d2d21a111c6b5e7c79ff970670561f2bb` | `8ce9ed773f8f0c43d84f555c7a0d2a5d2d21a111c6b5e7c79ff970670561f2bb` | Match  |
| `SHA256SUMS`     | `4938cd3f70b337abc847a01503cc6a4e14ada9c797da6658ba3d4caf7e577754` | `4938cd3f70b337abc847a01503cc6a4e14ada9c797da6658ba3d4caf7e577754` | Match  |
| `groot.cdx.json` | `681189b7d87962145472e10ac1b7ee55228788aa3788d29435db15c1b6c75712` | `681189b7d87962145472e10ac1b7ee55228788aa3788d29435db15c1b6c75712` | Match  |

Both executables retained UUID `4BE90441-1EF6-373F-B2C0-2982D591703B`.
Each evidence directory contained exactly the four named nonempty regular,
non-symlink files, and `SHA256SUMS` verified. Groot was a thin Mach-O 64-bit
arm64 executable with a strict-valid embedded ad hoc/linker signature,
`TeamIdentifier=not set`, and no Developer ID identity. Both SBOMs were
CycloneDX 1.6 for Groot 0.4.92 with exactly 539 components, 539 unique
`bom-ref` values, and an application SHA-256 equal to the Groot digest.

The builder validation and a second complete `pnpm validate` passed on each
machine. Each complete run included 74 frontend files and 366 frontend tests;
the quantified Node release/quality suites passed 46 tests. Formatting,
architecture, secret-surface, supply-chain, brand, version, localization,
hardware-fixture, mainnet-policy, update, HWI, comparator, reproducibility,
runtime, Svelte diagnostics, frontend tests, and production frontend-build
gates passed.

Scans across all four evidence files found no physical checkout, Cargo home,
Cargo target, pnpm store, dependency, HWI, username, user-home, evidence, or
physical temporary path. Canonical `/groot/source`, `/groot/cargo`, and
`/groot/target` remappings are permitted. Machine A separately recorded two
generic `/tmp` literals and one `/var/tmp` literal; Machine B recorded one of
each. These are generic runtime literals, not physical campaign paths.

## Deviations and disposition

Both machines temporarily exposed an already checksum-verified native OpenSSL
3.5.8 through `PATH` for Ed25519-capable validation only; system LibreSSL was
unchanged. Validation created and signed disposable fixtures. The sealed Groot
executables retained only their linker-generated ad hoc signature.

Machine A's canonical attempt stopped at preflight after its fresh pnpm
installation because the new empty Cargo-home directory had not yet been
created. No compilation or evidence existed, the detached worktree and empty
Cargo target were rechecked, the Cargo home was created, and the same isolated
attempt resumed. An earlier environment probe was abandoned before building
after invoking pnpm without the intended isolated store; none of its source,
dependencies, targets, or output was reused. Machine B reported no material
build deviation.

The four hashes and UUID match exactly across the two independently validated
machines. The unsigned reproducibility gate therefore passes for frozen source
commit `2110eaf0afd0339754c1b9bbba31011c66aa3d69`. Both evidence sets remain
sealed and unchanged. Any later application source, dependency, build-tool, or
release-configuration change creates a new executable candidate and requires
fresh independent builds. The remaining checklist, review, physical testing,
signing/notarization, update, recovery, and distribution-ADR gates stay open.
