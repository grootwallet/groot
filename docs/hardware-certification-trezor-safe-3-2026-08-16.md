# Trezor Safe 3 physical certification — 2026-08-16 checkpoint

This sanitized review artifact records the completed portion of an ongoing
physical-device campaign. The sensitive local evidence stays gitignored. No
seed, credential, address, xpub, PSBT, device path, RPC secret, transaction
identifier, or complete fingerprint is included here.

- Device family/model: Trezor Safe 3 Bitcoin-only
- Firmware: 2.12.3
- Host OS/version: macOS 26.1 Tahoe
- Groot candidate: the commit containing this report, based on `6e8f5cf`
- HWI version: 3.2.0
- Network: Regtest using Trezor's testnet address family
- Test date/reviewer: 2026-08-16 / local physical session
- Independent reviewer: pending

## Decision at this checkpoint

**LOCAL REGTEST USB AND CLEAN-PROFILE RECOVERY PASS / RELEASE CERTIFICATION IN
PROGRESS.**

The exact Trezor Safe 3 passed initialization and offline backup, exact-model public
BIP84 account import, first-address trusted-display verification, funded
receive, deliberate signing rejection, unchanged retry, signing, broadcast,
mining, confirmation, and accounting on Regtest. Its BIP48 public account was
also imported into a new 2-of-3 policy with the independently recorded original
Jade and BitBox02 families. The registration-capable Jade and BitBox02 both
proved the same first policy address, and Bitcoin Core confirmed 100,000
disposable Regtest sats to that address in block 241.

That BIP48 checkpoint now also proves Groot sync, the expected confirmed
100,000-sat accounting state, and supported recovery of the first permanent
label for the externally funded descriptor-derived receive output. The reviewer
also completed a trusted-display BIP48 receive-address comparison, deliberate
first multisig signing rejection, unchanged retry, and Trezor Safe 3
signature. An independently recorded original BitBox02 supplied the second
signature. Groot finalized only at two-of-three, broadcast the reviewed
6,000-sat payment with a 378-sat fee, mined it, and reconciled the confirmed
93,622-sat change and remaining balance with zero pending.

Earlier original Jade approvals were rejected because vendor-normalized public
PSBT metadata differed from Groot's canonical copy. Those attempts remain
invalid evidence and changed neither signatures nor reviewed proposal state.
After Groot was corrected to project and verify only returned signatures on its
untouched canonical PSBT, the original Blockstream Jade physically passed an
unchanged fresh 3,000-sat proposal: Groot accepted exactly one valid signature
and displayed 1 of 2 collected. No threshold completion or broadcast occurred,
and that partially signed proposal then survived a full Groot quit and relaunch
with every reviewed transaction field unchanged. Groot also rejected the
already-counted signed PSBT, a signed PSBT from an unrelated proposal, and a
Trezor Model One that was not part of the policy without changing the accepted
signature or broadcasting. A bounded one-satoshi unsigned-transaction mutation
was likewise rejected without changing authoritative state. The reviewer then
disconnected Trezor Safe 3 during transaction review, observed a sanitized
failure with the original Jade still alone at 1 of 2, reconnected the same Safe
3, and approved the exact unchanged proposal. Groot recorded Safe 3 as the
second distinct signer at 2 of 2 while leaving the proposal saved and
unbroadcast.

A separate empty Groot profile accepted the private local copy of the public
Groot JSON backup, reproduced the same first receive address, and completed a
full Regtest rescan. It independently recovered 93,622 sats total, zero pending,
the confirmed 100,000-sat receive, and the confirmed 6,000-sat send. The saved
unbroadcast proposal was correctly absent because public descriptor recovery
does not restore pending coordinator state. Only public-network/package and
independent-review rows remain pending. This is not a full release-certification
pass.

No result in this report applies to Trezor Model One, another Safe model,
another firmware version, Mainnet, Testnet4, Signet, or a packaged release.

## Sanitized physical evidence

