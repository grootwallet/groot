# Isolated parser fuzzing

Refs #121. This workspace links the actual application parsers. It does not replace validation with a test parser. Production manifests, lockfile and toolchain are unchanged.

Tooling: cargo-fuzz **0.13.2** (MIT/Apache-2.0), libfuzzer-sys **0.4.13** (MIT/Apache-2.0 plus LLVM NCSA), Rust **nightly-2026-10-22**. Install cargo-fuzz with `cargo install cargo-fuzz --version 0.13.2 --locked --root /absolute/private/tools`; use an explicit PATH. Never change `rustup default`. The nightly file applies only inside this workspace.

Supply-chain review: inspected the published manifests, cargo-fuzz process invocation code and libfuzzer-sys build.rs. cargo-fuzz has no build script; it invokes Cargo/rustc and the chosen fuzz executable with argument arrays. libfuzzer-sys compiles its bundled LLVM C++ sources with cc; no download is performed by its build script. Do not set CUSTOM_LIBFUZZER_PATH or CUSTOM_LIBFUZZER_STD_CXX. Its FFI/unsafe sanitizer runtime is test-only. The isolated lockfile starts from the production graph; compare shared package versions and checksums when resolving it. This is a scoped tooling review, not an audit of LLVM or every transitive crate.

Run from this directory with the pinned cargo-fuzz on PATH. The runner wraps every Cargo subprocess with --locked because cargo-fuzz 0.13.2 has no forwarding flag:

```sh
../scripts/quality/fuzz-parsers.sh psbt_roundtrip -max_total_time=90 -timeout=2 -rss_limit_mb=512 -max_len=1048577
../scripts/quality/fuzz-parsers.sh ur_composition -max_total_time=90 -timeout=2 -rss_limit_mb=512 -max_len=4195329
../scripts/quality/fuzz-parsers.sh pairing_records -max_total_time=90 -timeout=2 -rss_limit_mb=512 -max_len=262145
```

Generate the starting corpus from the repository root with `cargo run --manifest-path src-tauri/Cargo.toml --locked --example fuzz_seed_corpus -- fuzz/corpus`. Use synthetic corpus data only. Keep corpus, crashes and coverage ignored; minimize any finding and preserve a synthetic ordinary regression. Extended runs use 1,800 seconds per parser and 7,200 seconds for composition. Calibrate sanitizer overhead before interpreting timeouts. A quiet campaign is bounded evidence, not a security proof.

Oracles: accepted PSBT/descriptor encode/decode identity; QR-to-PSBT consistency and typed transport round trips; invitation validation, public policy parsing, BIP129 authenticated decryption and re-encryption identity. These targets perform no signing, persistence or network calls. Command authorization and persistence remain native unit/Core coverage; phone full-prevout composition is added through its shared pure owner, not a duplicate verifier.

The only new resolved registry packages are libfuzzer-sys 0.4.13, arbitrary 1.5.0 and jobserver 0.1.35. The latter two have no build scripts and MIT/Apache-2.0 licenses; arbitrary supplies byte-input traits, and jobserver bounds cc parallel compilation. All 650 shared registry package checksums match the application lockfile.

The runner disables cfg(fuzzing) while retaining AddressSanitizer and coverage instrumentation. The pinned nusb 0.2.7 fuzz-only function does not compile; more importantly, production cryptographic branches must remain exercised. No dependency was upgraded to work around this.
