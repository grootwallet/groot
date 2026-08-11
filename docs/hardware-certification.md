# Physical hardware certification

Virtual devices prove coordinator behavior, not vendor compatibility. Run this only with disposable Regtest, Signet, or Testnet4 wallets until the mainnet checklist is approved.

## External single-key transport matrix

| Signer | Cable account/sign | Offline public import | Hardware passphrase rule | Status |
| --- | --- | --- | --- | --- |
| Blockstream Jade / Jade Plus | HWI USB when logged in | BIP84 xpub/descriptor QR text; file where exported | Select hidden wallet on Jade; never sent through the webview | Implemented, physical certification pending |
| BitBox02 | HWI USB after BitBoxApp pairing cache; companion app must release USB | BitBoxApp descriptor/xpub file/text | Device password/pairing stays vendor-controlled | Implemented, physical certification pending |
| BitBox02 Nova | USB candidate; exact HWI identity and pairing behavior must be captured first | Vendor descriptor/xpub export candidate | Device password remains vendor-controlled; Whisper/BLE is a separate mobile transport review | Not yet supported or certified |
| Trezor Safe / Model T | HWI USB | Public descriptor/xpub text/file | Prefer on-device passphrase entry | Implemented, physical certification pending |
| Trezor Model One | HWI USB + PIN matrix | Public descriptor/xpub text/file | Standard wallet requires explicit confirmation; host entry for hidden-wallet passphrases remains blocked | Limited for hidden wallets; standard wallet implemented |
| Ledger | HWI USB with Bitcoin Test open on test chains; Bitcoin on mainnet | Public descriptor/xpub text/file | Select passphrase-attached PIN on Ledger before connecting | Implemented, physical certification pending |
| Passport Core | No USB data | QR or microSD descriptor/xpub and PSBT | Passphrase remains on Passport | Offline path implemented; physical camera interoperability pending |
| Passport Prime | No cable claim without a documented compatible protocol | Descriptor/xpub and PSBT files/QR where exported | Passphrase remains on Prime | Offline parser implemented; protocol certification pending |

“Implemented” means the Groot/HWI or bounded-file path exists; it is not a physical certification claim. Record firmware, HWI version, OS, import fingerprint, first-address match, PSBT sign, broadcast, cancellation, and wrong-device rejection for every certified row.