| Criterion                                                           | Result  | Evidence note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact device, firmware, and reviewed HWI boundary                   | PASS    | The reviewer identified a Bitcoin-only Trezor Safe 3 running firmware 2.12.3. HWI 3.2.0 recognized the exact model; HWI 2.3.1's unsupported-model result is retained as a compatibility limitation, not treated as a credential failure.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Initialization and offline backup                                   | PASS    | Initialization and backup confirmation completed on the physical device. No recovery material entered Groot or this record.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| BIP84 test-chain account import                                     | PASS    | Groot imported only the public account for the native-SegWit test-chain origin and created a watch-only external-signer wallet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Public identity review                                              | LIMITED | Groot recorded the fingerprint as public signer metadata. Trezor Safe 3 does not display it during export, so no false on-device fingerprint comparison is claimed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Permanent receive label and trusted display                         | PASS    | Groot created a permanently labeled receive address and persisted verification only after the reviewer matched the complete address on Trezor Safe 3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Funded BIP84 receive and sync                                       | PASS    | The verified address received disposable Regtest funding, which Groot synced with the expected confirmation and accounting state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| BIP84 rejection and unchanged retry                                 | PASS    | The first signing request was rejected on-device. Groot retained the exact proposal without a signature or broadcast, and a fresh approval signed the unchanged proposal.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| BIP84 broadcast and accounting                                      | PASS    | Groot finalized only after the expected Trezor Safe 3 signature, broadcast the transaction, mined it on Regtest, and synced confirmation and accounting.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| BIP48 test-chain account import                                     | PASS    | Groot imported the Trezor Safe 3 public account at the required native-SegWit multisig origin without importing private material.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| BIP48 2-of-3 policy construction                                    | PASS    | Groot created a new policy containing distinct Trezor Safe 3, original Jade, and original BitBox02 public signer identities. No Trezor Model One evidence was inherited.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| BIP48 policy and first-address proof                                | LIMITED | The registration-capable Jade and BitBox02 independently returned the same first policy address. Trezor Safe 3 has no persistent policy-registration state, so Groot correctly reports **No setup needed** rather than **Policy verified** for that signer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| BIP48 funding, Groot sync, permanent label, history, and accounting | PASS    | Bitcoin Core confirmed 100,000 disposable Regtest sats to the descriptor-derived policy-verification address in block 241. Groot subsequently showed 100,000 sats total, zero pending, an updated-now state, and one confirmed +100,000-sat receive with two confirmations. Transaction and coin details initially and truthfully showed **Received** / **Unknown source** because the address was funded outside Groot's labeled Receive flow. The supported exact-output recovery action then accepted one reviewer-chosen permanent label, rematerialized known receive provenance, and displayed the label on the coin row and in details. No database edit or fabricated provenance was used.                                      |
| BIP48 saved-identity health check                                   | PASS    | Groot's bounded signer-specific health check matched the connected physical Trezor Safe 3 to its saved BIP48 account identity. Trezor Safe 3 does not display its fingerprint, so no on-device fingerprint comparison is claimed. The earlier broad-discovery attempt that prompted another attached signer remains invalid evidence.                                                                                                                                                                                                                                                                                                                                                                                                   |
| BIP48 receive-address review on Trezor Safe 3                       | PASS    | The reviewer compared the complete multisig receive address on the physical Trezor Safe 3, and Groot persisted address-specific hardware verification. No address or signer identifier is retained in this report.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| BIP48 rejection, unchanged retry, and exact-signer signature        | PASS    | The reviewer deliberately rejected the first Trezor Safe 3 signing request and Groot returned a sanitized cancellation while retaining the reviewed proposal. The unchanged retry was then approved on the physical Trezor Safe 3 and Groot accepted exactly one valid signature. A nested address-detail overlay initially obscured the rejection until manually closed; Groot now closes signing-detail overlays on every terminal hardware result.                                                                                                                                                                                                                                                                                   |
| BIP48 threshold, broadcast, and accounting                          | PASS    | The independently recorded original BitBox02 supplied the second signature. Groot finalized only at two-of-three, broadcast the reviewed 6,000-sat payment with a 378-sat fee, mined it, synced one confirmation, and reconciled 93,622 sats of change and remaining balance with zero pending. Earlier original Jade approvals rejected by the former direct-HWI comparison remain invalid evidence. A separate unchanged fresh 3,000-sat proposal subsequently passed the corrected original Blockstream Jade path with exactly one accepted signature and 1 of 2 collected; it was not finalized or broadcast and is reserved for restart testing.                                                                                   |
| Partial-signature process restart                                   | PASS    | After a full Groot quit and relaunch of the same saved Regtest profile, the unchanged 3,000-sat proposal resumed with the same recipient, amount, fee, change, network, derivation information, inputs, outputs, locktime/RBF, and 2-of-3 policy. Exactly the original Blockstream Jade signature remained at 1 of 2, the proposal remained retryable, and nothing was broadcast.                                                                                                                                                                                                                                                                                                                                                       |
| Duplicate signed PSBT                                               | PASS    | Reapplying the PSBT containing the already-counted original Blockstream Jade signature returned the explicit already-signed/no-change rejection. Signature progress remained 1 of 2 and the proposal was not mutated or broadcast.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Foreign proposal                                                    | PASS    | Importing a genuine signed PSBT from an unrelated earlier proposal failed the reviewed-transaction binding check. The active proposal, accepted signer, 1-of-2 progress, and broadcast state were unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Wrong device                                                        | PASS    | A connected Trezor Model One that was not one of this wallet's saved signers was rejected with an explicit identity mismatch before it could sign. The active Trezor Safe 3 campaign inherited no Model One evidence; proposal state remained unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| USB interruption and safe retry                                     | PASS    | The reviewer disconnected Trezor Safe 3 while its physical transaction review was visible and before approving or rejecting. Groot returned a sanitized hardware-request failure; the original Blockstream Jade remained the sole accepted signer at 1 of 2 and nothing was broadcast. After reconnecting and unlocking the same Safe 3, the reviewer approved the exact unchanged proposal. Groot accepted Safe 3 as the second distinct signer at 2 of 2 and retained the fully signed proposal without finalizing or broadcasting it. This check also exposed a narrow-layout PSBT-action defect; the grid now uses a card-aware three/two/one-column layout with single-line labels and focused desktop/mobile regression coverage. |
| Hostile PSBTs                                                       | PASS    | A bounded local fixture changed one transaction output value by exactly one satoshi while leaving the saved source untouched. Groot rejected the changed unsigned transaction against the reviewed proposal; the original Blockstream Jade remained the sole accepted signer at 1 of 2, with no proposal mutation or broadcast.                                                                                                                                                                                                                                                                                                                                                                                                         |
| Public backup and clean-profile recovery                            | PASS    | A Groot JSON public backup was saved locally and kept private. A separate empty application profile validated it, reproduced the same first receive address, created the watch-only policy under a new local app PIN, and completed a full Regtest rescan. The recovered profile independently showed 93,622 sats total, zero pending, the confirmed 100,000-sat receive, and the confirmed 6,000-sat send. The unbroadcast proposal was not restored, as expected for public descriptor recovery. No original profile data was copied or edited.                                                                                                                                                                                       |
| Public network, reviewed package, and independent review            | PENDING | Repeat the selected release scope on the public test network with the pinned packaged HWI boundary and independent reviewer sign-off.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

