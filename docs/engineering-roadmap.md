# Engineering roadmap

Status: active execution order as of 2026-09-01.

This document is the short, maintainer-facing roadmap for the engineering work
that follows the current security remediation and macOS/Testnet4 certification
effort. It does not replace the canonical product roadmap, mainnet checklist,
ADRs, or platform certification records. Those documents continue to own
product behavior and release evidence.

## Priority and status

Points 1 and 2 may proceed in parallel. Point 3 is the next planned engineering
initiative because maintainability is a wallet reliability and security
property, not cosmetic cleanup. Points 4 and 5 must build on the ownership
boundaries established by point 3 instead of adding concurrency or optimization
inside the current large orchestration units.

| Order | Initiative                                                                                       | Status                       | Exit condition                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Remediate the current low-severity security findings                                             | In progress in separate work | Fixes and focused regression tests are merged without weakening compatibility or release gates                                    |
| 2     | Complete macOS/Testnet4 hardware, recovery, packaging, reproducibility, and update certification | In progress                  | The exact candidate has the evidence required by [`mainnet-release-checklist.md`](mainnet-release-checklist.md)                   |
| 3     | Incremental maintainability program                                                              | Next priority                | The hotspots below have coherent ownership, stable public boundaries, characterization tests, and no broad rewrite                |
| 4     | Replace coarse global serialization only where evidence justifies it                             | Planned after point 3        | Per-wallet/resource ownership is proven by adversarial concurrency, cancellation, restart, and stale-result tests                 |
| 5     | Establish and enforce performance envelopes                                                      | Planned after point 3        | Large-history, recovery, sync, startup, and multi-wallet budgets are measured in CI or a reproducible benchmark harness           |
| 6     | Complete mobile coordination and platform custody                                                | Later, independently gated   | Physical iOS/Android lifecycle, key protection, recovery, interruption, camera, packaging, and independent review evidence exists |
| 7     | Complete continuity-policy evidence                                                              | Later, test-network first    | Every immediate and delayed path has funded boundary, renewal, recovery, hardware, and clean-restore evidence                     |
| 8     | Design consumer-scale operations and an optional enterprise control plane                        | Separate architecture track  | Approved ADRs, privacy/threat/tenant models, SLOs, and a boundary that never grants the service custody or signing authority      |
| 9     | Review the exact release candidate independently before mainnet                                  | Release gate                 | Independent findings are closed on the exact candidate and ADR 0012 is superseded through explicit approval                       |

## Point 3 — maintainability program

### Objective

Reduce the change radius and cognitive load of wallet work while preserving the
current custody, transaction-review, persistence, and compatibility guarantees.
The objective is not a target line count. A successful extraction gives one
domain a clear owner, makes its invariants easier to test, and leaves commands,
DTOs, persisted formats, error codes, and observable behavior unchanged.

Baseline hotspots on 2026-09-01:

