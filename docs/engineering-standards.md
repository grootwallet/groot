# Engineering standards

## Dependency direction

`route → reusable component → WalletPort → dummy or Tauri adapter → Rust command → domain/persistence/network boundary`

Dependencies point inward. Routes never select adapters. Rust commands translate DTOs and stable errors; pure domain functions own validation. BDK, Miniscript, SQLite, Core RPC, HWI, platform storage, and filesystem details stay behind their Rust modules.

## Change shape

1. Confirm the live tracking issue and state the invariant and acceptance criteria.
2. Branch from the current default branch and reference the issue from commits and the pull request.
3. Change the smallest owning layer.
4. Add pure unit tests first, then adapter/command integration, then the minimum E2E proof.
5. Update product, architecture, flow, implementation-status, testing, and ADR documents that own the changed claim.
   Update [`bip-support.md`](bip-support.md) whenever the change adds, removes,
   expands, narrows, or changes evidence for a BIP; record an explicit no-impact
   assessment when no BIP is affected.
6. Run `pnpm format` after editing supported frontend, configuration, or documentation files.
7. Run `pnpm validate`; add Rust and visual checks when applicable.

## Issue-linked work

- Use a GitHub issue as the durable tracker for every non-trivial bug, feature,
  security hardening item, maintenance task, or release campaign. Verify its live
  state and acceptance criteria before implementation.
- Commits use `Refs #N` or an equivalent issue trailer. Pull requests link the
  issue and use `Closes #N` only when the complete acceptance criteria are met.
  Partial delivery uses `Refs #N`, records what remains, and leaves the issue open.
- Close an issue only after the implementing change is merged and its result is
  read back, or when an accepted ADR explicitly rejects or supersedes the work.
  Leave a concise close reason with the commit, pull request, release, or ADR.
- Do not put an unpatched vulnerability or exploit detail in a public issue.
  Track sensitive work in a draft security advisory or other owner-approved
  private tracker and use only a sanitized reference in public commits and PRs.
- A purely editorial typo may omit an issue when it changes no behavior, policy,
  release claim, dependency, or security statement. An emergency fix may begin
  before issue triage only when delay would increase risk; create or update its
  tracker as soon as disclosure and incident constraints permit.

## Persisted-format compatibility

- Treat wallet databases, registry entries, public metadata, encrypted verifier files, backups, proposals, labels, and certification profiles as versioned product interfaces even before release.
- Before implementation, state whether the change is backward compatible, requires a bounded migration, or deliberately drops disposable test data. Name the exact affected networks/profile kinds and recovery path.
- A breaking change requires an accepted ADR and the user's explicit approval before code or migration work begins. Approval must choose migration versus discard; agents may not infer that choice from test-only status.
- Unsupported data must remain untouched until an explicit delete/reset action. The UI must identify the format incompatibility directly and must not present a missing verifier as a wrong PIN, corruption, or successful recovery.
- Public-network wallet data defaults to fail-closed migration or backup recovery. Discarding it is never an agent decision.
- Add fixtures for the last supported format and the first unsupported format. Any future compatibility window or migration removal is another breaking decision subject to the same gate.
- Additive semantic migrations still advance their owning schema marker and require an idempotent
  preservation test. Reusing a stable entity must not rewrite older entities or assignments merely
  to make historical data look cleaner.

## Review rules

- Reject boolean “success” responses when a stable typed result/error is needed.
- Reject UI-recomputed transaction facts when the PSBT can provide them.
- Reject new global state for credentials, signing material, proposals, or wallet truth.
- Keep transient presentation history route-scoped. A global store requires multiple simultaneous consumers and an explicit lifetime/identity key; wallet-scoped records must never survive a wallet switch by accident.
- Reject unbounded input/output, silent fallback, network ambiguity, log payloads, and destructive broad filesystem targets.
- Reject a production claim supported only by dummy, simulator, snapshot, or mocked evidence.
- Prefer a small pure function and exhaustive table tests over condition-heavy route or command code.
- New feature UI must compose the existing design-system components in `src/lib/components/`. A flow may supply device-specific content or behavior, but must not introduce route-local cards, typography, badges, lists, confirmations, identifier displays, or other substitutes for an existing pattern. If no existing component satisfies a verified need, explain the gap and obtain the user's explicit approval before creating a new reusable component; once approved, document its intended variants in `docs/design-system.md`.

