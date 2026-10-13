# Testing

[The maintainer harness](agent-harness.md) owns commands, runtime pins and release procedures. This page owns what each layer must prove.

| Layer               | Purpose                                                                                      | Location                                                              |
| ------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Frontend units      | Pure policy, formatting, state transitions and stable error handling                         | `src/lib/**/*.test.ts`                                                |
| Rust units          | Descriptor/key/credential validation, transaction invariants, bounds and deterministic state | `src-tauri/src/`                                                      |
| Native integration  | Atomic persistence, restart/corruption, isolation, PSBTs, sync and broadcast                 | `src-tauri/tests/`, native wallet tests                               |
| Real Core Regtest   | Funded transactions, replacement/reorg, multisig and recovery against Bitcoin Core           | `scripts/regtest/`                                                    |
| Browser acceptance  | User flow, keyboard/accessibility, failure/retry and responsive layouts                      | `e2e/`                                                                |
| Physical acceptance | Exact model/firmware, trusted display, USB/camera, native secret UI and platform lifecycle   | [Hardware certification](hardware-certification.md)                   |
| Release checks      | Clean source, provenance, SBOM, signatures, packaging and exact authorization                | `scripts/release/`, [Mainnet checklist](mainnet-release-checklist.md) |

## Required cases

- Create/recover/unlock/lock/delete: wrong credentials, backup requirements, interruption and other-wallet preservation.
- Receive: atomic permanent labels, unused-only discard, recovery gap, exact device identity and address proof.
- Send/acceleration: PSBT-derived review, canonical inputs, validated signatures, freeze/eligibility, confirmation races and resumable proposals.
- Sync: exact network/genesis, consent, bounded failures, no silent fallback, atomic results, cancellation, reorg and restart.
- UI: durable results plus toast, loading/empty/offline states, 1180×780 and 390×844, both themes, translated copy and keyboard-safe spacing.

Coverage gates protect deterministic policy and native module classification. A percentage is not a substitute for named adversarial assertions. Browser fixtures and virtual signers never establish physical or public-network readiness.

## Keep the suite maintainable

Use the lowest layer that proves the invariant. Share fixture builders, not mutable global test state. Add one named regression for a reproduced defect; expand only when an uncovered contract needs it. Keep test data disposable and isolated from certification profiles.

Delete obsolete tests with their unreachable implementation. Deduplicate only after proving equivalent coverage. Source-boundary tests remain where they protect secrets, reviewed dependencies or release controls; do not replace them with mocks that cannot observe the boundary.

Keep screenshots, SBOMs, coverage output and performance measurements as untracked artifacts. Record physical evidence against exact commit/model/firmware. Candidate-specific [test guides](testing/) are instructions for that candidate, not evergreen specifications.