| Area                                        |      Current size | Primary concern                                                                                                                      |
| ------------------------------------------- | ----------------: | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src-tauri/src/wallet.rs`                   |       5,693 lines | Registry, authentication, node access, persistence, synchronization, snapshots, policy helpers, and deletion still share one module  |
| `src-tauri/src/wallet/hardware_commands.rs` |       3,216 lines | Discovery, identity, review, address verification, and signing orchestration have a large shared change surface                      |
| `src-tauri/src/hardware.rs`                 |       1,990 lines | HWI process policy, command construction, identity, packaging, and platform verification are closely coupled                         |
| `src-tauri/src/wallet/tests.rs`             |       4,224 lines | Valuable coverage is concentrated in a same-module test unit and makes ownership harder to see                                       |
| `src/lib/wallet/dummy.ts`                   |       2,192 lines | The prototype adapter implements many unrelated `WalletPort` facets in one file                                                      |
| `src/routes/multisig/new/+page.svelte`      |       2,527 lines | Policy choice, draft persistence, signer enrollment, hardware interaction, review, and backup share one route state machine          |
| `src/routes/settings/+page.svelte`          | about 2,100 lines | Profile, credential, node, sync, recovery, hardware, backup, labels, and appearance flows share one route                            |
| `src/routes/send/+page.svelte`              |       2,010 lines | Payment drafting, coin selection, fee choice, review, hardware signing, PSBT interchange, acceleration, and result state are coupled |

These counts are diagnostics. They must not be gamed by moving code into
arbitrary files or speculative abstractions.

### Guardrails

Every maintainability change must satisfy all of the following:

- One coherent ownership seam per change; no repository-wide rewrite.
- Characterization tests exist before moving security-critical behavior.
- Tauri command names and arguments, `WalletPort`, DTOs, stable errors, SQL
  schema/statements, profile layout, encrypted envelopes, descriptors, PSBT
  semantics, and user-visible behavior remain unchanged unless separately
  approved as a product or format change.
- Secrets remain inside Rust, and extracted helpers accept the narrowest
  possible inputs rather than broad application state.
- State ownership is explicit. Wallet-scoped state includes the immutable
  wallet ID; route-local state does not become a process-global store.
- New reusable UI components still require a verified design-system gap and
  explicit approval. Route decomposition should first use route-local
  controllers, pure functions, and existing components.
- Each extraction passes focused tests while iterating and the proportionate
  harness in [`agent-harness.md`](agent-harness.md) before handoff.
- Documentation and architecture checks are updated in the same change when a
  dependency boundary moves.

### Workstream A — Rust wallet ownership

Proceed as a sequence of independently reviewable extractions:

1. Record the current internal dependency map and add missing characterization
   tests around the seam selected for the first extraction.
2. Move registry/profile path resolution and database identity/opening behavior
   behind one internal module without changing file layout or migration logic.
3. Isolate authenticated node configuration, RPC session construction, chain
   identity, retry policy, and broadcast identity checks from general wallet
   orchestration.
4. Isolate authentication throttle persistence and authorization helpers while
   preserving wallet-scoped monotonic behavior and stable errors.
5. Move snapshot projection and notification derivation into deterministic
   internal modules with explicit input data and exhaustive tests.
6. Separate Core and compact-filter synchronization coordination from update
   application. Keep BDK, address/provenance, notification, and checkpoint
   commits atomic.
7. Continue narrowing proposal persistence and acceleration ownership around
   the already-extracted transaction and multisig command modules.
8. Split tests by the domain they certify while retaining adversarial and
   cross-domain integration tests at the command boundary.

Do not extract functions solely because they are adjacent. Shared access to an
oversized application-state object is evidence that the ownership boundary is
not ready.

### Workstream B — hardware boundary

Separate policy from orchestration in this order:

1. Pure device capability and identity policy.
2. Fixed command construction and bounded response parsing.
3. Executable/package trust verification.
4. Discovery and cancellation coordination.
5. Address review, policy registration, and PSBT signing workflows.

The absolute executable boundary, digest/signature verification, full saved
identity proof, process-group cancellation, bounded output, and exact reviewed
PSBT rules must remain invariant throughout.

### Workstream C — frontend orchestration

- Split `dummy.ts` and the Tauri adapter internally along existing
  `WalletPort` facets; keep the composition root and public contract stable.
- Extract pure route policies and route-local state machines from Send,
  Settings, and multisig creation before considering presentation components.
- Keep async ownership, cancellation, wallet identity, credential teardown,
  inline results, and retry state visible and testable.
- Do not create global stores as a shortcut for reducing route size.
- Do not create parallel design-system components during decomposition.

### Workstream D — native acceptance and architecture enforcement

- Add instrumented Tauri-command acceptance with isolated application data for
  the seams being moved.
- Expand restart, corruption, cancellation, stale-result, and concurrent-action
  tests before changing serialization.
- Extend boundary checks so newly extracted modules cannot reintroduce direct
  Tauri calls from routes, dummy imports in native builds, secret-bearing DTOs,
  or cross-wallet state.
- Keep deterministic-core and whole-library coverage as separate claims; never
  reclassify adapters merely to improve a percentage.

### Point 3 definition of done

Point 3 is complete when:

- the remaining large modules have named, documented ownership seams and no
  security-critical domain is split across ambiguous duplicate helpers;
- ordinary feature changes no longer require edits across unrelated regions of
  `wallet.rs`, hardware orchestration, or the three largest routes;
- extracted deterministic policy has exhaustive tests and native orchestration
  has proportional acceptance coverage;
- no persisted format, public contract, stable error, security invariant, or
  release claim changed accidentally;
- `pnpm validate`, the strict Rust format/lint/test suite, relevant coverage,
  browser acceptance, native-network builds, and real-Core tests are green for
  the final integration commit; and
- [`architecture.md`](architecture.md),
  [`implementation-status.md`](implementation-status.md), and the code-health
  record describe the resulting boundaries accurately.

## Points 4 and 5 — concurrency and performance

Do not replace the global operation mutex because it looks coarse. First make
resource ownership explicit, then measure contention. Candidate end state is
serialization per immutable wallet ID plus separate bounded coordination for
HWI, registry mutation, recovery scans, and foreground/background network work.
Cross-wallet registry operations and any shared hardware process still require
an explicit global owner.

The benchmark envelope must cover startup, snapshot construction, normal sync,
full recovery, cancellation latency, large histories, extended address gaps,
multiple unlocked wallets, database growth, memory, network use, and retry
behavior. Performance changes may not weaken atomic persistence or privacy.

## Points 6–9 — product and operational scale

- Mobile and continuity work remain test-network-first and require their own
  physical, recovery, and independent-review evidence. Branch existence or
  simulator success is not release readiness.
- Consumer scale is primarily a client-release, compatibility, support, and
  privacy-observability problem because Groot is local-first. Wallet operation
  and signing must not acquire a cloud uptime dependency.
- Any enterprise control plane is a separate service architecture. It may
  manage organizations, policy assignments, public metadata, approvals, audit
  export, and fleet compliance, but it must not possess mnemonics, private
  descriptors, decrypted signing material, or unilateral signing authority.
- Mainnet enablement remains the last step and requires review of the exact
  candidate, not an earlier branch or architecture-equivalent build.
