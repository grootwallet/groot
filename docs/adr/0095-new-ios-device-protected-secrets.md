# ADR 0095: Device protection for newly created iOS secrets

- Status: accepted implementation direction; physical certification pending
- Date: 2026-10-18
- Extends: ADR 0001, ADR 0035, ADR 0037, ADR 0081 and ADR 0093

## Compatibility

Introduce secure-store envelope version 6 only for newly created iOS wallet-secret files, including staged phone signers. Desktop and node-auth writes retain version 5. The reader retains all previously supported versions; existing files are not silently converted to device-bound storage, moved or deleted. Registry/profile/backup/proposal formats and seed derivation stay unchanged. Earlier versions cannot open newly created version-6 iOS secrets; they must report unsupported format, not a wrong credential. These files are device-local working copies, not portable recovery backups.

No existing wallet needs migration or discard in this change. A future conversion of an existing portable file is a separate persisted-format decision requiring its own compatibility and owner approval. Retained testnet PIN-only files must remain truthfully identified and cannot be claimed as device protected. Written words plus the exact software passphrase, or phone-signer words plus the complete public multisig policy, remain independent recovery paths.

## Construction and platform boundary

Reuse the existing authenticated version-5 payload and Argon2id credential wrap. Version 6 additionally encrypts the credential-wrapped random data key with a distinct random 256-bit Keychain key using AES-GCM and wallet/purpose-bound authenticated data. Do not leave the portable credential-wrapped key alongside that device layer. Both the local credential and platform authorization are therefore required.

The Keychain item uses `WhenPasscodeSetThisDeviceOnly`, non-synchronizing storage and `userPresence`: device biometrics or passcode authorize release. This policy permits newly enrolled biometrics after device-owner authentication; it does not claim biometric-set invalidation. Passcode removal, transfer to another phone or loss of the wrapper require written-backup recovery. No secp256k1 signing occurs inside Secure Enclave, and the UI must not claim otherwise.

Bind the Keychain account to a fresh installation identifier stored atomically in Application Support and explicitly excluded from backup, plus the wallet/purpose context. An ordinary reinstall creates a new identifier; missing old installation state must never recreate a wrapping key while loading a file. The native API returns only bounded key bytes to zeroized Rust memory. Native secrets and platform prompts never enter the webview or logs.

Use the already locked `cc` version 1.2.67 to compile the existing iOS Objective-C++ secret UI and the small Security-framework bridge. This promotes an existing transitive build dependency, adds no new package/version or lifecycle script, and requires supply-chain/source review.

## Failure and evidence

Missing wrapper, rejected device authentication, malformed/unknown envelopes or unavailable passcode protection fail closed; do not fall back to a portable write. New-profile/staging failures preserve existing wallets. No phone-signer PIN change until its atomic multi-file rotation is designed. Keychain deletion/secure erasure is not implied by file deletion.

Unit tests must prove both layers, context binding, wrong credential/device key, tampering, malformed metadata and unsupported versions. iOS compilation, physical authentication/cancel/lock/restart, clean recovery and reinstall/restore behavior are separate evidence. Destructive device-wide passcode/biometric changes cannot be automated as ordinary app tests. No release gate or reviewed source pin changes are authorized by this ADR.
