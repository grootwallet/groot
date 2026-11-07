# Internal hardware handoff — 2026-11-07

Refs #121. This closes the implementation portion of the post-5.3 refactoring plan and prepares the owner's explicitly requested unsigned internal macOS candidate. Physical acceptance, independent exact-source approval and public release remain separate. BIP impact: none; build evidence does not expand standards support.

## Implementation closure

| Plan obligation                       | Current owner/evidence                                                                                                                                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compatibility and operation inventory | [Operation ownership](post-5.3-operation-ownership.md); existing wallet/profile/backup/proposal/credential formats and WalletPort/IPC remain unchanged                                                                            |
| Sensitive failures and parser bounds  | [Execution record](post-5.3-execution.md), [independent review](post-5.3-independent-review.md), full-prevout/QR/work bounds and fault/reopen regressions                                                                         |
| Coherent ownership                    | Existing Settings/quote/node helpers, native profile/notification/recovery modules, shared fountain/prevout checks; [PIN lifetime follow-up](maintenance-2026-11-07.md) and [shared camera lifecycle](macos-camera-2026-11-07.md) |
| Extended fuzzing                      | [Reviewed two-hour UR campaign](post-5.3-ur-memory.md) completed; its earlier failed run remains recorded                                                                                                                         |
| Performance and size                  | Prepared-query reuse improved the measured synthetic history path; [current native measurements](0.5.4-rc01-validation.md) remain scoped. No justified further cache, signer-runtime trim or broad abstraction is added           |
| Owner hardware build                  | Clean frozen source, isolated app identity, actual camera signature checks, preserved app filename, portable ZIP, fresh executable-bound SBOM, provenance and checksums                                                           |

The original engineering work is implemented. A new line-count target, broad UI rewrite or approval cache would add risk without an accepted benefit. Physical camera/device waits and IPC contention remain observation work on the candidate, not claims established by browser fixtures. There is no universal bug-free or security proof.

## Candidate boundary

The internal app is **Groot RC**, identifier `app.groot.wallet.internal`, separate from public Groot. Previous internal RC profiles may already exist there. macOS arm64 still requires an ad-hoc executable seal; there is no Developer ID signing, notarization or public installer authorization. The build uses the pinned HWI and sealed fast runtime, with `REHEARSAL_ONLY` compiled signing identity.

The handoff directory contains the app, ZIP/DMG, `BUILD-INFO`, `PROVENANCE.json`, executable-bound `groot.cdx.json` and `SHA256SUMS`. The manifests name the exact commit and digests. The builder rejects source drift and incomplete packaging; its final camera-only permission and code seals are checked. Internal DMGs preserve the app filename rather than renaming it to the public app's filename.

Use Testnet4 and disposable wallets. Do not replace public Groot, reset a funded profile or copy private wallet data into evidence. A multi-network internal binary does not expand phone, Continuity or hardware certification scope. Mainnet phone signing, Mainnet Continuity and unsupported delayed-policy signers remain blocked.

## Minimal owner acceptance

The existing `51a09f43` macOS candidate retains its historical runtime and camera/package evidence; it is not relabelled as a build of later changes. Timelock coin UX was integrated in `41a2ed91..f3d9ab4e`, followed by release-integrity work on the same post-5.3 maintenance branch. Use only the final combined candidate built from the final recorded clean commit for the next owner pass. Verify its fresh checksum and use Testnet4 with disposable wallets.

1. **Camera:** allow/deny then retry; scan one real payment QR and animated QR, close/reopen and background once. Confirm the decoded details and that capture stops.
2. **Each signer model you intend to use:** combine discovery/unlock, exact account and receive-address confirmation, rejection/retry, and approval of one tiny Testnet4 payment. Disconnect once and check the retry is understandable; compare address, amount and fee on the trusted display.
3. **Restart:** reopen/unlock the same wallet and confirm the transaction/proposal and accounting persist. Record any unexpected delay, unclear action or layout problem during these same flows.

Record model, firmware, OS and artifact digest using the [hardware worksheet](../hardware-certification.md). This is the minimal owner pass, not blanket certification. Add [phone/Miniscript acceptance](post-5.3-phone-miniscript-human.md) only for the flows you intend to use: phone pairing remains Standard-only and delayed policies require exact offline-signer/model/firmware/transport evidence. Stop on an identity/address/policy/amount/fee mismatch, unexpected signature, lost state or failed recovery. Do not repeat automated browser, parser or Core regression suites manually.

The [CI record](ci-efficiency-proposal-2026-11-07.md) records measured costs and recommended changes; no CI obligation is removed. Source approval remains frozen. A later public package requires the approval-only hash commit, complete aggregate, accepted physical evidence and explicit release authorization.
