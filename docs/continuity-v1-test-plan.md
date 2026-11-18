# Continuity readiness checks

Refs #17. ADR 0100 combines the retained continuity and mobile work in an internal 5.3 candidate. Mainnet is not merged or authorized by this work. Use disposable test-network profiles and public descriptor backups.

| Action                                                         | Expected result                                                                                                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open setup in EN/FR/ES, light/dark, desktop/mobile             | Fixed Partner and Family roles are available on test networks; Mainnet remains blocked.                                                            |
| Restore existing Standard, Recovery, Partner or Family backups | Same descriptors, roles and first address; no profile/schema migration.                                                                            |
| Inspect Partner/Family Groot JSON before restore               | Exact named paths and separate role groups appear; never a flat 2-of-8 or 2-of-7 policy.                                                           |
| Resume a continuity draft                                      | Same role order and keys; no retained credential.                                                                                                  |
| Primary payment and early renewal                              | Only owner 2-of-3 or both parents; no relative lock. Renewal goes to a fresh owned output.                                                         |
| Expand every funded coin in Coins                              | Every fixed path appears with exact signer groups, fingerprints, state, remaining blocks and earliest inclusion block.                             |
| Compare coins confirmed at different heights                   | Each coin has its own countdown; the same path has a different target block where expected.                                                        |
| Inspect an unconfirmed Continuity coin                         | The primary path remains visible; delayed waits say they start after confirmation and do not invent a target date.                                 |
| Inspect a coin one block before a delayed path                 | The path says one block remains and shows the exact next eligible inclusion block.                                                                 |
| Inspect Family assistance                                      | Separate **1 of 2 Parents** and **1 of 2 Child assistance signers** groups; never 2 of 4.                                                          |
| Inspect path lifetime and chain freshness                      | Copy says the coin does not expire; earlier paths remain. Stale/reorg state requires sync before a readiness claim.                                |
| Compare Regtest and Testnet4 timing                            | Regtest says calendar estimates are unavailable because mining is manual. Any Testnet4 date is visibly approximate and never replaces block facts. |
| Reach the Continuity renewal recommendation                    | Recommendation begins at 26,280 confirmations; it remains optional and uses the primary path.                                                      |
| Select every delayed stage                                     | Exact path name, delay and required roles; immature stage unavailable.                                                                             |
| One block before, at and after maturity                        | Native checks and actual BDK/Core transactions agree.                                                                                              |
| Reorg and reconfirm one block later                            | Saved transaction becomes unavailable and then ready at the new maturity.                                                                          |
| Two child-assistance signatures                                | Family assistance remains incomplete until a parent signs.                                                                                         |
| Restart between partial signatures                             | Same PSBT, signatures and named path; no signature substitution.                                                                                   |
| Clean descriptor restore                                       | Same receive/change identity and complete recoverable chain history.                                                                               |
| Direct USB or phone Miniscript enrollment                      | Explicit unsupported boundary; no certification claim.                                                                                             |

Physical hardware, trusted-display review, offline PSBT interchange and independent review remain required. Long fixed delays are automated on isolated Regtest; do not claim they can be waited out during a short Testnet4 session. The [RC10 record](testing/5.3.0-rc10-unified.md) owns exact-candidate results and the physical sequence.

Late-stage regression: leave the 13,140-block both-partner proposal pending until the 39,420-block path also matures. Two partner signatures must finalize the original encoded sequence and pass Core script validation. One signature cannot satisfy the earlier proposal. A mismatched witness script must be rejected.

Delayed-spend proposals intentionally use one input and one output. Attempt to add or substitute another input after review; Groot must reject the changed transaction. Do not turn this into a multi-input delayed-spend acceptance test.
