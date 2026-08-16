# Blockstream Jade physical certification — 2026-08-15 checkpoint

This sanitized review artifact records the completed portion of an ongoing
physical-device campaign. The sensitive local worksheet is gitignored. No seed,
credential, address, xpub, PSBT, device path, RPC secret, transaction identifier,
or complete fingerprint is included here.

- Device family/model: original Blockstream Jade Classic, not Jade Plus
- Firmware: 1.0.40
- Host OS/version: macOS 26.1 Tahoe
- Groot candidate: the commit containing this report, based on `de17d1d`
- HWI version: 2.3.1
- Network: Regtest using Jade's Testnet network family
- Test date/reviewer: 2026-08-15 / local physical session
- Independent reviewer: pending

## Decision at this checkpoint

**LOCAL REGTEST USB CERTIFICATION PASS / RELEASE CERTIFICATION IN PROGRESS.**
The exact original Jade passed the lifecycle, BIP84 public-account
import, trusted receive-address display, funded rejection/retry/sign/broadcast,
confirmation/accounting, and device-free restart-persistence scope below. It
also passed BIP48 policy registration, first-address proof, an on-device signing
rejection followed by a successful unchanged retry, partial-signature process
restart, threshold completion with the independently certified BitBox02,
broadcast, confirmation/accounting, signer-health, interruption/retry, hostile
PSBT, wrong-device, and local descriptor-recovery checks. This completes the
local Regtest USB campaign. Release certification still requires the independent
clean-profile recovery and release-environment rows below.

No result in this report applies to Jade Plus, QR, BLE, Mainnet, Testnet4,
Signet, a packaged release, another firmware version, or another host OS.

## Sanitized physical evidence

