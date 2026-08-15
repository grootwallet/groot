# Physical hardware certification

Virtual devices prove coordinator behavior, not vendor compatibility. Run this only with disposable Regtest, Signet, or Testnet4 wallets until the mainnet checklist is approved.

## External single-key transport matrix

| Signer | Cable account/sign | Offline public import | Hardware passphrase rule | Status |
| --- | --- | --- | --- | --- |
| Coldcard Mk4 | HWI USB after unlock and USB-wallet enablement; policy imported separately | BIP-380 policy and PSBT over Virtual Disk/microSD where supported | PIN/passphrase remains entirely on Coldcard | Core Regtest 2-of-3 cable and microSD signed-PSBT flows, genuine wrong-proposal rejection, and shared clean-profile descriptor recovery verified |
| Blockstream Jade | HWI USB when logged in | BIP84 xpub/descriptor QR text; file where exported | Select hidden wallet on Jade; never sent through the webview | Exact original Jade firmware 1.0.40 passed the complete Regtest BIP84 USB flow on macOS 26.1/HWI 2.3.1; BIP48, negative/recovery, public-network, and packaged-release rows remain pending; no result is inherited by Jade Plus |
| Blockstream Jade Plus | HWI USB candidate when logged in | BIP84 xpub/descriptor QR text; file where exported | Select hidden wallet on Jade Plus; never sent through the webview | Implemented family path, but exact-model USB/QR/BLE behavior is not physically certified |
| BitBox02 | HWI USB; direct Groot password prompt when already paired, with BitBoxApp only for an explicitly required first pairing | BitBoxApp descriptor/xpub file/text | Device password/pairing stays vendor-controlled | Original Bitcoin-only model, firmware 9.26.3: Regtest BIP84 import/receive and complete BIP48 2-of-3 policy, address, rejection, interruption/retry, signing, restart, threshold, broadcast, wrong-device, foreign-PSBT, and descriptor-recovery checks passed |
| BitBox02 Nova | USB candidate; exact HWI identity and pairing behavior must be captured first | Vendor descriptor/xpub export candidate | Device password remains vendor-controlled; Whisper/BLE is a separate mobile transport review | Not yet supported or certified |
| Trezor Safe 3 | HWI USB | Public descriptor/xpub text/file | Prefer on-device passphrase entry | Planned later as an independent certification target; no Model One evidence is inherited |
| Other Trezor Safe models / Model T | HWI USB | Public descriptor/xpub text/file | Prefer on-device passphrase entry | Implemented, physical certification pending per exact model |
| Trezor Model One | HWI USB + PIN matrix | Public descriptor/xpub text/file | Standard wallet requires explicit confirmation; host entry for hidden-wallet passphrases remains blocked | Core Regtest 2-of-3 unlock/review/reject/sign/restart/broadcast and shared recovery verified; same-family mismatch, file/QR signing, hidden wallets, and per-model acceleration explicitly limited |
| Ledger Nano S Plus | HWI USB with Bitcoin Test open on test chains; Bitcoin on mainnet | Public descriptor/xpub text/file | Select passphrase-attached PIN on Ledger before connecting | Regtest single-key cable flow, core 2-of-3 policy/review/sign/broadcast, and shared clean-profile descriptor recovery verified; unsupported/non-reproducible rows explicitly limited |
| Passport Core | No USB data | QR or microSD descriptor/xpub and PSBT | Passphrase remains on Passport | Offline path implemented; physical camera interoperability pending |
| Passport Prime | No cable claim without a documented compatible protocol | Descriptor/xpub and PSBT files/QR where exported | Passphrase remains on Prime | Offline parser implemented; protocol certification pending |

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

The exact physical target is an original Blockstream Jade, firmware 1.0.40, on macOS 26.1 Tahoe with HWI 2.3.1 and Regtest. Its lifecycle and complete funded BIP84 USB flow passed, including trusted receive display, signing rejection/retry, broadcast/accounting, and device-free process restart. The sanitized evidence and defects corrected during the run are in [`hardware-certification-jade-2026-08-15.md`](hardware-certification-jade-2026-08-15.md). Complete model certification remains in progress until the local record finishes BIP48 policy/address/signing, negative/reliability, and independent descriptor-recovery rows. This campaign does not certify Jade Plus, QR, or BLE.

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
