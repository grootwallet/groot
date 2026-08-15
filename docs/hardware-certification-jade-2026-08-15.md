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

**BIP84 USB PASS / COMPLETE JADE CERTIFICATION IN PROGRESS.** The exact original
Jade passed the lifecycle, BIP84 public-account import, trusted receive-address
display, funded rejection/retry/sign/broadcast, confirmation/accounting, and
device-free restart-persistence scope below. This is not a complete model
certification until the BIP48 2-of-3, negative/reliability, independent public
descriptor recovery, and remaining release rows are executed.

No result in this report applies to Jade Plus, QR, BLE, Mainnet, Testnet4,
Signet, a packaged release, another firmware version, or another host OS.

## Sanitized physical evidence

| Criterion | Result | Evidence note |
| --- | --- | --- |
| Exact device and firmware recorded | PASS | The reviewer identified an original Jade Classic running firmware 1.0.40. No Jade Plus claim is made. |
| Network-family mismatch fails closed | PASS | A PIN-saved Mainnet wallet could not authenticate for Groot Regtest. The disposable test device was reset and restored entirely on-device, then configured for Jade's Testnet family. No recovery material entered Groot or this record. |
| Direct USB login without companion ownership | PASS | With the Blockstream companion app fully quit and phone Bluetooth disabled, Jade accepted its PIN on-device and became ready directly over USB. |
| Locked/canceled login is actionable | PASS | An explicit on-device PIN cancellation remained locked and produced sanitized retry guidance instead of a raw Jade/HWI error. |
| Disconnect, reconnect, and rescan | PASS | Disconnect ended the serial session without relying on battery shutdown. Reconnect and a fresh on-device PIN login returned the same signer to ready state. |
| BIP84 test-chain account import | PASS | Groot imported only the public account at `m/84'/1'/0'`, created a watch-only external-signer wallet, and retained no hardware credential or private descriptor. |
| Signer identity review | PASS | The reviewer privately matched Groot's shortened identity to Jade's eight-character on-device wallet ID before accepting the import. No identifier is retained here. |
| Permanent receive label and trusted display | PASS | Groot created the first permanently labeled external receive address, requested display through Jade, and persisted verification only after the reviewer compared and approved the complete device address. |
| Funded receive and sync | PASS | The verified address received 100,000 disposable Regtest sats. Groot synced the mined payment with the correct permanent label and confirmation history. |
| Authoritative payment review | PASS | Groot built a 25,000-sat payment and presented the recipient, label, network, 281-sat fee, total, funding coin, wallet-owned change, and derivation details for review. |
| User rejection is non-mutating | PASS | The first Jade signing request was rejected on-device. Groot reported cancellation, retained the exact proposal for retry, kept progress at zero of one, and broadcast nothing. |
| Retry signs for the expected signer | PASS | A fresh scan of the unchanged proposal returned exactly one verified Jade signature. Groot repeated the signed transaction review before accepting the separate Groot app PIN. |
| Broadcast, confirmation, and accounting | PASS | Groot finalized only after the signature and app PIN, broadcast successfully, synced one confirmation, and distinguished the 25,000-sat outgoing payment, 281-sat fee, and 74,719-sat wallet-owned change. |
| Full process restart without Jade | PASS | After a native app quit and relaunch with Jade disconnected, the Groot app PIN restored the hardware-wallet profile, balance, permanent labels, confirmations, receive-verification evidence, coin provenance/change lineage, and signer settings. |

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

## Automated verification attached to this checkpoint

- Hardware-preflight Node tests: 7 passed.
- Focused hardware-verification UI tests: 8 passed.
- Full `pnpm validate`: passed, including architecture, secret-surface,
  supply-chain, brand, mainnet-gate, signed-update, HWI provenance, unsigned
  release comparison, development-runtime, and production-build gates.
- Svelte diagnostics: zero errors and warnings.
- Vitest: 35 files and 140 tests passed.

## Explicitly pending

- A fresh physical wallet-creation repetition for the repaired selection-refresh
  path.
- BIP48 `m/48'/1'/0'/2'` import in a new 2-of-3 policy with two independently
  certified signers.
- Duplicate signer rejection, policy registration, first multisig address display,
  descriptor/BSMS export, partial-signature restart, threshold completion, and
  funded multisig broadcast.
- Non-cosigner, cable-interruption, foreign/mutated PSBT, duplicate-signature,
  missing/wrong-device, and saved-identity health checks in the Jade policy.
- Independent clean-flow public-descriptor recovery reproducing the first address,
  balance, and history without deleting the certified wallet.
- Jade-specific RBF/CPFP if the eventual release scope requires per-model repeats.
- Signet/Testnet4, packaged HWI, signed/notarized application, and independent
  reviewer evidence.
- Jade Plus and all QR/BLE behavior, which require separate exact-model and
  transport campaigns.

Mainnet remains disabled. This partial physical result does not change the
mainnet release gate.
