# Physical hardware certification

Virtual devices prove coordinator behavior, not vendor compatibility. Run this only with disposable Regtest, Signet, or Testnet4 wallets until the mainnet checklist is approved.

## Hardware certification matrix

| Exact model | Primary transport | Credential rule | Local Regtest | Open work |
| --- | --- | --- | --- | --- |
| Coldcard Mk4, firmware 5.0.7 | HWI USB; BIP-380 policy and PSBT over Virtual Disk/microSD | PIN/passphrase remains entirely on Coldcard | **PASS — core campaign.** Cable and microSD signing, policy review, rejection, restart, interruption, wrong-proposal handling, threshold/broadcast, and shared clean-profile recovery passed. | Wrong physical device against this wallet, USB-ownership conflict, public-network/package evidence, independent review. |
| Blockstream Jade Classic, firmware 1.0.40 | HWI USB while logged in | Select wallet/passphrase on Jade; never send it through the webview | **PASS — local USB campaign.** BIP84 and BIP48 policy/address, health, rejection, restart, interruption, wrong-device, hostile-PSBT, threshold/broadcast/accounting, and local backup self-test passed. | Independent clean-profile balance/history recovery, public-network/package evidence, independent review. QR/BLE are separate transports. |
| Blockstream Jade Plus | Candidate HWI USB; QR/BLE separate | Select wallet/passphrase on Jade Plus | **NOT CERTIFIED.** Family-path implementation is not physical evidence. | Exact-model enumeration, USB/QR/BLE capability discovery, full physical campaign. No Jade Classic evidence is inherited. |
| BitBox02 Bitcoin-only, firmware 9.26.3 | HWI USB; BitBoxApp only for required first pairing; public export through BitBoxApp | Device password/pairing remains vendor-controlled | **PASS — local campaign.** BIP84 and BIP48 policy/address, rejection, interruption, restart, threshold/broadcast, wrong-device, foreign-PSBT, and independent descriptor recovery passed. | Public-network/package evidence and independent review. |
| BitBox02 Nova | Desktop USB discovery first; Whisper/BLE later | Device password remains vendor-controlled | **DISCOVERY REQUIRED / NOT CERTIFIED.** Groot does not yet claim exact-model HWI support. | Capture real HWI identity and pairing behavior, implement any required model mapping, then run USB certification. Whisper/BLE is a separate mobile security review. No BitBox02 evidence is inherited. |
| Trezor Safe 3 | HWI USB | Prefer passphrase entry on the trusted device | **NEXT / NOT CERTIFIED.** Trezor-family code paths exist, but there is no Safe 3 physical evidence. | Exact firmware/enumeration, readiness, BIP84/BIP48, policy/address, negative/restart/recovery, and release rows. No Model One evidence is inherited. |
| Other Trezor Safe models / Model T | HWI USB | Prefer passphrase entry on the trusted device | **NOT CERTIFIED.** Generic implementation is not exact-model evidence. | Independent record for every exact model/firmware. |
| Trezor Model One | HWI USB plus PIN matrix | Standard wallet requires explicit confirmation; hidden-wallet host passphrase entry is blocked | **PASS — core campaign.** Unlock, policy/review, rejection, signing, restart, threshold/broadcast, and shared recovery passed. | Recorded limitations include same-family mismatch, file/QR signing, hidden wallets, per-model acceleration, public-network/package evidence, independent review. |
| Ledger Nano S Plus | HWI USB; Bitcoin Test on test chains | Configure/select any passphrase-attached PIN only on Ledger | **PASS — core campaign.** Single-key cable, BIP48 policy/review/sign/broadcast, and shared clean-profile recovery passed. | Recorded unsupported/non-reproducible rows, public-network/package evidence, independent review. |
| Passport Core | QR or microSD only | Passphrase remains on Passport | **NOT CERTIFIED.** Offline path exists. | Physical QR/microSD interoperability and complete exact-model campaign. |
| Passport Prime | No cable claim without a documented compatible protocol | Passphrase remains on Prime | **NOT CERTIFIED.** Offline parser exists. | Protocol discovery and complete exact-model campaign. |

“Implemented” means the Groot/HWI or bounded-file path exists; it is not a physical certification claim. Record firmware, HWI version, OS, import fingerprint, first-address match, PSBT sign, broadcast, cancellation, and wrong-device rejection for every certified row.