The first BIP48 health-check attempt on 2026-08-16 is not accepted as
certification evidence. With Trezor Safe 3 and an original Jade connected, the
then-current broad HWI discovery prompted Jade before Groot eventually matched
the saved Trezor Safe 3 identity. That attempt remains invalid. After Groot
scoped signer-specific discovery by saved device type, the physical health
check was repeated with both devices attached, matched the saved Trezor Safe 3
identity, and required no Jade interaction; that later attempt is the pass
recorded above.

## Known limitations and release wording

- Trezor Safe 3 does not persist a Groot wallet policy. **No setup needed** is the
  truthful signer status; it is not equivalent to **Policy verified**.
- Trezor Safe 3 can show testnet-family `tb1` encodings for Regtest outputs. Groot may
  accept the corresponding `bcrt1` address only after Rust proves that both
  decode to the identical Bitcoin output script.
- HWI 3.2.0 is the reviewed minimum for this exact model. HWI 2.3.1 reports the
  model as unsupported after device PIN entry.
- The local Regtest USB and clean-profile recovery campaign is complete. The
  public-network/package and independent-review row remains unclaimed.

## Packaged v0.4.83 Testnet4 setup checkpoint — 2026-08-31

On the exact packaged Testnet4 candidate at short commit `12cf1714`, the reviewer
reported a successful Trezor Safe 3 BIP48 public-account import into a new
standard multisig policy. After that wallet was created offline, the bounded
saved-identity health check matched the connected physical Safe 3. Groot
correctly showed **No setup needed** for wallet policy because Safe 3 receives
the complete policy on each request and does not persist Groot registration
state. This evidence does not inherit any Regtest transaction row.

The wallet has never synced. No trusted receive display, funding, payment
review, rejection/retry, signature, disconnect/wrong-device behavior,
acceleration, recovery, restart, threshold, or broadcast is claimed for
Testnet4. The first coordinator creation attempt also exposed a product defect
when a preselected network-setup source was no longer unlocked; the later
offline creation does not convert that failure into a pass. Screenshots that
contained public signer identifiers and node details were excluded. No address,
transaction identifier, fingerprint, account key, descriptor, PSBT, device path,
credential, or RPC detail is retained.

