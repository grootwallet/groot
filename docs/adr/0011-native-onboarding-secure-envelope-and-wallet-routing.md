# ADR 0011: Native onboarding, device-bound secret envelopes, and wallet routing

- Status: accepted
- Date: 2026-08-03

## Context

Generated recovery words previously crossed the Tauri IPC boundary for Svelte to display. Wallet directories were fixed singletons even though a versioned registry existed, and single-key payment proposals disappeared when the process restarted. Credential-only encryption also allowed a copied secret file to be attacked away from the originating device.

## Decision

- Production mnemonic generation creates a Rust-owned, zeroized pending-onboarding session. A platform-native sheet attached to Satchel displays and confirms the 24 words; macOS uses a compact 8×3 monospaced grid. The Tauri command returns no words and wallet creation consumes the pending session exactly once. The browser adapter may expose deterministic fixture words solely for UI automation.
- Persisted secret material uses a version-2 authenticated envelope. A random data key encrypts the mnemonic or multisig verifier. That data key is wrapped independently by the Argon2id-derived passphrase/PIN key and a random device key; opening requires both copies to authenticate and match.
- macOS and iOS store the device key in Apple Keychain. Other targets store it in the operating system's private application sandbox with owner-only permissions. Hardware-backed Android Keystore and Windows credential-vault certification remain release-hardening work; the sandbox fallback does not justify enabling mainnet.
- Correctly authenticated version-1 AES envelopes migrate to version 2 before unlock completes. Wrong credentials and corrupt metadata fail closed.
- The UUID registry is authoritative for selected-wallet routing. Single-key and multisig creation use isolated directories, legacy fixed directories migrate with rollback, switching clears unlocked state and volatile proposals, and deletion rolls back registry/filesystem changes together.
- Single-key PSBT proposals are persisted before review is returned. A fresh process can recover the exact PSBT; malformed persisted PSBTs fail closed.

## Consequences

Generated recovery words no longer enter the webview. Copying a wallet directory is insufficient to decrypt its secret on another device. Multiple wallets can coexist without database-path aliasing. Switching always requires unlocking the selected wallet. Browser fixtures remain explicitly non-production, and public-network release still requires platform-specific storage and physical-device certification.
