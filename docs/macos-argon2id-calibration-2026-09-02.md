# macOS Argon2id calibration — 2026-09-02

Status: measured preparation evidence; security-parameter decision remains open

## Scope

This measurement exercises Groot's exact portable-profile credential KDF in an
optimized Rust test build. It uses a fixed synthetic credential and salt and
does not open a wallet, read a profile, or contain user data.

- Source commit: `6dc31cc43670ebc68bd37dd47cdd5c4f02417c66`
- Host: Apple M1 Pro, arm64
- macOS: 26.1
- Rust: repository-pinned 1.97.1 toolchain
- Algorithm: Argon2id version 0x13
- Memory: 19,456 KiB
- Iterations: 2
- Parallelism: 1
- Output: 32 bytes
- Samples: 11 after one warm-up

## Reproduction

Run from `src-tauri` in a clean checkout of the recorded commit:

```sh
cargo test --release --locked \
  secure_store::tests::credential_kdf_calibration -- \
  --ignored --nocapture
```

Observed result:

```text
min_ms=17.446 median_ms=18.005 max_ms=18.818
```

The ignored test passed. A debug-build sanity run also passed but is not
release evidence.

## Interpretation and open decision

This establishes the current cost on one supported-class Mac; it does not prove
that the parameters provide sufficient resistance to offline guessing. A copied
portable profile permits offline attempts, the 16-character creation minimum is
not an entropy guarantee, and historical non-empty credentials remain accepted
for recovery. The approximately 18 ms median is therefore an explicit input to
the independent security review.

Changing the current hard-coded KDF parameters would make existing v3 envelopes
unreadable unless Groot first introduces authenticated per-envelope KDF
parameters and a bounded migration. That is a persisted-format change and is
not authorized by this calibration. Before mainnet, the independent reviewer
and release owner must either:

1. accept the recorded parameters and residual offline-guessing risk for the
   limited release; or
2. approve a separately designed, compatibility-preserving envelope revision
   and migration, followed by full profile and package retesting.

The final signed candidate must repeat release-mode calibration and one observed
unlock-latency check on the packaged application. Results from this preparation
commit do not transfer automatically to that candidate.