The current campaign, updated 2026-08-15, supersedes the hardware-status statements in the dated 2026-08-08 execution snapshot. Sensitive row-level results remain in the gitignored `hardware-certification.local/` records. Completed physical checks must not be repeated unless a later code change directly affects that behavior and creates a named regression requirement.

## Local preflight

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm hardware:preflight
```

The command prints only device model and readiness. Fingerprints, xpubs, and device paths are deliberately omitted.

Detected-but-not-ready devices are not equivalent to missing devices:

- **Trezor Model One / KeepKey:** quit Trezor Suite or other companion software completely before scanning; an unlock session created by the companion app is not shared with Groot. Choose the locked device in Groot and start the scrambled PIN matrix. For every PIN digit visible in the shuffled device matrix, tap the blank Groot cell in the same spatial location; never enter the digit itself. If passphrase support is enabled, Groot may import the seed-only standard wallet only after the user explicitly confirms that choice. A hidden wallet requiring host passphrase entry remains blocked.
- **Coldcard invisible while locked:** HWI may return no device before the Coldcard exposes its USB wallet interface. Groot cannot truthfully identify a device from an empty HWI result. Sign in on Coldcard, ensure its USB port is enabled, reconnect, and scan again.
- **BitBox02:** connect and scan directly in Groot, then enter the device password when prompted. If BitBoxApp is open, quit it so Groot can use USB.
- **Ledger:** quit Ledger Live, unlock the device, and open the app matching Groot's network: **Bitcoin Test** for Regtest, Signet, or testnet; **Bitcoin** for mainnet. HWI enumeration can expose a fingerprint from either Ledger app, so Groot labels that state **Detected**, not ready; only the subsequent account-key read verifies that the network-matching app is open. A BIP48 multisig key may request on-device public-key export approval; a standard BIP84 single-key read may complete without one. Groot reopens the exact enumerated signer by fingerprint, but every Ledger model/firmware combination still requires the physical import, reconnect, wrong-device, cancellation, address, and signing evidence below.
- **Jade:** a PIN-saved wallet is bound to either Jade's production or test network family. Groot Regtest requires a **Testnet-configured** Jade; a Mainnet-configured wallet fails with actionable network-mismatch guidance. Log in directly over USB with the PIN on Jade and leave it connected. A canceled login remains locked and is reported as retryable without exposing the raw HWI code. **Temporary Signer** is the non-destructive alternative for a Mainnet-configured device, but its wallet is forgotten on logout or reboot.
- **Coldcard:** unlock and enable USB communication.

For an already-paired BitBox02, connect it and scan directly in Groot; enter the device password when prompted. Use BitBoxApp only when Groot explicitly reports that first-time pairing is required, then quit it and rescan after pairing.

Start Bitcoin Core regtest and Groot in separate terminals:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm regtest:start
```

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
bash scripts/dev/tauri-regtest.sh
```

## Per-device acceptance story

### Completed checkpoint — BitBox02

On 2026-08-15, the original Bitcoin-only BitBox02, firmware 9.26.3, passed the Regtest receive-address comparison and an independent BIP48 2-of-3 flow: account-key import, policy registration, first-address review, explicit signing rejection with a retryable unchanged proposal, successful retry, one-signature restart persistence, threshold completion with Trezor Model One, and broadcast. It then passed wrong-device rejection without collecting a signature, USB interruption during signing with a clean retry, rejection of a signed PSBT from another proposal without changing signatures, and an independent BSMS descriptor-recovery test reproducing the same first receive address. The sanitized host record is macOS 26.1 Tahoe with HWI 2.3.1, tested 2026-08-15 in Europe/Andorra (UTC+2). This evidence applies only to the original Bitcoin-only BitBox02; it does not cover Nova. Do not publish addresses, fingerprints, xpubs, PSBTs, or device paths.

### Completed BIP84 checkpoint — Blockstream Jade

The exact physical target is an original Blockstream Jade, firmware 1.0.40, on macOS 26.1 Tahoe with HWI 2.3.1 and Regtest. Its lifecycle and complete funded BIP84 USB flow passed. Its funded BIP48 2-of-3 flow also passed policy/address proof, rejection/retry, partial-signature restart, interruption/retry, duplicate and foreign PSBT rejection, wrong-device rejection, saved-identity health, threshold completion, broadcast/accounting, and local backup self-test. The sanitized evidence and defects corrected during the run are in [`hardware-certification-jade-2026-08-15.md`](hardware-certification-jade-2026-08-15.md). This completes the local Regtest USB campaign; release certification remains in progress until independent clean-profile recovery and release-environment rows pass. This campaign does not certify Jade Plus, QR, or BLE.

Record only vendor/model, firmware, host OS, HWI version, date, and pass/fail/limitation. Keep the report under `hardware-certification.local/`, which is gitignored.

1. Use a device that is already initialized with a seed and offline backup. Connect and unlock it; keep it ready over USB (and open its Bitcoin app when that vendor requires one). Groot must never initialize a signer or request its seed.
2. Create a 2-of-3 wallet and import its BIP48 public account key through HWI.
3. Confirm the on-device fingerprint matches the locally saved record.
4. Disconnect/reconnect and run the health check. Confirm Groot reads the connected device's BIP48 account xpub and matches both the full key and fingerprint against the saved signer, including when that signer was originally imported by file, QR, or manual entry.
5. Generate a labeled receive address and verify it on-device where supported.
6. Fund it on regtest and prepare a PSBT.
7. Reject signing once; confirm Groot remains retryable and records no signature.
8. Sign the unchanged PSBT; confirm exactly that signer advances.
9. Connect a different device and confirm identity mismatch fails closed.
10. Import a PSBT with changed recipient, amount, input, sighash, origin, or final scripts; every mutation must fail.
11. Complete the threshold with an independent signer, broadcast, mine, restart, and verify proposal/history state.
12. Export the descriptor backup and reconstruct the same first receive address independently.

Repeat for every model intended for release. The current implementation has explicit readiness handling for Coldcard, Trezor/KeepKey, Ledger, BitBox02, and Jade; this is code-path coverage, not physical compatibility evidence. The named first-release targets are Coldcard Mk4, Trezor Model One, Ledger Nano S Plus, original BitBox02, and original Jade. Trezor Safe 3 is the next independent certification target after Jade and must not inherit Model One results. Jade Plus and BitBox02 Nova likewise require exact-model records; neither may inherit a same-family result. BitBox02 Nova discovery must capture its real HWI enumeration, pairing cache, xpub, display, multisig registration, and signing behavior first. Whisper/BLE requires a separate authenticated-transport and mobile lifecycle review. Legacy Digital BitBox and any HWI model not listed here remain unsupported until they receive their own row and physical report. Vendor-specific policy-registration/address-display limitations must be visible in the UI and release notes; they must never be represented as successful verification.

## Mounted SD-card public-key story

1. Export only the test-chain public multisig record from the signer. Never export or select a seed, mnemonic, xprv, tprv, or private descriptor.
2. In **Add a cosigner**, choose **Import public-key file** and select the JSON file from the mounted card.
3. Groot must reject files over 256 KiB, private/recovery fields, extended private keys, malformed fingerprints, non-test-chain tpubs, and any origin other than `m/48'/1'/0'/2'`.
4. Confirm the imported fingerprint and complete account tpub against the hardware device or an independently trusted export.
5. Complete preview/create so Rust parses the tpub and descriptor; a presentation-only import is not acceptance evidence.

Groot JSON (`fingerprint`, `accountXpub`, `derivationPath`, optional `label`) and compatible Coldcard-style JSON (`xfp`, `p2wsh`, `p2wsh_deriv`) are currently parsed. Other vendor formats require captured disposable test vectors and a dedicated parser before they may appear in the UI.

## QR status

Groot now implements bounded Blockchain Commons UR v2 `crypto-psbt` animation and camera ingestion. Rust enforces payload, fragment, frame-size, frame-count, duplicate, and out-of-order constraints; Apple camera permission copy is packaged. This is **not yet platform-certified**. Each supported desktop/mobile target still needs camera permission, denial/retry, interruption, malicious frame, vendor-vector, and complete offline signing evidence. File/text fallback remains mandatory wherever the system webview cannot decode QR symbols.

Use [`hardware-certification-template.md`](hardware-certification-template.md) for every sensitive local device/model/firmware/host record. After the record is complete, use [`hardware-certification-summary-template.md`](hardware-certification-summary-template.md) to create the sanitized review artifact attached to the candidate commit. Original Jade is a required pre-mainnet row alongside Coldcard Mk4, Trezor Model One, Ledger Nano S Plus, and original BitBox02. Jade Plus and BitBox02 Nova require separate exact-model evidence; Nova becomes a release row only after its transport implementation lands and remains a roadmap item rather than an alias of BitBox02.
