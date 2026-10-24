# Post-5.3 plan completion status

Date: 2026-10-24. Released baseline: `6a39bf50b2a6a042354b43369765a9af2174d061` (v5.3.0). Original clean native assessment: `6a95822aae4d7f11960ccb7bfef3af5806b8d9e8`. Subsequent frontend Settings runtime fix: `60bd8238b18f4f17d213cff9a60b917b235d81b6`; the earlier runtime baseline was `da7b81731173233b3576a17c020e468238f99566`. The branch is `codex/post-53-maintainability` and remains unmerged.

## Conclusion

**The current interim estimate is 86% complete. The earlier reviewed assessment was 81%.**

The owner accepted the package-size outcome as measured with no safe reduction, moving Step 5 from 50% to 100% under the revised [finishing plan](post-5.3-finish-plan.md). A later frontend review found and fixed a Settings retry race. The complete plan still requires a clean extended UR fuzz result, final-source validation and approval, and physical phone/hardware acceptance. The original native/Core campaign applies to the unchanged native source; the subsequent Settings fix has focused browser evidence. This is an interim score, not release acceptance.

## Scoring method

The weights below were fixed for this assessment according to risk and effort. Each row earns only verified work; deferred approval or physical work earns no credit merely because code exists.

| Plan step                     |   Weight | Completion |           Weighted result | Evidence and remaining work                                                                                                                                                                                                                                    |
| ----------------------------- | -------: | ---------: | ------------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Protect the starting point |      15% |       100% |                     15.0% | Operation inventory, compatibility record, preserved dirty checkout and verified recovery bundle are complete.                                                                                                                                                 |
| 2. Check sensitive behavior   |      25% |        90% |                     22.5% | Stale-result, retry, persistence-fault, full-prevout, fee/change, QR boundary and composed-parser work is implemented and tested. The UR extended fuzz run remains unresolved; physical camera/phone behavior remains separate.                                |
| 3. Simplify ownership         |      20% |       100% |                     20.0% | Frontend helpers, lifecycle ownership, Rust profile/notification/recovery owners, shared fountain checks and prevout owner are implemented with stable public contracts.                                                                                       |
| 4. Measure and improve speed  |      15% |        80% |                     12.0% | Repeatable large-wallet native reads improved by about 30% in the controlled fixtures. Launch, routes, phone processing, storage and size were measured. Real IPC, contention, device stalls and the full transaction-preparation breakdown remain unmeasured. |
| 5. Reduce package size safely |      10% |       100% |                     10.0% | Attribution is complete and found no safe supported-workflow reduction. The owner accepted this milestone as measured with no change; further size reduction is separate work.                                                                                 |
| 6. Review and accept          |      15% |        40% |                      6.0% | Independent reviews, frontend/browser checks and clean final native/Core coverage exist. One extended fuzz run, source-pin approval, full aggregate validation, physical acceptance, merge and release remain open.                                            |
| **Total**                     | **100%** |            | **85.5%, rounded to 86%** |                                                                                                                                                                                                                                                                |

The earlier 95% code estimate covered the planned application changes themselves. The owner chose to retain the current Testnet4 phone fee behavior; a new threshold is outside this cleanup. The percentage rubric is a transparent progress estimate, not a formal test metric.

## Implemented and verified

- Phone signing authenticates every input against its complete previous transaction, rejects duplicated or inconsistent outpoints, verifies wallet-owned change and uses checked monetary arithmetic.
- Phone work and QR response sizes are bounded before expensive signature verification and key access. There is no claimed phone file-import fallback.
- Phone, multisig Send and Settings discard obsolete asynchronous replies and retain the confirmed wallet when a switch fails. Settings retries preserve unrelated same-wallet action cleanup. PIN and busy-state lifetimes are bounded.
- Registry/profile cleanup preserves files after an uncertain commit. Atomic-file, SQLite and pairing-completion failure/reopen/retry paths have deterministic tests.
- Profile, notification and recovery code has focused Rust ownership. Shared QR fountain validation preserves protocol-specific limits and errors.
- Prepared SQL statements are reused only within the existing bounded connection cache; wallet results and security decisions remain fresh. Controlled 1,000-transaction fixtures show about 30% lower native snapshot/history read time.
- Compatibility copy states that phone pairing supports standard multisig only and that Miniscript workflows support only a subset of otherwise compatible hardware signers.
- The build watcher, isolated fuzz tooling and unsigned Testnet4 iOS validation helper were corrected without changing wallet formats or dependency versions.

