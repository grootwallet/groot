# Groot Continuity V1 test plan

Candidate: `v0.4.89-continuity.1`

This is a Testnet4-only, ad-hoc-signed development candidate. Never use real bitcoin, a production wallet descriptor, a real recovery seed, or an xpub from a wallet that protects real funds. Groot must never ask for seed words in these flows.

## Scope and known limits

This candidate covers the fixed policy compiler, creation UX, role ordering, resumable setup, descriptor preview/backup, immediate-path signer restriction, localization, and fail-closed hardware compatibility messaging.

The following are deliberately not acceptance claims for this candidate:

- direct USB registration, address display, or signing for a Continuity policy;
- named delayed-path transaction creation or signing;
- the six-month renewal transaction;
- Groot mobile phone-key custody or pairing;
- funded all-path Testnet4 execution;
- mainnet availability.

Report those surfaces as **Not implemented**, not as failures of the candidate.

## Before testing

1. Confirm the About/version surface says `0.4.89` and the app is named **Groot Testnet4**.
2. Use a disposable Testnet4 profile. Do not reuse an existing funded profile.
3. For descriptor-creation cases, prepare seven or eight independent, public-only test-network BIP48 account records at `m/48'/1'/0'/2'`. Use only disposable test devices or the public fixture pack distributed with the candidate.
4. Record the macOS version, Groot version, language, viewport/window size, and any hardware model plus firmware used.

## Result legend

- **Pass:** observed result exactly matches the expectation.
- **Fail:** behavior contradicts the expectation or the app crashes, hangs, or misstates authority.
- **Blocked:** a prerequisite such as disposable public keys is unavailable.
- **Not implemented:** the case is listed in the known limits above.

## A. Candidate integrity and isolation

| ID  | Action                                                                              | Expected                                                                                                                             |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | Verify the release SHA-256 file, unzip the artifact, and launch **Groot Testnet4**. | The checksum matches; the app launches as Testnet4 and never offers mainnet.                                                         |
| A2  | Launch the candidate while another stable Groot build exists.                       | The Testnet4 candidate uses its separate `app.groot.wallet.testnet4` data namespace and does not replace or open the stable profile. |
| A3  | Open the version/About surface.                                                     | Version is `0.4.89`; no screen claims production, notarized, or mainnet readiness.                                                   |

## B. Opinionated policy selection

| ID  | Action                                                      | Expected                                                                                                                  |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| B1  | Start **Create multisig wallet**.                           | Exactly three choices appear: Standard, Partner continuity, and Family continuity. No generic Miniscript builder appears. |
| B2  | Resize near 1180×780, then near 390×844.                    | Cards remain readable; actions remain reachable; there is no horizontal overflow or clipped authority text.               |
| B3  | Change Groot to French and Spanish and revisit the chooser. | The new policy names, descriptions, timelines, warnings, and actions are localized without raw identifier text.           |

## C. Partner Continuity policy

| ID  | Action                                                                     | Expected                                                                                                                                                            |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Select Partner continuity and continue.                                    | The fixed timeline shows owner 2-of-3 today, both partner keys at 13,140 blocks, either partner key at 39,420 blocks, and 2-of-3 estate guardians at 52,560 blocks. |
| C2  | Read the renewal and compatibility notices.                                | Groot recommends renewal near six months and names Ledger, Jade/Jade Plus, BitBox02, and BitBox02 Nova as candidates requiring exact certification.                 |
| C3  | Enter a wallet name and continue.                                          | Groot requests exactly eight role keys in this order: three owner signers, two partner signers, and three estate guardians.                                         |
| C4  | Add fewer than eight disposable public keys and try to review.             | Review remains blocked with an exact remaining-signer count; entered public metadata is preserved.                                                                  |
| C5  | Add all eight disposable public keys and review.                           | Groot produces a native-SegWit Miniscript descriptor and repeats the complete authority timeline before creation. No private material is requested or displayed.    |
| C6  | Save the public descriptor backup, complete creation, restart, and unlock. | The wallet reopens with `partner_continuity_v1` metadata and the same checksummed receive/change descriptors.                                                       |
| C7  | Start an immediate payment proposal.                                       | Only the three owner signers are eligible and two signatures are required. Partner and estate signers are not presented as immediately eligible.                    |