Independent review is deferred until all Testnet4 hardware-device campaigns are
finalized; this row is neither passed nor failed.

## Packaged v0.4.84 Testnet4 BIP84 checkpoint — 2026-08-31

On the locally ad-hoc-signed Testnet4 package at commit `8ff4e7da`, the reviewer
created a new Safe 3 BIP84 wallet, completed its first history scan, verified a
permanently labeled receive address on the exact device, and confirmed that the
wallet and its verified zero-balance state persisted over a complete Groot quit
and relaunch. The saved public descriptor export and BIP329 label export also
completed. These observations close only the named BIP84 import/sync,
trusted-display, restart-persistence, and public-export rows; they do not imply a
payment, signature, rejection, acceleration, or broadcast pass.

A later explicit full wallet rescan from a recent birthday failed. Ordinary sync
continued to work and the last verified wallet state remained available, so this
is recorded as a v0.4.84 recovery-scan defect rather than a Safe 3 hardware
failure. The defect requires a fixed packaged-candidate retest before the
Testnet4 recovery row can close.

Screenshots that exposed a public receive address were excluded from retained
evidence. No address, transaction identifier, fingerprint, account key,
descriptor, PSBT, device path, credential, RPC detail, or label is retained.

## Packaged v0.4.85 Testnet4 funded BIP48 checkpoint — 2026-08-31

On the locally ad-hoc-signed Testnet4 package at commit `5ba40001`, the existing
multisig coordinator synchronized after the active-chain checkpoint repair. The
exact Safe 3 and a BitBox02 Nova independently displayed and matched the same
newly revealed multisig receive address, and the first disposable deposit was
then observed by the wallet.

For one reviewed self-transfer, Safe 3 and Nova independently supplied the two
required signatures. Safe 3 first passed both an explicit on-device rejection
and a cable-interruption retry without changing the proposal or its signature
count. The campaign also passed local signature discard and restoration through
signed-PSBT import, threshold finalization, Bitcoin Core broadcast, and
self-transfer fee-only accounting. These observations close only the named
packaged BIP48 rows; they do not inherit or close Safe 3's still-open BIP84
funded-signing and full-rescan rows.

The subsequent RBF quote failed before replacement construction or any Safe 3
interaction because v0.4.85 requested Core's incremental-relay policy through
an RPC method absent from the canonical least-privilege configuration. This is
an application/RPC-method defect, not a Safe 3 failure and not evidence that an
only-coin self-transfer is inherently non-replaceable. The packaged acceleration
row remains open.

The record relies on sanitized written observations. Submitted screenshots
exposed public wallet, signer, or transaction metadata and were excluded. No
address, transaction identifier, fingerprint, account key, descriptor, PSBT,
device path, credential, RPC detail, amount, or label is retained.

## Packaged v0.4.88 Testnet4 funded BIP84 and shared BIP48 checkpoint

On the locally ad-hoc-signed Testnet4 package at exact commit `4fcd5f27`, Safe 3
passed funded BIP84 transaction review, signing, and broadcast, followed by
wrong-device rejection. In the shared BIP48 policy Groot truthfully displayed
**No setup needed** for Safe 3; it did not claim persistent policy registration.

Safe 3 and BitBox02 Nova independently displayed and matched the same BIP48
receive address. A real Testnet4 deposit synchronized, and the two devices
supplied the required signatures for a real 2-of-3 spend. Threshold
finalization, broadcast, confirmation, complete app restart, and accounting
passed. A genuinely empty profile then imported the public descriptor/backup
and reproduced the expected wallet state.

The descriptor/public-backup recovery is recorded as the packaged BIP48
clean-profile recovery pass because it matches that worksheet definition. The
different clean-profile recovery procedure the reviewer explicitly deferred
remains open, as does the independent tester/reviewer run. The BIP84
full-history scan also remains open: the next candidate-bound action is to
repeat it on exact v0.4.89 with Bitcoin Core fully synchronized. Nothing in
this checkpoint certifies the v0.4.89 rescan fix or later send-review UX.

Local sensitive evidence reviewed without copying identifiers: yes

Certification decision: **LIMITED — LOCAL REGTEST AND RECOVERY PASS / RELEASE
CERTIFICATION IN PROGRESS**
