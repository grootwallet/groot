# Continuity readiness checks

Refs #17. ADR 0100 combines the retained continuity and mobile work in an internal 5.3 candidate. Mainnet is not merged or authorized by this work. Use disposable test-network profiles and public descriptor backups.

| Action                                                         | Expected result                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Open setup in EN/FR/ES, light/dark, desktop/mobile             | Fixed Partner and Family roles are available on test networks; Mainnet remains blocked.    |
| Restore existing Standard, Recovery, Partner or Family backups | Same descriptors, roles and first address; no profile/schema migration.                    |
| Resume a continuity draft                                      | Same role order and keys; no retained credential.                                          |
| Primary payment and early renewal                              | Only owner 2-of-3 or both parents; no relative lock. Renewal goes to a fresh owned output. |
| Select every delayed stage                                     | Exact path name, delay and required roles; immature stage unavailable.                     |
| One block before, at and after maturity                        | Native checks and actual BDK/Core transactions agree.                                      |
| Reorg and reconfirm one block later                            | Saved transaction becomes unavailable and then ready at the new maturity.                  |
| Two child-assistance signatures                                | Family assistance remains incomplete until a parent signs.                                 |
| Restart between partial signatures                             | Same PSBT, signatures and named path; no signature substitution.                           |
| Clean descriptor restore                                       | Same receive/change identity and complete recoverable chain history.                       |
| Direct USB or phone Miniscript enrollment                      | Explicit unsupported boundary; no certification claim.                                     |

Physical hardware, trusted-display review, offline PSBT interchange and independent review remain required. Long fixed delays are automated on isolated Regtest; do not claim they can be waited out during a short Testnet4 session. The [RC10 record](testing/5.3.0-rc10-unified.md) owns exact-candidate results and the physical sequence.

Late-stage regression: leave the 13,140-block both-partner proposal pending until the 39,420-block path also matures. Two partner signatures must finalize the original encoded sequence and pass Core script validation. One signature cannot satisfy the earlier proposal. A mismatched witness script must be rejected.
