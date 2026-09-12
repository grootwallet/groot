# Mainnet hardware checkpoint — 2026-09-12

This sanitized checkpoint records release-owner testing performed with the
internal Mainnet application shown as `Groot v0.4.94 · 27f821be`. It does not
transfer evidence to a later source commit or package. Firmware versions were
not re-reported during this checkpoint, so the release-target versions in the
canonical matrix remain targets rather than evidence for this run.

No seed, credential, fingerprint, account key, descriptor, address,
transaction identifier, or device path is retained here.

## Reported results

| Scope                                         | Result                    | Exact observation                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ledger Nano S Plus BIP48 public-key sharing   | Pass                      | The release owner reported successful Mainnet BIP48 public-account-key sharing.                                                                                                                                                                                                                                      |
| BitBox02 Nova BIP48 public-key sharing        | Pass                      | The release owner reported successful Mainnet BIP48 public-account-key sharing.                                                                                                                                                                                                                                      |
| Trezor Safe 3 public-key sharing              | Blocked                   | Groot rejected HWI's hardware record before PIN/passphrase interaction. Source review found that HWI 3.2.0 derives its model string from Trezor's protocol model code: Safe 3 revision A reports `trezor_t2b1` and revision B reports `trezor_t3b1`; Groot's Mainnet allowlist incorrectly expected `trezor_safe_3`. |
| Blockstream Jade Classic public-key sharing   | Blocked                   | The device was discovered, but account-key import failed before the expected PIN login completed. No error code or firmware version was captured, so this remains an exact-candidate physical retest rather than a claimed source fix.                                                                               |
| Coldcard Mk4 wrong-network handling           | Pass                      | A Mk4 configured for Testnet4 was rejected as wrong-network. After the owner changed the device to Mainnet, public-key sharing succeeded.                                                                                                                                                                            |
| 2-of-3 policy with Mk4, Nano S Plus, and Nova | Pass through registration | Policy construction and every requested device-policy registration/first-address check were reported successful.                                                                                                                                                                                                     |
| Final 2-of-3 wallet creation                  | Blocked                   | Creation failed after the coordinator PIN with a request to scan/import an already approved signer again. Source review found that every saved-signer lookup invalidated the other signers' still-valid, exact Mainnet admissions.                                                                                   |
| Detailed public-key dialog                    | UI failure                | Opening the complete xpub from an already open verification dialog misplaced the nested dialog, split the backdrop, and left background scrolling available.                                                                                                                                                         |
| Loading indicator                             | UI failure                | The loading glyph appeared to restart or stop instead of rotating continuously.                                                                                                                                                                                                                                      |

## Corrections awaiting exact-build physical repetition

- Mainnet admits only HWI's exact Trezor Model One identifier `trezor_1` and
  Safe 3 revision identifiers `trezor_t2b1`/`trezor_t3b1`; other Trezor model
  identifiers remain rejected.
- A successful live signer policy/address proof renews that exact signer's
  memory-only admission. Saved-signer lookup scans preserve the other exact,
  time-bounded admissions collected for the same draft. A new-device discovery
  still clears all admissions, and final creation still requires every
  fingerprint, BIP48 path, account xpub, and device family to match.
- Shared dialogs are portaled to the document body while retaining the shared
  reference-counted scroll lock, preventing a nested identifier dialog from
  inheriting a transformed parent or creating a second partial backdrop.
- The shared loading class uses one namespaced continuous rotation animation.

## Required retest on the new exact build

1. Record the displayed Groot version/commit, macOS version, HWI 3.2.0 package
   verification, exact model, firmware, transport, and reviewer.
2. Repeat Safe 3 BIP48 import for the connected hardware revision and its
   on-device PIN/passphrase path. Do not credit the source-level identifier fix
   as physical evidence.
3. Repeat Jade Classic discovery, login, BIP48 import, policy/address proof,
   rejection, and retry. Capture only Groot's stable error code if it fails;
   do not retain raw HWI output or device identifiers.
4. Rebuild the Mk4 + Nano S Plus + Nova 2-of-3 wallet, register every policy,
   set the coordinator PIN, create the wallet, restart, unlock, sync, and verify
   the first permanently labeled receive address on each capable signer.
5. Repeat wrong-network, wrong-device, disconnect/reconnect, user rejection,
   changed-PSBT, signature merge/removal, threshold finalization, broadcast,
   confirmation, restart/accounting, and clean-profile descriptor recovery.
6. Open and close every complete fingerprint/path/xpub view while a parent
   dialog is open. Confirm one centered dialog, one complete backdrop, no page
   scroll, restored parent scroll, keyboard focus containment, and Escape/close.

This checkpoint does not close any Mainnet distribution gate.

## Reviewed source-policy snapshot

The Mainnet source-policy tripwire was deliberately refreshed only for the four
reviewed candidate files changed by this correction: `wallet.rs`
(`9a7ccf338e8f…`), `hardware_commands.rs` (`0bc4bc6017bf…`), the hardware
onboarding route (`cb0beb5e2faa…`), and the multisig onboarding route
(`a57b626ebce6…`). The full hashes remain executable policy in
`verify-mainnet-source-policy.mjs`; this shortened documentation is not a second
authority. The release gate must pass after any later byte change.