| Criterion                                    | Result | Evidence note                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact device and firmware recorded           | PASS   | The reviewer identified an original Jade Classic running firmware 1.0.40. No Jade Plus claim is made.                                                                                                                                                                                                                                                                      |
| Network-family mismatch fails closed         | PASS   | A PIN-saved Mainnet wallet could not authenticate for Groot Regtest. The disposable test device was reset and restored entirely on-device, then configured for Jade's Testnet family. No recovery material entered Groot or this record.                                                                                                                                   |
| Direct USB login without companion ownership | PASS   | With the Blockstream companion app fully quit and phone Bluetooth disabled, Jade accepted its PIN on-device and became ready directly over USB.                                                                                                                                                                                                                            |
| Locked/canceled login is actionable          | PASS   | An explicit on-device PIN cancellation remained locked and produced sanitized retry guidance instead of a raw Jade/HWI error.                                                                                                                                                                                                                                              |
| Disconnect, reconnect, and rescan            | PASS   | Disconnect ended the serial session without relying on battery shutdown. Reconnect and a fresh on-device PIN login returned the same signer to ready state.                                                                                                                                                                                                                |
| BIP84 test-chain account import              | PASS   | Groot imported only the public account at `m/84'/1'/0'`, created a watch-only external-signer wallet, and retained no hardware credential or private descriptor.                                                                                                                                                                                                           |
| Signer identity review                       | PASS   | The reviewer privately matched Groot's shortened identity to Jade's eight-character on-device wallet ID before accepting the import. No identifier is retained here.                                                                                                                                                                                                       |
| Permanent receive label and trusted display  | PASS   | Groot created the first permanently labeled external receive address, requested display through Jade, and persisted verification only after the reviewer compared and approved the complete device address.                                                                                                                                                                |
| Funded receive and sync                      | PASS   | The verified address received 100,000 disposable Regtest sats. Groot synced the mined payment with the correct permanent label and confirmation history.                                                                                                                                                                                                                   |
| Authoritative payment review                 | PASS   | Groot built a 25,000-sat payment and presented the recipient, label, network, 281-sat fee, total, funding coin, wallet-owned change, and derivation details for review.                                                                                                                                                                                                    |
| User rejection is non-mutating               | PASS   | The first Jade signing request was rejected on-device. Groot reported cancellation, retained the exact proposal for retry, kept progress at zero of one, and broadcast nothing.                                                                                                                                                                                            |
| Retry signs for the expected signer          | PASS   | A fresh scan of the unchanged proposal returned exactly one verified Jade signature. Groot repeated the signed transaction review before accepting the separate Groot app PIN.                                                                                                                                                                                             |
| Broadcast, confirmation, and accounting      | PASS   | Groot finalized only after the signature and app PIN, broadcast successfully, synced one confirmation, and distinguished the 25,000-sat outgoing payment, 281-sat fee, and 74,719-sat wallet-owned change.                                                                                                                                                                 |
| Full process restart without Jade            | PASS   | After a native app quit and relaunch with Jade disconnected, the Groot app PIN restored the hardware-wallet profile, balance, permanent labels, confirmations, receive-verification evidence, coin provenance/change lineage, and signer settings.                                                                                                                         |
| BIP48 2-of-3 account import and policy proof | PASS   | Groot imported Jade's public BIP48 account at `m/48'/1'/0'/2'`, registered the 2-of-3 policy, matched the first multisig address returned by Jade, and persisted descriptor-bound policy evidence. The independently certified BitBox02 cosigner completed the same policy proof after the reviewer supplied a new device-local account name.                              |
| BIP48 funded receive and sync                | PASS   | The Jade-verified first multisig address received 100,000 disposable Regtest sats and synced with one confirmation and its permanent label.                                                                                                                                                                                                                                |
| BIP48 Jade rejection and unchanged retry     | PASS   | The first Jade signature request was rejected on-device. Groot retained the exact 25,000-sat proposal at zero of two signatures and accepted Jade's signature only after a fresh approval of the unchanged transaction.                                                                                                                                                    |
| BIP48 threshold completion                   | PASS   | Groot verified one Jade signature and one BitBox02 signature for the same PSBT, reached the required two-of-three threshold, and retained the unused Trezor cosigner without requiring it.                                                                                                                                                                                 |
| BIP48 broadcast and accounting               | PASS   | Bitcoin Core accepted the finalized transaction. A mined block confirmed exactly 25,000 sats to the intended recipient and 74,622 sats to the wallet-owned multisig change output, implying the reviewed 378-sat fee.                                                                                                                                                      |
| Partial signature survives process restart   | PASS   | A separate proposal retained Jade's verified one-of-two signature across a full native app close, relaunch, wallet unlock, and exact-proposal resume.                                                                                                                                                                                                                      |
| Cable interruption and retry                 | PASS   | Interrupting Jade during the signing attempt produced no signature and left the proposal unchanged; reconnecting and approving a fresh attempt added the expected Jade signature.                                                                                                                                                                                          |
| Duplicate signed PSBT is non-mutating        | PASS   | Re-importing a PSBT from the already-counted Jade signer returned the explicit no-new-signatures rejection and preserved one-of-two progress.                                                                                                                                                                                                                              |
| Foreign proposal PSBT is non-mutating        | PASS   | A signed PSBT produced for a different reviewed proposal failed the unsigned-transaction binding check and left the active proposal at zero signatures.                                                                                                                                                                                                                    |
| Wrong physical signer fails closed           | PASS   | A connected Coldcard whose fingerprint was not in this policy was rejected as not matching any saved signer and collected no signature.                                                                                                                                                                                                                                    |
| Saved-identity health check                  | PASS   | Groot read the connected Jade's fingerprint and BIP48 account key and matched both against the saved signer identity.                                                                                                                                                                                                                                                      |
| Public backup self-test                      | PASS   | The exported public descriptor backup reproduced the same first receive address in Groot's recovery test. This proves the local artifact's descriptor binding, not yet an independent clean-profile balance/history restore.                                                                                                                                               |
| Safe 3 BIP48 follow-up checkpoint            | PASS   | On 2026-08-16 with HWI 3.2.0, a new 2-of-3 policy combined the same Jade and BitBox02 families with a Trezor Safe 3 signer. Jade and BitBox02 returned the same first policy address. Bitcoin Core then confirmed 100,000 disposable Regtest sats to that address in block 241. Groot sync, Safe 3 multisig signing, and the remaining Safe 3 rows are explicitly pending. |

## Defects discovered and corrected during the campaign

