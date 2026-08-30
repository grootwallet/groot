# ADR 0051: new software-wallet passphrase minimum

- Status: accepted
- Date: 2026-09-01
- Applies to: creation of new Groot-generated software wallets on every network
- Refines: ADR 0002 and ADR 0037

## Context

Version-3 portable secret envelopes intentionally permit offline credential guessing after an encrypted profile is copied. Argon2id increases the cost of each guess, but the previous creation boundary accepted any non-empty BIP39 passphrase. A one-character or similarly short passphrase therefore provided inadequate protection despite the onboarding request to choose a strong value.

The BIP39 passphrase is also part of wallet derivation. Changing, trimming, normalizing, or rejecting the original value during recovery can select a different wallet and strand an existing user. Creation hardening must therefore remain separate from compatibility validation.

## Decision

- Creating a new Groot-generated software wallet requires at least 16 Unicode characters and at most 1,024 UTF-8 bytes.
- The rule is length-based. Letters-only passphrases are valid; Groot does not require digits, symbols, or mixed case.
- Rust enforces the minimum at `wallet_create` before consuming the pending mnemonic. The Svelte and browser-prototype checks mirror that trusted boundary for immediate feedback and deterministic tests.
- Software-wallet recovery, unlock, signing, backup verification, and existing-wallet operations continue accepting the exact historical non-empty passphrase up to the existing byte limit.
- Groot never trims, rewrites, silently strengthens, or normalizes a submitted passphrase at this policy boundary.
- The change does not alter descriptors, secret-envelope versions, profile files, registries, databases, or migration behavior.

## Consequences

New wallets cannot be protected by trivially short credentials, while letters-only phrases and exact historical recovery remain supported. Length is not proof of entropy: copied portable profiles remain offline-guessable, users still need an unpredictable passphrase, and platform-specific Argon2id calibration plus independent release review remain mainnet blockers.
