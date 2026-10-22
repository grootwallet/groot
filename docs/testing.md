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
- Send/acceleration: PSBT-derived review, canonical inputs, validated signatures, freeze/eligibility, confirmation races and resumable proposals. Compile Mainnet policy (`GROOT_BUILD_NETWORK=multi`) and verify payments around/above the former 1,000,000-sat boundary, final fee protection, Bitcoin supply bounds, invalid fee-child rejection and specific EN/FR/ES errors (ADR 0099).
- Sync: exact network/genesis, consent, bounded failures, no silent fallback, atomic results, cancellation, reorg and restart.
- UI: durable results plus toast, loading/empty/offline states, 1180×780 and 390×844, both themes, translated copy and keyboard-safe spacing.

Coverage gates protect deterministic policy and native module classification. A percentage is not a substitute for named adversarial assertions. Browser fixtures and virtual signers never establish physical or public-network readiness.

## Keep the suite maintainable

Use the lowest layer that proves the invariant. Share fixture builders, not mutable global test state. Add one named regression for a reproduced defect; expand only when an uncovered contract needs it. Keep test data disposable and isolated from certification profiles.

Delete obsolete tests with their unreachable implementation. Deduplicate only after proving equivalent coverage. Source-boundary tests remain where they protect secrets, reviewed dependencies or release controls; do not replace them with mocks that cannot observe the boundary.

Keep screenshots, SBOMs, coverage output and performance measurements as untracked artifacts. Record physical evidence against exact commit/model/firmware. Candidate-specific [test guides](testing/) are instructions for that candidate, not evergreen specifications.

## Mobile foundation

ADR 0089 adds native desktop/mobile capability-policy and command-order regression tests. Compile the arm64 iOS target to catch desktop-only native API calls. The isolated debug archive establishes build evidence only; pairing, camera, public watch sync, receive labels, PSBT transfer and device lifecycle require the staged evidence in the [5.3 plan](mobile-5.3-plan.md). Keep signing blocked and desktop profiles intact.

## 5.3 defect regressions

ADR 0090 is covered by SQLite failure, transaction rollback/reopen and idempotent exact-proposal reconciliation tests, plus native-adapter null-snapshot tests. Browser regressions cover the accepted-but-recording-pending warning, retained Activity after refresh failure, accessible tooltip relationships/Escape, and translated scanner denial/count/limit states. Native worker source guards reject main-thread operation-lock waits and check identity binding for newly queued wallet-specific work. The [native review and device checklist](testing/5.3-native-review.md) records the remaining release-review boundary and exact device test scope. These guards supplement the Rust suites; browser fixtures do not prove native UI responsiveness, physical camera behavior or VoiceOver certification.

The [mobile-key audit](testing/5.3-mobile-key-audit.md) records the installed iPhone capability gap and fresh retained-branch native/Core tests. ADR 0093 restores the broader phone-key delivery goal without claiming it is implemented.

The [RC2 mobile-key record](testing/5.3.0-rc2-mobile-keys.md) tracks the recovered signer implementation, new iOS protection, native/Core checks and unfinished physical acceptance. The local Core harness now includes the retained phone-key review/sign/merge/broadcast scenario.
