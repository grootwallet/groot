# External review packet: post-5.3 maintenance

Use this packet to review the implementation and the current 91% completion assessment. Do not infer release approval from a passing test. Do not refresh source-policy hashes, merge, close issues or expand supported signers during review.

## Exact sources

- Repository: <https://github.com/grootwallet/groot>
- Release: <https://github.com/grootwallet/groot/releases/tag/v5.3.0>
- Released baseline: `6a39bf50b2a6a042354b43369765a9af2174d061`
- Original assessed candidate: `6a95822aae4d7f11960ccb7bfef3af5806b8d9e8`
- Exact tested application/reporting source: `ec940d22b06c5efe71c848801e8cefac1f4341d7`
- Branch: <https://github.com/grootwallet/groot/tree/codex/post-53-maintainability>
- Review diff: <https://github.com/grootwallet/groot/compare/v5.3.0...codex/post-53-maintainability>
- Approved plan: [post-5.3-plan.md](post-5.3-plan.md)
- Completion assessment: [post-5.3-final-status.md](post-5.3-final-status.md)

Review the original native application behavior against `6a95822a`, the subsequent Settings retry fix at `60bd8238`, and the later reporting diff through `ec940d22`. On `ec940d22`, every stage before the source-policy check passed. The fail-fast verifier reports `package.json`, the first of nine currently divergent pinned sources; all independently runnable downstream stages passed. See the [source-approval inventory](post-5.3-source-approval-inventory.md) for all nine and the proposed treatment of new owners.

## Review questions

1. Does each percentage in the scorecard follow from the approved plan's “done when” criteria?
2. Are any implemented behavior changes incorrectly described as mechanical refactors?
3. Do full-prevout authentication, phone work limits, QR ceilings and stale-result guards preserve the repository invariants?
4. Did any format, command contract, signer support statement or authorization boundary change without being disclosed?
5. Is the prepared-statement reuse demonstrably connection-local and limited to query compilation rather than wallet/security results?
6. Does the evidence support only a native large-wallet read improvement, rather than a whole-app speed claim?
7. Does the completed 1024 MiB extended UR campaign support the stated fuzzer/sanitizer-overhead diagnosis without overstating parser assurance?
8. Are physical phone/hardware, source approval, packaging and release correctly left incomplete?

Independent review of the original UR source and failure snapshot favored accumulated fuzzer/sanitizer overhead. A calibrated full rerun on `ec940d22` passed 10,775,143 cases over 7,201 fuzzing seconds with no sanitizer finding; its independent outcome review is recorded with the other review evidence.

Return an approve / approve with changes / do not approve verdict, prioritized findings with file references, incorrect completion claims, missing tests, and work that should be removed.

## Reproduction commands

Use Node 24.19.0, pnpm 11.13.1, Rust 1.97.1, locked dependencies and Bitcoin Core 31.1 for Core-backed tests. Read `AGENTS.md` and `docs/agent-harness.md` first.

```sh
git status --short
git diff --check 6a39bf50b2a6a042354b43369765a9af2174d061..6a95822aae4d7f11960ccb7bfef3af5806b8d9e8
pnpm format:check
pnpm check
pnpm test
pnpm test:coverage
pnpm test:sbom
pnpm build
```

From `src-tauri/`:

```sh
cargo fmt --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked --all-features
```

Extended checks:

```sh
pnpm test:coverage:rust:all
pnpm test:acceptance
```

The coverage/Core command is intentionally long. It creates disposable Regtest state and must retain all fixed maturity, reorg, renewal and restart assertions. The browser suite does not replace physical camera, keyboard, OS storage or hardware checks.

The fuzz workspace uses its own lockfile and pinned nightly. Generate the synthetic corpus as documented in `fuzz/README.md`, keep mutable cache/corpus directories outside the checkout, then run:

```sh
bash scripts/quality/fuzz-parsers.sh psbt_roundtrip -max_total_time=90 -timeout=2 -rss_limit_mb=512 -max_len=1048577
bash scripts/quality/fuzz-parsers.sh ur_composition -max_total_time=90 -timeout=2 -rss_limit_mb=512 -max_len=4195329
bash scripts/quality/fuzz-parsers.sh pairing_records -max_total_time=90 -timeout=2 -rss_limit_mb=512 -max_len=524353
```

The original 512 MiB extended UR result remains failed. The subsequent [UR memory calibration](post-5.3-ur-memory.md) supported a reviewed 1024 MiB allowance for the extended campaign only. The exact-source 7,200-second rerun completed with exit code 0, 10,775,143 cases, a 727 MiB reported peak and no sanitizer/timeout finding. Quiet fuzzing is evidence only within its tested budget.

## Expected validation limitation

`pnpm validate` should reach the reviewed-source policy and fail because the maintenance branch intentionally does not overwrite v5.3.0 approved hashes. Any earlier failure is a regression. After owner approval, hash updates belong in a separate approval-only commit followed by the full aggregate and packaging/physical gates.

## High-value paths

- Frontend lifetimes: `src/routes/mobile/sign/+page.svelte`, `src/routes/multisig/send/+page.svelte`, `src/routes/settings/+page.svelte`
- Shared frontend helpers: `src/lib/wallet/acceleration-quotes.ts`, `src/lib/wallet/node-form.ts`, `src/lib/wallet/settings-data.ts`
- Transaction authentication: `src-tauri/src/proposal/prevouts.rs`, `src-tauri/src/wallet/coordination_commands.rs`
- Persistence/recovery: `src-tauri/src/registry.rs`, `src-tauri/src/wallet/profile_commands.rs`, `src-tauri/src/wallet/profiles.rs`, `src-tauri/src/wallet/recovery_commands.rs`
- QR bounds: `src-tauri/src/ur_transport.rs`, `src-tauri/src/ur_transport/fountain.rs`, `src-tauri/src/coordination_transport.rs`
- Performance change: `src-tauri/src/label_provenance.rs`
- Fuzz targets: `fuzz/fuzz_targets/`

No real wallet data, credentials, PSBTs, addresses or device identifiers are required for review. Use only the repository's synthetic fixtures and disposable profiles.
