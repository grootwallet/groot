# Cross-platform wallet coordination

## Release position

This feature is a tightly scoped Regtest/Testnet4 track after the first-mainnet scope was frozen.
It does not modify the active hardware-certification candidate, package inputs, Bitcoin Core data,
hardware state, or certification evidence. Mainnet stays compile-time disabled. A future mainnet
proposal requires a superseding release ADR, iOS native key-protection completion, physical-device
evidence, recovery drills, interoperability evidence, and independent security review.

## Supported V1

- Desktop-led standard BIP48 `wsh(sortedmulti(...))`, initially optimized for 2-of-3, with exactly
  one Groot mobile software cosigner and the remaining signers imported through existing desktop
  hardware/file/manual boundaries.
- Fresh mobile join without an account or prior wallet state.
- Two encrypted BIP129 QR rounds with an exact signer proof and final descriptor confirmation.
- Unsigned `crypto-psbt` desktop-to-mobile QR, independent mobile review/sign, and signed
  `crypto-psbt` mobile-to-desktop QR.
- Public descriptor QR import of a desktop hardware singlesig wallet as mobile watch-only.
- Phone replacement from the mobile signer's 24 words plus the public wallet descriptor. The BIP39
  passphrase is empty; the replacement device chooses a new local PIN.
- Offline pairing and signing. Bitcoin Core is not involved in either QR exchange.

## Deferred/non-goals

- Mainnet enablement, package/release-candidate changes, cloud backup, account recovery, remote
  pairing, push notifications, or Groot-hosted coordination.
- More than one mobile software signer, mobile USB/HID hardware access, NFC/BLE, Taproot/MuSig,
  unrestricted Miniscript, or mobile creation of delayed recovery policies.
- Treating a phone as a hardware wallet or claiming the Bitcoin key signs inside Secure Enclave.
- Automatic phone replacement. A recovered key must be checked against the exact descriptor and
  first address; a new key changes the wallet policy and requires an explicit onchain migration.

## Two-device journeys

### Desktop-led 2-of-3

1. On desktop choose standard 2-of-3, name the wallet, and choose **Add a Groot phone**.
2. Desktop creates a 15-minute invitation with a UUID, network, 2-of-3 parameters, BIP48 path, and
   fresh 128-bit BIP129 token. The invitation is shown as `ur:groot-invite`.
3. On a fresh phone choose **Connect desktop app** and scan. Mobile rejects wrong network, path,
   thresholds, version, bounds, or expiry.
4. Mobile generates 256 bits of OS entropy and 24 BIP39 words. It displays those words through the
   native backup boundary. Seed derivation uses `mnemonic.to_seed("")`; the local PIN only protects
   the device envelope.
5. Mobile derives the compiled-network BIP48 account xpub, signs the four BIP129 key-record lines,
   encrypts/MACs the five-line record, and shows `ur:groot-bsms`.
6. Desktop scans, derives the BIP129 key from its invitation token, authenticates before releasing
   plaintext, verifies the signed-message pubkey equals the exact account xpub, checks origin,
   network, uniqueness, expiry, and replay state, then shows the phone-key fingerprint. The
   response must be accepted during the 15-minute invitation window. Once accepted, expiry no
   longer races the remaining hardware setup; the final QR stays bound to the same in-memory
   token, session, signer, and exact wallet policy.
7. Both displays show the same six digits. The user explicitly confirms they match before adding
   the signer. Desktop tells the user to keep the phone waiting and explicitly previews the final
   phone QR that appears after the remaining signers and wallet PIN. Two hardware signers can then
   be added with existing flows. The phone waiting screen mirrors that expectation.
8. Desktop creates the wallet only after the existing descriptor-backup and hardware-policy gates.
   It then emits `ur:groot-wallet`, containing an encrypted versioned public wallet record whose
   payload includes the final BIP129 descriptor record and a bounded public signer manifest with
   each desktop name, fingerprint, account xpub, BIP48 origin, import source, and device type.
9. Mobile scans this second desktop QR, verifies MAC/version/network, exact account xpub inclusion,
   M and N, BIP48 restrictions, descriptor checksum, first derived address, and that the complete
   signer manifest reconstructs the exact descriptor. It then commits that metadata with its wallet
   and encrypted signer sidecar atomically. Mobile shows its signer as available locally and the
   others as managed on desktop; it does not import or imply desktop-only certification evidence.

### Fresh install and phone replacement

