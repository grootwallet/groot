# Post-5.3 operation ownership and acceptance

Refs #121. Starting source: `c5bfc2756752448cac35a05f08c8b0c684779124`; released baseline: `6a39bf50b2a6a042354b43369765a9af2174d061`. Existing full-prevout authentication, pre-dispatch quote cancellation, and trilingual compatibility corrections are intentional differences from the release. Preserve them.

## Compatibility and scope

No wallet, registry, backup, draft, proposal, credential or notification format changes. No signer/network support expansion. Rust retains transaction and authorization authority. Native changes already committed remain durable when their UI disappears; stale UI suppression must never retry a payment automatically.

The branch-cleanup bundle and manifest have verified private durable copies, with owner-only access and SHA-256 records. Restore instructions and location are recorded privately. Retain until explicit owner approval to remove. The original dirty checkout and other worktrees remain untouched.

## Bounded operation inventory

| Operation                                                 | Owner and lifetime                                                           | Existing behavior evidence                                                              | Missing or extended proof                                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Send initial load, fees, draft, acceleration              | Send route; current wallet/load generation; quotes in acceleration-quotes.ts | Quote deferred-result units; Send generation checks; payment/browser tests              | Retain guarded late reads and draft recovery; compare moves to this baseline                                   |
| Multisig initial load, paths, draft, fees, policy display | Multisig Send route; one current load and immutable wallet context           | Payment/Core/continuity tests; source checks                                            | Out-of-order late reads, teardown, policy callbacks and failure publication                                    |
| Settings initial data and polling                         | Settings route; selected wallet and route lifetime                           | Settings browser tests; source-text concurrency checks                                  | Late node/health/scan reads after switch/teardown; prevent subsequent obsolete reads                           |
| Settings node/sync/reuse/rename/labels/health/backup      | Settings action; wallet context and dialog attempt                           | Existing successful/failure UI flows; native selected-wallet guards                     | Delayed success/error must not overwrite reopened dialog; clear credentials; keep completed native writes      |
| Settings rescan/network restart                           | Settings + shell pause owner; native durable scan                            | Shell pause units, scan/Core tests                                                      | Every failure/teardown must release its own pause; restart remains deliberate                                  |
| Phone scan/review/sign                                    | Phone signing route; scan attempt + wallet identity                          | mobile-signing browser test; native exact-revision and full-prevout tests               | Reset/teardown during decode/review/sign, late failure, duplicate submit                                       |
| Pairing completion and restart                            | coordination_commands + pairing_storage + registry                           | Interrupted staging/consuming recovery, replay/cancel, real-Core round trip             | Fault injection at actual completion/write/commit boundaries; no duplicate retry after commit                  |
| Registry/private JSON/SQLite persistence                  | Native storage and caller transaction                                        | Registry partial-write/pre-rename tests; generic SQLite rollback; proposal reopen tests | Real wallet transaction failure and file fsync/rename semantics, rather than another generic SQL demonstration |
| QR/PSBT/descriptor/pairing parsing                        | Native parser/transport owners                                               | Bounded deterministic mutation corpus and hostile fountain headers                      | Explicit shape branches, request/response capacity and composed coverage-guided fuzzing                        |
| Performance and package size                              | Opt-in synthetic production measurement tooling                              | Per-asset Node report; Vite fixture route timings                                       | Native production timing, size attribution and paired measurements; no live wallet data                        |

Source-text tests are architecture checks, not proof of asynchronous behavior. New tests must drive the relevant operations with controlled delayed replies or real disposable storage. Physical phone, hardware and final package acceptance remain separate evidence.

## Approval boundaries

Preserve reviewed-source hashes. After independent review of the exact final source, owner source/release approval is still required before a separate hash-approval commit. Run all non-approval validation stages even while this gate is blocked. A new Testnet4 phone fee threshold requires its own owner decision; retain existing rules pending that decision. Do not merge, release, or certify hardware from this implementation work.
