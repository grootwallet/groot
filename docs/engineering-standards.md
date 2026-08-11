# Engineering standards

## Dependency direction

`route → reusable component → WalletPort → dummy or Tauri adapter → Rust command → domain/persistence/network boundary`

Dependencies point inward. Routes never select adapters. Rust commands translate DTOs and stable errors; pure domain functions own validation. BDK, Miniscript, SQLite, Core RPC, HWI, platform storage, and filesystem details stay behind their Rust modules.

## Change shape

1. State the invariant and acceptance criteria.
2. Change the smallest owning layer.
3. Add pure unit tests first, then adapter/command integration, then the minimum E2E proof.
4. Update product, architecture, flow, implementation-status, testing, and ADR documents that own the changed claim.
5. Run `pnpm validate`; add Rust and visual checks when applicable.

## Review rules

- Reject boolean “success” responses when a stable typed result/error is needed.
- Reject UI-recomputed transaction facts when the PSBT can provide them.
- Reject new global state for credentials, signing material, proposals, or wallet truth.
- Keep transient presentation history route-scoped. A global store requires multiple simultaneous consumers and an explicit lifetime/identity key; wallet-scoped records must never survive a wallet switch by accident.
- Reject unbounded input/output, silent fallback, network ambiguity, log payloads, and destructive broad filesystem targets.
- Reject a production claim supported only by dummy, simulator, snapshot, or mocked evidence.
- Prefer a small pure function and exhaustive table tests over condition-heavy route or command code.

## Supply-chain rules

- Do not add, update, or remove a dependency as a side effect of unrelated work. State the capability and threat-boundary reason first.
- Keep direct versions exact, commit both lockfiles, and use only `--frozen-lockfile` / `--locked` in automation. Never hand-edit lockfile integrity values.
- Node dependency lifecycle scripts remain disabled. Any future exception must name one exact package/version, explain the required script, inspect its published source, and record the decision before allowlisting it.
- GitHub Actions use immutable commit SHAs, job permissions stay read-only by default, and checkout credentials are not persisted. CI must not publish release artifacts from pull-request jobs.
- Vendored Rust code is reviewable source, not implicitly trusted source. Changes under `src-tauri/vendor/`, either lockfile, CI workflows, package-manager configuration, Tauri capabilities, or release scripts require an explicit supply-chain/security review.
- Advisory scanners are one signal. A green scan does not replace provenance, license review, feature review, maintainer-risk review, reproducible builds, SBOMs, signed artifacts, or independent review.
- `pnpm test:sbom` must deterministically regenerate a target-specific CycloneDX inventory from the locked, installed Node graph and Cargo metadata. Registry components require their lockfile integrity/checksum and every dependency requires declared license metadata. The application license is a release-owner decision and must not be inferred by tooling.
- `pnpm test:supply-chain` enforces exact direct Node/Rust and toolchain versions, disabled lifecycle scripts, store-integrity settings, immutable GitHub Action SHAs, read-only CI permissions, and non-persisted checkout credentials.
- Do not run a wallet release from an unreviewed CI artifact. Mainnet release provenance and signing remain blocked by the canonical checklist.

## Test pyramid

- Unit: every policy branch, boundary value, parser failure, state transition, and stable error mapping.
- Integration: database transactions, restart/corruption, BDK descriptors/PSBTs, Core sync/broadcast, and HWI transport adapters.
- E2E: every user-visible flow, important failure/retry state, accessibility contract, and responsive layout.
- Secret surfaces: `pnpm test:secret-surfaces` must remain green; new logging, telemetry/crash reporting, clipboard access, CSP origins, or native capability requires an explicit security review and matching threat-model evidence.

Coverage percentages are a floor, not evidence of correct assertions. Security-critical branches require explicit named tests even when line coverage is already complete.

Every top-level Rust module is classified by `scripts/quality/check-rust-coverage.sh`. New modules fail coverage until reviewed into the deterministic-core or adapter/orchestration scope. The near-100% core result and the whole-library result are separate claims and both are CI gates.

## AI contribution contract

Agents read the nearest `AGENTS.md`, canonical docs, and applicable ADRs before editing. They preserve unrelated work, cite exact test evidence, distinguish unverified external requirements, and never weaken a safety gate merely to make a test or demo pass.
