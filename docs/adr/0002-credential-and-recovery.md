# ADR 0002: 24 words and one passphrase/PIN credential

- Status: accepted
- Date: 2026-07-17

## Context

The desired UX uses the BIP39 passphrase as the application unlock credential and signing PIN. BIP39 maps every passphrase to a valid seed, so a wrong value cannot be detected from derivation alone.

## Decision

Generate 24 BIP39 words. Use one user credential as both the BIP39 passphrase and app unlock/signing PIN. Store a separately salted, memory-hard credential verifier bound to wallet metadata. Verify before loading signers and return `invalid_credential` on mismatch.

## Consequences

The UX has one secret beyond the recovery words. Users must understand that losing the credential loses the wallet and that a short numeric PIN provides weak protection if the 24 words are stolen. The UI should call it “passphrase / PIN,” encourage a longer value, rate-limit attempts, and never log or persist plaintext.