A fresh install follows the same join flow. For replacement with the same signer, desktop opens the
shared-wallet menu and chooses **Restore Groot phone**. Rust emits an unencrypted version-2 public
wallet record as `ur:groot-wallet`; the record cannot spend, but reveals the wallet's descriptors and
addresses. The replacement phone scans and validates that bounded public record before asking for a
new local PIN. iOS then collects the exact 24 words in a native sheet: the words never enter the
webview. Rust derives the words-only BIP48 account with an empty BIP39 passphrase and requires exact
xpub, fingerprint, derivation, signer-manifest, descriptor-pair, descriptor-checksum, network, and
first-address equality before atomically creating the profile. The new PIN protects only the new
device envelope. The old phone can be discarded after a funded recovery drill. If the 24 words are
lost, the mobile key cannot be reconstructed; use the remaining threshold to migrate funds to a
newly created wallet. Never silently substitute a new phone key into the old descriptor.

### Hardware singlesig watch-only

1. Desktop opens the existing hardware wallet and authenticates **Export & verify**.
2. The existing public descriptor backup is validated inside Rust and framed as
   `ur:groot-wallet`; no private key or pairing token is present.
3. Phone chooses **Watch desktop wallet**, scans, validates network/BIP84 origin/xpub/descriptors,
   names the local profile, and selects a local app PIN.
4. Mobile creates the existing `watch_only` profile type. UI states **Cannot sign** and identifies
   the external hardware signer as the custody device.

### Mobile PSBT signing

1. Desktop persists and reviews a normal multisig proposal, then displays its existing canonical
   `crypto-psbt` UR.
2. Mobile accepts only bounded `crypto-psbt`, parses the complete PSBT in Rust, rejects final scripts,
   non-ALL sighashes, missing witness UTXOs, foreign inputs, false change metadata, wrong-network
   output scripts, and PSBTs with no external recipient.
3. Mobile displays each recipient/address/amount, verified wallet change, fee, input count, txid,
   already-signed identities, and a short exact-revision identifier. The PIN/biometric action occurs
   only after this durable review.
4. Rust reloads the reviewed bytes and revision, decrypts the mobile words, derives the BIP48 key
   with an empty passphrase, proves the private descriptor's public descriptors equal the paired
   policy, signs, and passes the result through the existing signature-only response validator.
5. Mobile shows a signed `crypto-psbt`. Desktop imports it through the existing exact reviewed-PSBT
   compare-and-swap and cryptographic signature merge. Mobile never broadcasts.

## Trust and threats

| Threat                        | Fail-closed control                                                                                                                                | Residual/user control                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Malicious/oversized QR        | Type allowlist, canonical CBOR byte string, 64 KiB coordination and 256 KiB PSBT limits, frame/count bounds, Rust parsing                          | Camera/decoder vulnerabilities still need platform review              |
| Substituted invitation/policy | BIP129 token MAC, signed key record, expiry, exact account xpub inclusion, M/N/path/checksum/first-address validation, six-digit two-display check | If both devices are compromised, comparison can be forged              |
| Compromised desktop           | Mobile derives review from PSBT, verifies paired scripts/change, shows recipient/fee independently                                                 | A compromised desktop sees public wallet data and can deny service     |
| Compromised phone             | Threshold prevents phone-only spend; key is released only after local auth and exact review                                                        | Fully compromised OS during signing may steal the phone key            |
| Screenshot/camera leakage     | Setup copy requires privacy; tokens expire and are one-use; no secrets in normal signed PSBT QR                                                    | Recovery-word screenshots remain catastrophic; never permit them       |
| Replay/stale PSBT             | One setup response accepted within 15 minutes; exact final-policy binding; exact PSBT revision; desktop proposal CAS/status                        | A still-current proposal can be shown again; user must review it again |
| Signature injection           | Existing Groot signature-only merge, SIGHASH_ALL, allowed origin set, secp256k1 verification                                                       | Other valid cosigners retain their intended authority                  |
| Phone/backup loss             | 2-of-3 remains spendable with the other two keys; clean migration path                                                                             | Losing both phone and words permanently loses that signer              |
| Downgrade/cross-network       | Version/type/network/path checks; compile-time network parameters; no plaintext setup mode                                                         | Interoperability must retain these exact checks                        |
| Optional cloud identity       | Separate opt-in metadata/service boundary; never carries seeds, tokens, PINs, or signing authority                                                 | Service may learn explicitly shared public metadata                    |

## iOS key protection

Secure Enclave supports platform P-256 operations, not Groot's secp256k1 BIP32 signing key. V1 iOS
must generate a random payload key, encrypt the mnemonic with authenticated encryption, and protect
the wrapping/release operation with a non-synchronizing Keychain item using
`WhenPasscodeSetThisDeviceOnly` plus explicit user presence or `biometryCurrentSet`. Removing the
device passcode, changing the selected biometric set, restoring to a different phone, or reinstalling
must make the device wrapper unavailable. Recovery then uses the written 24 words and a new local PIN.