## Local preflight

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm hardware:preflight
```

The command prints only device model and readiness. Fingerprints, xpubs, and device paths are deliberately omitted.

Detected-but-not-ready devices are not equivalent to missing devices:

- **Trezor Model One / KeepKey:** quit Trezor Suite or other companion software completely before scanning; an unlock session created by the companion app is not shared with Groot. Choose the locked device in Groot and start the scrambled PIN matrix. For every PIN digit visible in the shuffled device matrix, tap the blank Groot cell in the same spatial location; never enter the digit itself. If passphrase support is enabled, Groot may import the seed-only standard wallet only after the user explicitly confirms that choice. A hidden wallet requiring host passphrase entry remains blocked.
- **Coldcard invisible while locked:** HWI may return no device before the Coldcard exposes its USB wallet interface. Groot cannot truthfully identify a device from an empty HWI result. Sign in on Coldcard, ensure its USB port is enabled, reconnect, and scan again.
- **BitBox02:** finish the pairing and unlock story below.
- **Ledger:** quit Ledger Live, unlock the device, and open the app matching Groot's network: **Bitcoin Test** for Regtest, Signet, or testnet; **Bitcoin** for mainnet. HWI enumeration can expose a fingerprint from either Ledger app, so Groot labels that state **Detected**, not ready; only the subsequent account-key read verifies that the network-matching app is open. A BIP48 multisig key may request on-device public-key export approval; a standard BIP84 single-key read may complete without one. Groot reopens the exact enumerated signer by fingerprint, but every Ledger model/firmware combination still requires the physical import, reconnect, wrong-device, cancellation, address, and signing evidence below.
- **Jade:** log in on-device with Recovery Phrase Login or QR PIN Unlock, then leave it connected.
- **Coldcard:** unlock and enable USB communication.

For BitBox02, first open BitBoxApp, enter the device password, compare and confirm the pairing code on both screens, and wait until the wallet itself is visible; “See the BitBoxApp” is not the ready state. Then quit BitBoxApp completely, reconnect if needed, and rerun the preflight. HWI-based apps cannot initiate this first pairing themselves.

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

Record only vendor/model, firmware, host OS, HWI version, date, and pass/fail/limitation. Keep the report under `hardware-certification.local/`, which is gitignored.

1. Use a device that is already initialized with a seed and offline backup. Connect and unlock it; keep it ready over USB (and open its Bitcoin app when that vendor requires one). Groot must never initialize a signer or request its seed.
2. Create a 2-of-3 vault and import its BIP48 public account key through HWI.
3. Confirm the on-device fingerprint matches the locally saved record.
4. Disconnect/reconnect and run the health check.
5. Generate a labeled receive address and verify it on-device where supported.
6. Fund it on regtest and prepare a PSBT.
7. Reject signing once; confirm Groot remains retryable and records no signature.
8. Sign the unchanged PSBT; confirm exactly that signer advances.
9. Connect a different device and confirm identity mismatch fails closed.
10. Import a PSBT with changed recipient, amount, input, sighash, origin, or final scripts; every mutation must fail.
11. Complete the threshold with an independent signer, broadcast, mine, restart, and verify proposal/history state.
12. Export the descriptor backup and reconstruct the same first receive address independently.

Repeat for every model intended for release. The current implementation has explicit readiness handling for Coldcard, Trezor/KeepKey, Ledger, BitBox02, and Jade; this is code-path coverage, not physical compatibility evidence. The named first-release targets are Coldcard Mk4, Trezor Model One, Ledger, original BitBox02, and Jade/Jade Plus. BitBox02 Nova must not be inferred from the original BitBox02 device type: capture its real HWI enumeration, pairing cache, xpub, display, multisig registration, and signing behavior first. Whisper/BLE requires a separate authenticated-transport and mobile lifecycle review. Legacy Digital BitBox and any HWI model not listed here remain unsupported until they receive their own row and physical report. Vendor-specific policy-registration/address-display limitations must be visible in the UI and release notes; they must never be represented as successful verification.

## Mounted SD-card public-key story

1. Export only the test-chain public multisig record from the signer. Never export or select a seed, mnemonic, xprv, tprv, or private descriptor.
2. In **Add a cosigner**, choose **Import public-key file** and select the JSON file from the mounted card.
3. Groot must reject files over 256 KiB, private/recovery fields, extended private keys, malformed fingerprints, non-test-chain tpubs, and any origin other than `m/48'/1'/0'/2'`.
4. Confirm the imported fingerprint and complete account tpub against the hardware device or an independently trusted export.
5. Complete preview/create so Rust parses the tpub and descriptor; a presentation-only import is not acceptance evidence.

Groot JSON (`fingerprint`, `accountXpub`, `derivationPath`, optional `label`) and compatible Coldcard-style JSON (`xfp`, `p2wsh`, `p2wsh_deriv`) are currently parsed. Other vendor formats require captured disposable test vectors and a dedicated parser before they may appear in the UI.

## QR status

Groot now implements bounded Blockchain Commons UR v2 `crypto-psbt` animation and camera ingestion. Rust enforces payload, fragment, frame-size, frame-count, duplicate, and out-of-order constraints; Apple camera permission copy is packaged. This is **not yet platform-certified**. Each supported desktop/mobile target still needs camera permission, denial/retry, interruption, malicious frame, vendor-vector, and complete offline signing evidence. File/text fallback remains mandatory wherever the system webview cannot decode QR symbols.

Use [`hardware-certification-template.md`](hardware-certification-template.md) for every sensitive local device/model/firmware/host record. After the record is complete, use [`hardware-certification-summary-template.md`](hardware-certification-summary-template.md) to create the sanitized review artifact attached to the candidate commit. Jade is a required pre-mainnet row alongside Coldcard, Trezor, Ledger, and BitBox02. BitBox02 Nova becomes a release row only after its transport implementation lands; until then it remains an explicit roadmap item rather than an alias of BitBox02.