1. **Unsafe/generic Jade preflight failures.** Jade protocol cancellation and
   network mismatch both collapsed into generic HWI output, and enumeration had
   no outer wall-clock bound. Enumeration now runs through a dependency-free
   30-second/output-bounded wrapper. A separate sanitizer maps cancellation and
   network mismatch to distinct actions without returning raw HWI output,
   fingerprints, or paths. Seven focused tests cover success, redaction,
   cancellation, mismatch, unknown Jade errors, malformed input, and timeout.
   Physical cancellation and normal readiness were retested through the patched
   preflight.
2. **Contradictory wallet-created/open error.** External-signer creation updated
   the trusted registry before the shell's cached selection. Overview could
   briefly query the new backend selection using the previous wallet kind and
   show both success and failure toasts. Hardware setup now refreshes the shell
   registry before navigation. The wallet created during discovery remained
   intact; focused UI and Svelte validation pass. A second physical wallet-create
   repetition remains pending before the generic no-misleading-error lifecycle
   row is closed.
3. **Send-page signer layout jump.** The form rendered before asynchronous signer
   metadata, then shifted downward when the Jade summary mounted. Send now
   reserves that region immediately with a stable, accessible loading state and
   reduced-motion handling.
4. **Single-key signing lost review context.** The complete payment review was
   visible before signing and inside the cable modal but absent from the main
   unsigned signing surface. Single-key hardware signing now keeps the same
   transaction review visible while choosing a transport and after signature,
   matching the multisig flow's security posture.
5. **BitBox02 account-name collision was presented as incomplete registration.**
   BitBox02 requires each registered multisig policy to use a device-local account
   name that is not already assigned to another policy. That name is separate from
   the Groot wallet name. Groot now explains the rule before starting, recognizes
   HWI's known collision response as a stable name-conflict error, and never
   automatically repeats the device registration flow. A new unused name completed
   the policy and first-address proof in the physical 2-of-3 setup.
6. **Dismissed PSBT imports retained rejected text.** The file input reset while
   the signed-PSBT textarea retained the previous artifact across modal reopen.
   Every import entry and dismissal path now clears the transient file contents
   and modal validation state in both single-signer and multisig flows; only the
   sanitized rejection message remains durable on the transaction page.
7. **Durable PSBT errors used cramped bare text.** Multisig transport failures
   now use the same icon, title, detail, spacing, border, and accessible alert
   treatment as hardware and modal errors instead of an unspaced form-error line.
8. **Policy review repeated a full hardware scan.** Setup already held the exact
   device path and public fingerprint returned by its bounded discovery, but
   opening Jade or BitBox policy review enumerated every HWI backend again. The
   setup flow now reuses its matched device and the cache remains valid for a
   realistic 15-minute review. Rust still reopens the exact path and verifies the
   complete saved signer identity before accepting any policy or address result.
9. **BitBox policy guidance overwhelmed the review.** The modal repeated its
   purpose, account-name warning, policy steps, and address explanation in one
   large bespoke card. It now uses the shared compact surfaces, keeps only the
   device-local unique-name rule inline, and leaves signer keys and the first
   address as the two explicit review actions.

## Automated verification attached to this checkpoint

- Hardware-preflight Node tests: 7 passed.
- Focused hardware-verification UI tests: 13 passed.
- Full `pnpm validate`: passed, including architecture, secret-surface,
  supply-chain, brand, mainnet-gate, signed-update, HWI provenance, unsigned
  release comparison, development-runtime, and production-build gates.
- Svelte diagnostics: zero errors and warnings.
- Vitest: 37 files and 149 tests passed.

## Explicitly pending

- A fresh physical wallet-creation repetition for the repaired selection-refresh
  path.
- Independent clean-flow public-descriptor recovery reproducing the first address,
  balance, and history without deleting the certified wallet.
- A deliberately malformed or same-proposal field-mutated PSBT fixture, distinct
  from the physically exercised foreign-proposal rejection, if required by the
  final release matrix.
- Jade-specific RBF/CPFP if the eventual release scope requires per-model repeats.
- Signet/Testnet4, packaged HWI, signed/notarized application, and independent
  reviewer evidence.
- Jade Plus and all QR/BLE behavior, which require separate exact-model and
  transport campaigns.

Mainnet remains disabled. This partial physical result does not change the
mainnet release gate.
