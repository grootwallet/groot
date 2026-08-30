# Codex Security remediation — 2026-09-01

## Status

The three low-severity, high-confidence findings from the 2026-09-01 Codex Security assessment are remediated in the current working tree. Focused regression tests and the repository validation harness pass. Mainnet remains **BLOCKED**: this remediation does not replace the dedicated enablement ADR, exact release-candidate review, funded public-network rehearsals, physical hardware/platform certification, KDF calibration, signed-package evidence, or the remaining items in [`mainnet-release-checklist.md`](mainnet-release-checklist.md).

Codex Security scan `499afbbb-bf95-4bec-a136-fc786fcf4a96` completed against remediated working-tree snapshot `codex-security-snapshot/v1:sha256:3c8fea7747e78ae3c204f8ec3ac95249f795a00e3a830ae5468b179bc62ce303`. Its sealed Codex workbench report and canonical findings/coverage artifacts reported no new findings and confirmed no issue on each remediated surface. Coverage is explicitly partial because side-conversation constraints prevented independent delegated reviewers and the scan did not produce signed-package, physical-device, funded-network, penetration-test, crash-artifact, accessibility-tree, or platform KDF evidence. The repository documentation in this file and `SECURITY.md` changed after the snapshot was captured; the reviewed application fixes did not.

## Compatibility decision

The passphrase policy is a creation-time rule, not a wallet-format migration:

- New Groot-generated software wallets require at least 16 Unicode characters. Letters-only passphrases remain valid; no digit, symbol, or mixed-case rule is imposed.
- Recovery, unlock, signing, backup verification, and existing profiles continue accepting the exact historical non-empty passphrase. Groot does not trim, normalize, replace, or silently strengthen it because a changed BIP39 passphrase selects a different wallet.
- The 1,024-byte credential ceiling remains unchanged.
- No envelope, descriptor, registry, database, backup, or profile format changed, so no data migration is required.

This decision is recorded in [ADR 0051](adr/0051-new-software-wallet-passphrase-minimum.md).

## Confirmed remediations

### 1. Trivially guessable new-wallet passphrases

**Original risk:** creation accepted any non-empty passphrase. A copied portable profile provides an offline verifier, so a trivial credential could be guessed without Groot's online authentication throttle.

**Fix:** both the trusted Rust `wallet_create` boundary and the deterministic browser adapter enforce the 16-character minimum. The onboarding UI applies the same rule before submission and explains that letters-only passphrases are accepted. The stronger validator is creation-specific; historical recovery and credential-verification paths retain their exact compatibility contract.

**Verification:** Rust and TypeScript boundary tests reject 15 characters, accept 16 ASCII letters, and accept 16 non-ASCII Unicode code points. The desktop and mobile onboarding journey verifies the maximum-byte rule, the new minimum, and successful letters-only creation.

**Residual risk:** length is not proof of entropy. A copied portable profile still permits offline guessing by design. Platform-specific Argon2id calibration, user education, full-disk encryption, host security, and release-candidate review remain required before mainnet.

### 2. Exceptional Rust paths without immediate RAII zeroization

**Original risk:** recovery cancellation, version-2 migration-write failure, and legacy decryption failure could return before manually clearing an ordinary credential, decrypted payload, or derived-key buffer.

**Fix:** recovery credentials are wrapped in `Zeroizing` immediately on command entry. Secure-store decryption and loads return `Zeroizing<Vec<u8>>`, so both the decrypted payload and wrapped data key are cleared if migration or a later operation fails. Legacy decryption uses `Zeroizing<[u8; 32]>` for the derived key and immediately wraps plaintext; mnemonic parsing borrows that protected buffer instead of creating a second ordinary string.

**Verification:** secure-store success, wrong-credential, corrupt-payload, and version-2 migration tests pass; compile-time type assertions in tests require the protected return type. The complete Rust suite and Clippy with warnings denied also pass.

**Residual risk:** zeroization reduces normal process-memory lifetime but cannot defeat a privileged process-memory reader, allocator copies inside third-party libraries, operating-system crash dumps, or a compromised host.

### 3. Settings modal credentials retained after dismissal

**Original risk:** closing node, rescan, or wallet-deletion dialogs could hide them while retaining RPC credentials, wallet passphrases, and destructive confirmation text in the mounted route.

**Fix:** each credential-bearing dialog now has shared open/close helpers. Every Escape, backdrop, close-button, and footer-dismissal path clears credentials, confirmation text, and associated error state before hiding the dialog. Reopening also starts from a cleared state. Active rescan dismissal behavior remains intentionally unchanged.

**Verification:** source-level teardown tests require all shared handlers, and Playwright exercises Escape, footer Close, and X dismissal followed by reopen on desktop (1180×780) and mobile (390×844). Reopened fields are empty and wallet deletion is disabled.

**Residual risk:** a compromised renderer or privileged local process can still observe values while the user is actively entering or submitting them. This fix removes unnecessary post-dismissal retention; it does not claim renderer-compromise resistance.

## Verification record

Run with the pinned Node 24.19.0 runtime and locked dependencies unless stated otherwise:

- `pnpm validate` — passed: formatting, architecture and secret-surface gates, supply-chain/version/localization/release gates, Svelte diagnostics, 72 Vitest files / 351 tests, and production build.
- `cargo fmt --check` — passed.
- `cargo clippy --locked --all-targets --all-features -- -D warnings` — passed.
- `cargo test --locked --all-features` — passed: 376 Rust library tests and 2 adversarial integration tests; 14 environment-dependent tests remained explicitly ignored by their harness contracts.
- `pnpm test:acceptance` on an isolated local port — 178 passed and 3 intentionally skipped; the one unrelated mobile hardware-flow timeout passed on an immediate single-worker rerun. The changed onboarding and Settings credential-dismissal journeys passed on desktop and mobile in the full run.
- `git diff --check` — passed.

## Production and mainnet conclusion

These fixes close the three reviewed code findings without changing wallet identity or persisted formats. They are necessary hardening, not a production or mainnet authorization. In particular, the following evidence remains outside this local remediation:

- signed/notarized exact-release-candidate review and clean-checkout CI;
- funded Signet and Testnet4 rehearsal, including recovery and failure cases;
- physical hardware-wallet and macOS lifecycle/accessibility/crash-artifact certification;
- platform-specific Argon2id latency and resistance calibration;
- independent penetration testing and external wallet-security review;
- completion of every unchecked mainnet release item and an approved ADR superseding ADR 0012.