## Test status

| Check                                                | Result                                                                                                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rust format and strict all-target/all-feature Clippy | Passed on `6a95822a`                                                                                                                                       |
| Native tests                                         | 619 library tests and six integration cases passed; documented Core-only cases ignored in this command                                                     |
| Clean whole-library coverage                         | 63.68% lines, 59.06% functions, 61.41% regions; unchanged 62/59/59 gates passed                                                                            |
| Disposable Bitcoin Core scenarios                    | All 15 passed, including Continuity maturity/reorg/restart and phone transaction round trip                                                                |
| Frontend units and policy coverage                   | 911 tests passed; policy modules retained 100% statement/branch/function/line coverage                                                                     |
| Browser acceptance                                   | 413 passed, 19 intentional skips on the Settings-fixed source; desktop/mobile layouts checked; eight earlier French/Spanish view/theme combinations passed |
| Extended PSBT fuzzing                                | Passed 30 minutes, 9,163,888 executions                                                                                                                    |
| Extended pairing-record fuzzing                      | Passed two hours, 37,796,445 executions                                                                                                                    |
| Extended UR-composition fuzzing                      | **Unresolved:** stopped after 4,948 seconds at the 512 MiB process cap; no crash or invalid acceptance was reported before the cap                         |
| Dependency review                                    | Frontend production audit found no high-severity advisory; Rust audit retained 12 documented warnings for separate dependency work                         |
| `pnpm validate`                                      | On reporting commit `f14c3acb`, every preceding stage passed and the sole failure was the expected source-policy mismatch                                  |
| Downstream validation stages                         | Release update/HWI/compare fixtures, development runtime, type check, 911 units, policy coverage, SBOM and production build passed                         |

The failed UR campaign remains failed. A fresh frozen-corpus and ten-minute mutation diagnostic with current-memory sampling passed under an independently reviewed 1024 MiB extended-campaign allowance; it supports sanitizer/fuzzer overhead as the dominant cause. The full two-hour run is still required before clearing it. See the [memory record](post-5.3-ur-memory.md).

## Required before calling the plan 100%

1. Complete the extended UR-composition sanitizer campaign with ASan, unchanged parser checks and the independently calibrated 1024 MiB campaign limit.
2. Obtain independent review and owner approval of the exact source, then update source hashes in a separate approval-only commit and rerun the aggregate.
3. Complete the physical Testnet4 phone-pairing and supported Miniscript hardware matrix in the [physical checklist](post-5.3-maintenance.md#maintainer-physical-acceptance).
4. Merge and package only after the above acceptance gates. No merge or release is part of this assessment.

## Scope boundaries

No persisted wallet, profile, registry, proposal, backup, credential or pairing format changed. No migration, new network, new signer certification, dependency upgrade, approval cache, panic-policy change or Mainnet expansion was introduced. Completed-pair key revocation remains unimplemented. Ledger, Jade/Jade Plus and BitBox02 families remain Miniscript candidates rather than certified direct-USB Groot workflows; Coldcard and Trezor delayed policies remain unsupported through the current integration.

See the [execution record](post-5.3-execution.md), [independent review](post-5.3-independent-review.md), [measurements](post-5.3-measurements.json), [operation inventory](post-5.3-operation-ownership.md) and [dependency triage](post-5.3-dependency-triage.md).
