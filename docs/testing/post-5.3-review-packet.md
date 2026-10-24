# External review packet: post-5.3 maintenance

Use this packet to review the implementation and the 81% completion assessment. Do not infer release approval from a passing test. Do not refresh source-policy hashes, merge, close issues or expand supported signers during review.

## Exact sources

- Repository: <https://github.com/grootwallet/groot>
- Release: <https://github.com/grootwallet/groot/releases/tag/v5.3.0>
- Released baseline: `6a39bf50b2a6a042354b43369765a9af2174d061`
- Original assessed candidate: `6a95822aae4d7f11960ccb7bfef3af5806b8d9e8`
- Current runtime fix: `60bd8238b18f4f17d213cff9a60b917b235d81b6`
- Branch: <https://github.com/grootwallet/groot/tree/codex/post-53-maintainability>
- Review diff: <https://github.com/grootwallet/groot/compare/v5.3.0...codex/post-53-maintainability>
- Approved plan: [post-5.3-plan.md](post-5.3-plan.md)
- Completion assessment: [post-5.3-final-status.md](post-5.3-final-status.md)

The first reporting commit is `f14c3acb17bf10f4fae720d9ccd161c0bd17428a`. Review the original application behavior against `6a95822a`, then the subsequent Settings retry fix at `60bd8238`; review the later reporting diff for accuracy. On `f14c3acb`, every stage before the source-policy check passed. The fail-fast verifier then reported `package.json`, the first of nine currently divergent pinned sources; all independently runnable downstream stages passed. See the [source-approval inventory](post-5.3-source-approval-inventory.md) for all nine and the proposed treatment of new owners.

## Review questions

1. Does each percentage in the scorecard follow from the approved plan's “done when” criteria?
2. Are any implemented behavior changes incorrectly described as mechanical refactors?
3. Do full-prevout authentication, phone work limits, QR ceilings and stale-result guards preserve the repository invariants?
4. Did any format, command contract, signer support statement or authorization boundary change without being disclosed?
5. Is the prepared-statement reuse demonstrably connection-local and limited to query compilation rather than wallet/security results?
6. Does the evidence support only a native large-wallet read improvement, rather than a whole-app speed claim?
7. Is the UR memory-cap failure characterized conservatively, and what bounded evidence is required to clear it?
8. Are physical phone/hardware, source approval, packaging and release correctly left incomplete?

Independent review of the original UR source and failure snapshot favored accumulated fuzzer/sanitizer overhead but did not clear the campaign. Independent review of the fresh memory diagnosis and its outcome remains required before Step 2 can reach 100%.

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

The current extended UR result is not a pass. A reviewer should preserve ASan and capture current RSS, peak RSS, corpus size and allocator attribution during a fresh run before recommending a calibrated limit or target change. Quiet fuzzing is evidence only within its tested budget.

The subsequent [UR memory calibration](post-5.3-ur-memory.md) supports a reviewed 1024 MiB allowance for the extended UR campaign only. The 7,200-second rerun and its independent result review remain open; the failed earlier run remains failed.

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
