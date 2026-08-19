# ADR 0037: portable credential-encrypted secret envelopes

- Status: accepted
- Date: 2026-08-19
- Applies to: software, external-signer, and multisig profiles on Regtest, Signet, and Testnet4; mainnet remains blocked
- Supersedes: the mandatory device-key portions of ADR 0011, ADR 0013, ADR 0015, ADR 0018, ADR 0023, ADR 0024, and ADR 0028

## Context

Version-2 secret envelopes encrypted a random data key twice: once with an Argon2id key derived from the wallet credential and once with a random platform device key. Unlock required both copies to authenticate. On macOS, repeated development and signed-build identities made Keychain authorization unreliable even though the submitted wallet credential and encrypted file were valid. The same mandatory platform-store dependency also prevented one portable storage design across macOS, Linux, Windows, iOS, and Android.

The user explicitly approved replacing mandatory device binding with the portable encrypted-wallet-file model used by comparable desktop wallets. The user also authorized discarding the existing test wallets, but a bounded migration is possible without weakening credential authentication because every v2 envelope already contains a complete credential-wrapped data key.

## Decision

- Version 3 remains an authenticated AES-256-GCM envelope. A random data key encrypts the secret payload, and Argon2id derives the key that wraps that data key from the wallet passphrase or app PIN. The mnemonic, decrypted payload, and derived private material remain inside Rust and are zeroized at the existing boundaries.
- Normal create, recover, unlock, sign, and delete paths do not read, create, update, or delete Apple Keychain, sandbox device-key, Windows credential-vault, Linux secret-service, or Android Keystore records. The encrypted profile directory is portable across supported platforms.
- A version-2 file is opened using only its credential-wrapped data key. Groot first authenticates the submitted credential and payload. Only after both succeed does it atomically rewrite the envelope as version 3 and omit the obsolete device-wrapping fields. Wrong credentials, malformed metadata, corrupt ciphertext, and failed writes do not modify the v2 file.
- Legacy platform device-key records are neither required nor automatically deleted. This avoids a destructive or authorization-prompting cleanup of historical operating-system credentials.
- The Argon2id parameters remain unchanged for this bounded migration so existing v2 credential wrapping remains readable and mobile performance is not changed without measurement. Parameter agility and cross-platform calibration require a later versioned decision.

## Security consequences

Portability and reliable recovery improve: the encrypted wallet profile plus the correct credential can move between supported machines without an operating-system keystore. The tradeoff is explicit: theft of the encrypted profile permits offline credential guessing. AES-GCM still authenticates the envelope, Argon2id raises guessing cost, persisted online throttling still protects the application command surface, and strong wallet passphrases remain essential. Operating-system full-disk encryption, account isolation, backups, and host integrity are defense in depth, not prerequisites for decryption.

This decision does not enable mainnet. Before mainnet, Groot must benchmark and review its Argon2id policy on every release platform, test portable backup/restore and corruption behavior in packaged candidates, and independently review the new offline-guessing boundary.

The implementation and migration data flow is maintained in the [architecture diagram](../architecture.md#portable-secret-envelope-flow). The operational Testnet4 acceptance sequence is maintained in the [pre-mainnet test runbook](../pre-mainnet-test-runbook.md#2a-testnet4-portable-storage-and-core-rehearsal).