## Formatting

- Run `pnpm format` after changing Svelte, TypeScript, JavaScript, CSS, JSON, Markdown, or YAML files. Review the resulting diff before committing, especially whitespace-sensitive Svelte templates and documentation examples.
- `pnpm validate` runs `pnpm format:check` and fails when supported files do not match the repository's Prettier configuration.
- Prettier does not format Rust. Continue to run `cargo fmt` while editing Rust and `cargo fmt --check` from `src-tauri` before handoff.

## Supply-chain rules

- Do not add, update, or remove a dependency as a side effect of unrelated work. State the capability and threat-boundary reason first.
- Keep direct versions exact, commit both lockfiles, and use only `--frozen-lockfile` / `--locked` in automation. Never hand-edit lockfile integrity values.
- Node dependency lifecycle scripts remain disabled. Any future exception must name one exact package/version, explain the required script, inspect its published source, and record the decision before allowlisting it.
- GitHub Actions use immutable commit SHAs, job permissions stay read-only by default, and checkout credentials are not persisted. CI must not publish release artifacts from pull-request jobs.
- Vendored Rust code is reviewable source, not implicitly trusted source. Changes under `src-tauri/vendor/`, either lockfile, CI workflows, package-manager configuration, Tauri capabilities, or release scripts require an explicit supply-chain/security review.
- Advisory scanners are one signal. A green scan does not replace provenance, license review, feature review, maintainer-risk review, reproducible builds, SBOMs, signed artifacts, or independent review.
- `pnpm test:sbom` must deterministically regenerate a target-specific CycloneDX inventory from the locked, installed Node graph and Cargo metadata. Registry components require their lockfile integrity/checksum and every dependency requires declared license metadata. Metadata binds the inventory to the exact Git commit, both lockfile digests, and, for a package/release build, the built executable digest. Generated SBOMs are build evidence and are never committed; the gate rejects tracked CycloneDX or SPDX output so a stale repository copy cannot become authoritative. A Cargo `license-file` declaration is embedded as bounded license evidence rather than guessed into an SPDX expression. The application component must report the manifest-declared Apache-2.0 license from ADR 0080; tooling must not infer or overwrite third-party terms.
- `pnpm test:supply-chain` enforces exact direct Node/Rust and toolchain versions, disabled lifecycle scripts, store-integrity settings, immutable GitHub Action SHAs, read-only CI permissions, and non-persisted checkout credentials.
- Do not run a wallet release from an unreviewed CI artifact. v0.4.96 is the
  currently authorized Mainnet release; every later release requires a completed
  checklist, accepted exact-commit ADR, provenance, signing, and authorization
  record.

## Test pyramid

- Unit: every policy branch, boundary value, parser failure, state transition, and stable error mapping.
- Integration: database transactions, restart/corruption, BDK descriptors/PSBTs, Core sync/broadcast, and HWI transport adapters.
- E2E: every user-visible flow, important failure/retry state, accessibility contract, and responsive layout.
- Secret surfaces: `pnpm test:secret-surfaces` must remain green; new logging, telemetry/crash reporting, clipboard access, CSP origins, or native capability requires an explicit security review and matching threat-model evidence.

Coverage percentages are a floor, not evidence of correct assertions. Security-critical branches require explicit named tests even when line coverage is already complete.

Every top-level Rust module is classified by `scripts/quality/check-rust-coverage.sh`. New modules fail coverage until reviewed into the deterministic-core or adapter/orchestration scope. The near-100% core result and the whole-library result are separate claims and both are CI gates.

## AI contribution contract

Agents read the nearest `AGENTS.md`, canonical docs, applicable ADRs, and
[`agent-harness.md`](agent-harness.md) before editing. They inspect and preserve
the existing working tree, cite exact test evidence, distinguish unverified
external requirements, verify live GitHub issue state before repeating it, and
never weaken a safety gate merely to make a test or demo pass. The offline
`pnpm test:agent-scaffolding` gate protects the required guides, commands,
runtime pins, product names, and evidence rules from silent drift.
