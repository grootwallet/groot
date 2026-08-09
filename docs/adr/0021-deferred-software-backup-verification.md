# ADR 0021: Deferred software-wallet backup verification

- Status: accepted
- Date: 2026-08-09

## Context

ADR 0011 made the native exact-order recovery-word challenge mandatory before software-wallet creation. This protects recoverability, but it also blocks users who must finish setup before they can safely perform a complete backup drill. Treating a skipped drill as if it passed would remove the most important distinction, while sending the mnemonic to the webview for later verification would violate the key-isolation boundary.

## Decision

Allow **Verify later** after the generated words have been shown and recorded. Wallet creation remains available and all signing, receiving, address-gap, and encryption rules remain unchanged. The wallet registry persists a per-profile `backupVerified` marker. New generated wallets receive the Rust-owned native challenge result; recovery imports and legacy profiles are verified because they already supplied or previously completed the formerly mandatory ordered phrase.

An unverified software wallet shows a persistent Overview warning and Settings CTA. Later verification requires the selected wallet to be unlocked and requires fresh wallet-passphrase authentication. Rust decrypts the mnemonic inside the trusted boundary and supplies it only to the native shuffled-word challenge; the ordered words are not re-revealed and no word crosses IPC. Cancellation or mismatch leaves the marker false. Rust alone atomically changes it to true after an exact match.

The marker is recoverability guidance, not a spending authorization control. This milestone does not block receiving, address derivation, signing, or broadcast for an unverified wallet. Any later deposit-, time-, or address-based restriction requires a separate ADR because a poorly designed restriction could strand users, create gap-limit surprises, or turn a dismissible reminder into a denial-of-service surface.

## Consequences

Users can finish onboarding without falsely claiming that their written backup was tested. Later verification does not introduce a mnemonic IPC or re-reveal path, but it does require native challenge support on each platform. A compromised renderer can request, cancel, or visually hide the reminder, while a compromised host can observe native UI; neither risk is solved by this marker. Platform certification and mainnet release gates remain unchanged.
