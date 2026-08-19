# ADR 0015: External-signer wallets and per-wallet Core RPC

## Status

Accepted for regtest; the TLS-backend portion is superseded by ADR 0020. Physical-device and remote-node certification remain release gates.

The device-bound secure-storage clause is superseded by ADR 0037. Per-wallet encryption, session lifetime, and RPC transport requirements remain in force.

## Decision

An externally signed single-key wallet is a first-class `watch_only` wallet profile containing canonical, public-only BIP84 descriptors. V1 fixes the test-chain account path to `m/84'/1'/0'`. USB HWI, file, manual, and QR-text imports normalize to the same label, master fingerprint, account tpub, path, and optional device type before wallet creation.

Satchel rejects private extended keys, seed/recovery fields, mainnet xpubs, ambiguous paths, non-BIP84 descriptors, non-canonical descriptors, and imports over 256 KiB. The imported fingerprint must be verified by the user against the signer.

External-signer spending uses a persisted PSBT. Satchel accepts either an HWI signature from the exact stored fingerprint or a bounded signed-PSBT import. Rust verifies the unsigned transaction, signer origin, sighash, and finalizability before changing proposal state. A separate per-wallet Satchel app PIN authorizes final broadcast; it is not the hardware wallet's seed passphrase.

Hardware passphrases remain on the device when supported. Satchel does not silently choose an empty-passphrase wallet. It may import a Trezor seed-only standard wallet after explicit user confirmation enforced again by Rust; this can coexist with separate passphrase-derived profiles. Trezor Model One host passphrase entry stays unsupported until a native, non-webview secret-entry boundary exists.

Each wallet may select a local or remote Bitcoin Core RPC endpoint. Local endpoints must be loopback. Remote endpoints must use HTTPS. Credentials in URLs are rejected. Local cookie auth uses the isolated regtest cookie; username/password credentials are encrypted with the wallet credential and device-bound secure storage, loaded only into the unlocked process session, and cleared on lock or wallet switch. TLS is enabled on the already-transitive pinned `minreq` transport through rustls.

## Consequences

- Multiple software, external-signer, and multisig profiles may coexist and use different app PINs and node settings.
- Passport Core uses QR/microSD because its USB-C port is power-only. Passport Prime cable signing is not claimed until a documented compatible protocol is integrated and certified.
- Animated UR capture and camera scanning remain a separate UI transport; descriptor text and bounded files are supported now.
- Mainnet remains compile-time disabled.