## D. Family Continuity policy

| ID  | Action                                                   | Expected                                                                                                                                                |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Select Family continuity and continue.                   | The fixed timeline shows parents 2-of-2 today, one parent plus one child-assistance role at 13,140 blocks, and a 2-of-3 estate quorum at 52,560 blocks. |
| D2  | Enter a wallet name and continue.                        | Groot requests exactly seven role keys: two parents, two child-assistance roles, two child-inheritance roles, and one executor.                         |
| D3  | Inspect the child roles.                                 | Assistance and inheritance are visibly separate roles. Groot does not silently reuse one account key in both descriptor branches.                       |
| D4  | Add all seven disposable public keys and review.         | Groot produces a native-SegWit Miniscript descriptor and repeats the parent, assistance, and estate authorities accurately.                             |
| D5  | Save the descriptor backup, create, restart, and unlock. | The wallet reopens with `family_continuity_v1` metadata and unchanged checksummed descriptors.                                                          |
| D6  | Start an immediate payment proposal.                     | Only the two parent signers are eligible and both signatures are required. Child and executor roles are not immediately eligible.                       |

## E. Resume, validation, and fail-closed behavior

| ID  | Action                                                                                                             | Expected                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Partially enroll a Partner policy, quit Groot, reopen, and resume.                                                 | Wallet name, template, signer order, labels, and stage restore exactly; no PIN, device path, or private material is persisted in the draft.       |
| E2  | Repeat E1 for Family continuity.                                                                                   | The seven-role Family draft restores without being converted to Partner, Standard, Recovery, or Inheritance.                                      |
| E3  | Attempt to add a duplicate fingerprint, duplicate xpub, wrong-network xpub, wrong derivation, or private-key JSON. | Groot rejects each input before descriptor creation with an actionable error and preserves the valid signers.                                     |
| E4  | Open **Add signer** in a Continuity policy.                                                                        | Direct USB is unavailable. Groot explains that firmware candidacy is not Groot certification and offers bounded public-key file or manual import. |
| E5  | Import a malformed or oversized public-key file.                                                                   | Import fails safely without exposing file content, changing enrolled signers, or crashing.                                                        |
| E6  | Discard the unfinished setup and confirm.                                                                          | Only the public setup draft is removed. Devices, seeds, and any completed wallet remain unchanged.                                                |

## F. Descriptor review

For C5 and D4, copy only the public descriptor into an independent Miniscript-aware Testnet4 tool.

| ID  | Action                                                                  | Expected                                                                                                                   |
| --- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| F1  | Parse both external and internal descriptors independently.             | Both parse and pass sanity checks as P2WSH; external uses `/0/*`, internal uses `/1/*`; neither contains private material. |
| F2  | Inspect Partner relative timelocks.                                     | The descriptor contains 13,140, 39,420, and 52,560-block paths with the documented role quorums.                           |
| F3  | Inspect Family relative timelocks.                                      | The descriptor contains 13,140 and 52,560-block paths with the documented role quorums.                                    |
| F4  | Compare the first receive address from the independent tool with Groot. | Addresses match exactly for the external descriptor and index zero.                                                        |

## Test report

Copy this table into the issue or release notes. Do not attach descriptors, xpubs, PSBTs, wallet addresses, logs containing identifiers, or screenshots with sensitive metadata.

| Case  | Result | Notes without wallet identifiers |
| ----- | ------ | -------------------------------- |
| A1–A3 |        |                                  |
| B1–B3 |        |                                  |
| C1–C7 |        |                                  |
| D1–D6 |        |                                  |
| E1–E6 |        |                                  |
| F1–F4 |        |                                  |

When reporting a failure, include the case ID, Groot version, operating system, language, exact visible error text, and whether the setup was fresh or resumed. Never include seeds, credentials, descriptors, xpubs, PSBTs, transaction identifiers, addresses, device paths, or raw application logs.
