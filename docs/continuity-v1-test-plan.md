# Continuity readiness checks

Refs #17. This retained branch includes current main and rc02 feedback; the old 0.4.89 package is not current evidence. Perform physical tests only after 5.2 GA, against a separately identified test-network candidate.

| Action                                                                   | Expected result                                                                                                      |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Open multisig setup in EN/FR/ES, light/dark, desktop/mobile.             | Standard remains available; Partner and Family show Coming soon.                                                     |
| Restore an existing Standard, Recovery, Partner or Family public backup. | Exact roles, receive/change descriptors and first address remain unchanged. No profile is discarded.                 |
| Resume an existing Continuity draft.                                     | Role order and public keys survive; no credential is retained.                                                       |
| Build a primary proposal from a disposable funded Continuity wallet.     | No relative lock; only owner 2-of-3 or both parents count. Fee, change and coin selection come from the actual PSBT. |
| Try delayed Continuity coordination or USB policy/display/signing.       | A stable unsupported result appears before hardware work; no production claim.                                       |

Before enabling creation, prove every named delayed path one block before, at and after maturity, reorg/reconfirmation, partial-signature restart, clean descriptor recovery, refresh and fee/change/coin-control behavior. Certify each exact model/firmware/transport against each advertised operation. Native compiler tests do not satisfy those gates.

No wallet/profile/backup/proposal/registry format change is introduced by this integration. No new reusable UI component is added. Mainnet authorization remains exact-commit scoped.

Integration recommendation: keep Continuity on its feature branch until named delayed paths, renewal and exact-device drills are implemented and reviewed. The combined source includes the RC2 mobile/CSS/defect baseline, but does not expand the phone signer beyond standard multisig or make a release claim. The policy chooser discloses the lack of certified direct USB Miniscript support before setup.
