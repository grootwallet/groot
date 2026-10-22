# ADR 0097: Groot credential for iOS key access

- Status: accepted owner-requested implementation; physical verification pending
- Date: 2026-10-19
- Supersedes: ADR 0095 only for repeated platform user-presence authentication

The owner explicitly requested removal of redundant iOS passcode prompts. Keep the Groot credential, Argon2id, authenticated encryption, installation/purpose binding and `WhenPasscodeSetThisDeviceOnly`, but use no extra Keychain user-presence prompt for new keys. The iPhone must remain unlocked and passcode protected. This removes a separate device-owner approval barrier; it does not make a weak Groot PIN strong or claim Secure Enclave signing.

Existing version-6 encrypted wallet files and Keychain items remain unchanged and readable. On first access, an old user-presence item can require one final owner approval. Only after successful Groot credential decryption, add an identical wrapping key under a distinct credential-policy Keychain account. Verify the added item before success; never replace/delete the original item or change ciphertext. A failed/cancelled approval, wrong Groot credential or failed copy does not grant success. Retry can use the original item. Earlier app versions retain their original access path and prompts. No wallet/profile/backup/registry format change, migration, discard, seed derivation change or source-pin refresh.

New key reads first select the credential-policy account with authentication UI forbidden, then use the legacy path only if that account is absent. Corrupt/unavailable items fail closed. Nothing retains a key in a webview, cache or logged payload. The small native Security-framework bridge owns both policies; Rust owns successful-credential gating and zeroized key memory.

Native unit coverage must prove that wrong credentials cannot trigger the policy copy and copy failure cannot return a secret. iOS builds and owner-driven old/new-wallet, wrong-PIN, background/restart, signing and recovery checks remain distinct from those units. Physical verification does not authorize a public release or destructive device-wide passcode tests.
