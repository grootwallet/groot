# Trezor Safe 3 physical certification — 2026-08-16 checkpoint

This sanitized review artifact records the completed portion of an ongoing
physical-device campaign. The sensitive local evidence stays gitignored. No
seed, credential, address, xpub, PSBT, device path, RPC secret, transaction
identifier, or complete fingerprint is included here.

- Device family/model: Trezor Safe 3 Bitcoin-only
- Firmware: 2.12.3
- Host OS/version: macOS 26.1 Tahoe
- Groot candidate: the commit containing this report, based on `2ff40d1`
- HWI version: 3.2.0
- Network: Regtest using Trezor's testnet address family
- Test date/reviewer: 2026-08-16 / local physical session
- Independent reviewer: pending

## Decision at this checkpoint

**BIP84 LOCAL REGTEST USB CORE CAMPAIGN PASS / FULL SAFE 3 CERTIFICATION
IN PROGRESS.**

The exact Safe 3 passed initialization and offline backup, exact-model public
BIP84 account import, first-address trusted-display verification, funded
receive, deliberate signing rejection, unchanged retry, signing, broadcast,
mining, confirmation, and accounting on Regtest. Its BIP48 public account was
also imported into a new 2-of-3 policy with the independently recorded original
Jade and BitBox02 families. The registration-capable Jade and BitBox02 both
proved the same first policy address, and Bitcoin Core confirmed 100,000
disposable Regtest sats to that address in block 241.

That BIP48 checkpoint proves descriptor construction, cosigner policy proof,
and Core-side funding only. Groot has not yet synced that funding or collected a
Safe 3 multisig signature. The remaining BIP48, negative, restart,
interruption, recovery, public-network/package, and independent-review rows
remain pending. This is not a full device or release-certification pass.

No result in this report applies to Trezor Model One, another Safe model,
another firmware version, Mainnet, Testnet4, Signet, or a packaged release.

## Sanitized physical evidence

| Criterion                                                    | Result  | Evidence note                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact device, firmware, and reviewed HWI boundary            | PASS    | The reviewer identified a Bitcoin-only Safe 3 running firmware 2.12.3. HWI 3.2.0 recognized the exact model; HWI 2.3.1's unsupported-model result is retained as a compatibility limitation, not treated as a credential failure.                                                                           |
| Initialization and offline backup                            | PASS    | Initialization and backup confirmation completed on the physical device. No recovery material entered Groot or this record.                                                                                                                                                                                 |
| BIP84 test-chain account import                              | PASS    | Groot imported only the public account for the native-SegWit test-chain origin and created a watch-only external-signer wallet.                                                                                                                                                                             |
| Public identity review                                       | LIMITED | Groot recorded the fingerprint as public signer metadata. Safe 3 does not display it during export, so no false on-device fingerprint comparison is claimed.                                                                                                                                                |
| Permanent receive label and trusted display                  | PASS    | Groot created a permanently labeled receive address and persisted verification only after the reviewer matched the complete address on Safe 3.                                                                                                                                                              |
| Funded BIP84 receive and sync                                | PASS    | The verified address received disposable Regtest funding, which Groot synced with the expected confirmation and accounting state.                                                                                                                                                                           |
| BIP84 rejection and unchanged retry                          | PASS    | The first signing request was rejected on-device. Groot retained the exact proposal without a signature or broadcast, and a fresh approval signed the unchanged proposal.                                                                                                                                   |
| BIP84 broadcast and accounting                               | PASS    | Groot finalized only after the expected Safe 3 signature, broadcast the transaction, mined it on Regtest, and synced confirmation and accounting.                                                                                                                                                           |
| BIP48 test-chain account import                              | PASS    | Groot imported the Safe 3 public account at the required native-SegWit multisig origin without importing private material.                                                                                                                                                                                  |
| BIP48 2-of-3 policy construction                             | PASS    | Groot created a new policy containing distinct Safe 3, original Jade, and original BitBox02 public signer identities. No Trezor Model One evidence was inherited.                                                                                                                                           |
| BIP48 policy and first-address proof                         | LIMITED | The registration-capable Jade and BitBox02 independently returned the same first policy address. Safe 3 has no persistent policy-registration state, so Groot correctly reports **No setup needed** rather than **Policy verified** for that signer. Safe 3 address review for this policy remains pending. |
| BIP48 funding confirmed by Bitcoin Core                      | LIMITED | Bitcoin Core confirmed 100,000 disposable Regtest sats to the proved policy address in block 241. Groot sync and wallet accounting for this funding remain pending.                                                                                                                                         |
| BIP48 saved-identity health check                            | PENDING | Reconnect Safe 3 and match the exact saved fingerprint and BIP48 account xpub through Groot's bounded health-check path.                                                                                                                                                                                    |
| BIP48 rejection, unchanged retry, and exact-signer signature | PENDING | Deliberately reject the first Safe 3 request, prove unchanged zero-of-two state, then approve a fresh attempt for the same proposal.                                                                                                                                                                        |
| BIP48 threshold, broadcast, and accounting                   | PENDING | Add one independently recorded cosigner signature, finalize only at two-of-three, broadcast, mine, and reconcile recipient, fee, and change in Groot.                                                                                                                                                       |
| Restart, interruption, and duplicate handling                | PENDING | Prove partial-signature persistence across a full app restart, USB interruption with safe retry, and non-mutating duplicate-signed-PSBT rejection.                                                                                                                                                          |
| Wrong device and hostile PSBTs                               | PENDING | Exercise the applicable wrong-identity and canonical unsigned-transaction mutation rows without changing the active proposal.                                                                                                                                                                               |
| Public backup and clean-profile recovery                     | PENDING | Reconstruct the same first address, then independently recover confirmed balance and history from the public descriptor backup.                                                                                                                                                                             |
| Public network, reviewed package, and independent review     | PENDING | Repeat the selected release scope on the public test network with the pinned packaged HWI boundary and independent reviewer sign-off.                                                                                                                                                                       |

## Known limitations and release wording

- Safe 3 does not persist a Groot wallet policy. **No setup needed** is the
  truthful signer status; it is not equivalent to **Policy verified**.
- Safe 3 can show testnet-family `tb1` encodings for Regtest outputs. Groot may
  accept the corresponding `bcrt1` address only after Rust proves that both
  decode to the identical Bitcoin output script.
- HWI 3.2.0 is the reviewed minimum for this exact model. HWI 2.3.1 reports the
  model as unsupported after device PIN entry.
- The current pass is limited to the BIP84 local Regtest USB core campaign.
  Every pending row above remains unclaimed.

Local sensitive evidence reviewed without copying identifiers: yes

Certification decision: **LIMITED — BIP84 CORE PASS / FULL DEVICE AND RELEASE
CERTIFICATION IN PROGRESS**