The mnemonic, seed, BIP32 private keys, decrypted payload key, PIN, and unsigned/signed private
descriptor must never cross to the webview. The webview receives public signer identity, public
policy, review DTOs derived from the actual PSBT, and QR frames. Bitcoin signing happens in
short-lived zeroized Rust memory. Residual risk is a malicious mobile OS while the key is released;
Secure Enclave wrapping cannot make the phone equivalent to an independent hardware signer.

## Persistence and compatibility

- `coordination.json` v1: wallet UUID, device role, mobile fingerprint, truthful key-protection
  identifier, pairing time, and an optional one-time pairing session ID used only to reconcile an
  interrupted mobile commit. Public metadata, owner-only file permissions.
- `mobile-signer.json`: secret-store envelope containing only the words for coordinated mobile
  profiles. The local PIN protects the envelope and is not seed material.
- `pending-mobile-pairings/<uuid>.json`: encrypted staging payload containing the invitation,
  signer label, words, and whether desktop has accepted the phone response. Mobile can list only
  its opaque session ID; resuming or advancing the flow requires the same local PIN. Older staged
  records default to the response step, so no migration is required. Completion first atomically renames the file to a hidden
  consuming tombstone bound to the newly allocated wallet UUID. Startup removes only that exact
  unregistered partial profile before restoring an uncommitted tombstone, removes a tombstone whose
  exact wallet/session registry commit is authoritative, and removes abandoned atomic-write
  temporary files. A tombstone that claims another registered wallet fails closed. Explicit cancel
  is operation-serialized, idempotent, and removes either staging state. A malformed UUID cannot
  select a filesystem path.
- Existing `wallet.json`, `secret.json`, registry v1, proposal SQLite schema, BSMS records, and PSBT
  formats are unchanged. Old profiles have no sidecar and report non-shared. No migration is needed.
- BIP129 records remain standards-defined. `crypto-psbt` remains the interoperability format.
  Groot-specific UR type strings only carry animated bytes for invitation/encrypted BSMS/public
  wallet records; file/manual BIP129 fallback can be added without changing the payload.
- Every multipart camera surface reads the declared UR source-fragment count and shows bounded,
  estimated scan progress as a horizontal bar plus the unique-frame count and percentage. Fountain
  frames are not presented as `scanned of total`: redundant equations can legitimately outnumber
  source fragments. Presentation stays below 100% until the native decoder accepts the complete
  payload; duplicate frames do not advance it.
- The encrypted phone response alone uses 160-byte UR fragments and a slower 1.4-second display
  cadence to reduce QR density on small screens. It can be enlarged full-screen without changing
  its encrypted payload, type, decoder bounds, or replay semantics. Other coordination and PSBT
  transports retain their existing framing parameters.

## Test and release gates

Regtest/Testnet4 code acceptance requires BIP129 reference-vector parity; hostile MAC/signature,
wrong-network/path/version/expiry/replay tests; UR bounds and out-of-order/duplicate frames; funded
2-of-3 mobile signature round trip through the production proposal merge; exact-revision mutation;
false change/foreign input/missing UTXO/sighash attacks; restart/cancel staging cleanup; watch-only
address equality; and clean recovery/migration drills.

The isolated Bitcoin Core Regtest harness now passes the funded mobile review/sign, desktop
signature-only merge, second signature, finalization, and broadcast path, including the listed PSBT
attack cases. Deterministic units pass response authentication, expiry, replay, substituted-token,
volatile-desktop-restart, staged-response reopen, cancel, consuming-tombstone reconciliation,
exact orphan-profile cleanup, registered-wallet conflict, traversal, and orphan-temporary-file
cases. An isolated Regtest build also compiles, installs, launches, and survives a forced process
relaunch in the iOS 26.1 simulator, with built camera/Local Network permission copy and status-safe
onboarding layout verified. A physical iPhone has scanned the desktop invitation, displayed the
native two-column recovery sheet, survived relaunch into staged pairing, and returned its encrypted
response to a camera-entitled isolated macOS Regtest build. The replacement-phone implementation
now also provides a desktop public recovery QR and native iOS 24-word entry with exact Rust policy
binding, but it has not completed a clean physical-device restore. The evidence does not cover
Keychain/Secure Enclave wrapping, biometric/passcode behavior, clean written-word recovery, or the
complete real-device lifecycle. Full external
process-kill automation at every wallet registry/profile commit boundary, watch-only address
equality, and a funded clean mobile recovery drill remain open and must not be inferred from this
evidence.

iOS physical certification additionally requires camera denial/interruption/background/resume,
safe-area and accessibility checks, passcode-required Keychain behavior, biometric enrollment
change, phone lock during sign, process kill at each commit boundary, reinstall/restore, loss of
device wrapper, written-word restore, and two independent wallet interoperability runs.

Mainnet requires all of those results attached to a dedicated superseding ADR and threat-model
review. Until then, the testnet key-protection identifier and compile-time mainnet lock are
authoritative.
