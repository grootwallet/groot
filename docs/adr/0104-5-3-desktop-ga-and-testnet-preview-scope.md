# ADR 0104: 5.3 desktop GA scope and test-network previews

- Status: release scope accepted by the owner; GA authorization pending
- Date: 2026-10-22
- Extends: ADRs 0069, 0099, 0100 and 0103

## Decision

The owner wants one 5.3.0 macOS desktop GA candidate for the existing
restart-bound Regtest, Testnet4 and Mainnet app. Mainnet scope is the existing
BIP84 and standard BIP48 wallet classes, including Coldcard Mk4, Ledger Nano S
Plus, original BitBox02, BitBox02 Nova, Jade Classic, Trezor Safe 3 and Trezor
Model One, with the application-level 0.01 BTC spend ceiling removed.
The final-PSBT fee guard, exact transaction review, network separation,
credential protection, hardware identity, recovery and release checks remain.
The Testnet4 performance result does not certify a Mainnet hardware path.

Partner and Family Continuity may remain available as explicitly experimental
test-network templates. The existing iOS phone key, pairing and standard-
multisig QR signing candidate may likewise remain an internal Testnet4 preview;
its iOS binary is not part of the macOS GA distribution. Neither preview is a
Mainnet product claim or a condition for saying Mainnet users can use those
flows. Mainnet Continuity creation, phone signing, phone enrollment
into Continuity, direct USB Miniscript signing and Android key operations
remain disabled. Release notes and UI must not imply that a partial preview is
fully certified. Unsafe or misleading preview behavior must fail closed or be
disabled before the exact GA package is approved.

This scope decision does not authorize public distribution. The faster HWI
operation session may be enabled for Mainnet only after ADR 0103's dedicated
threat-model, source-policy, exact-artifact and physical gates are closed.
Those gates include all seven models on the same Mainnet candidate. A later
release decision must bind the exact commit, signed package, evidence and tag.

## Compatibility and standards

This decision changes no persisted wallet, registry, backup, proposal or
credential format. It does not expand BIP support: Partner/Family BIP68/112
coordination remains test-network-only and standard BIP84/BIP48 Mainnet support
retains its existing boundaries. Existing Mainnet wallets stay in the canonical
multi-network app namespace; the isolated RC snapshot in ADR 0103 is test data,
not a GA migration.

## RC18 owner test boundary

The owner reports that all seven supported signers were fast in the RC16 Mainnet
rehearsal and that the three RC17 follow-up checks passed: Coldcard and Jade
error spacing, Jade's network hint, and initial managed-node scan progress.
The owner accepts the Regtest/Testnet4-only Partner/Family and phone-key preview
scope without another preview campaign before desktop GA. RC18 is an ad-hoc,
unnotarized candidate using the canonical desktop app identity so existing
Mainnet wallets can be exercised. This does not authorize public GA packaging
or replace the production-signing and exact-artifact gates above.

## RC18 owner result

The owner reports that existing Mainnet wallets appeared, all seven named
hardware signers completed the tested health, identity, address and signing
steps quickly (Coldcard Mk4 was also acceptable), network switching kept the
wallet lists separate, and first-scan and signer-error checks passed. This
closes the requested ad-hoc owner smoke test. It does not certify the future
Developer ID-signed executable or authorize public GA distribution. The final
in-app notes must lead with user-facing changes and mark phone-key and
Continuity/Miniscript flows as test-network previews.

## Developer ID fast-runtime authorization

On 2026-10-22 the owner explicitly approved enabling the sealed fast HWI
runtime for the Developer ID-signed 5.3.0 Mainnet build. The implementation is
limited to the canonical multi-network macOS app, signing team `6Z85HGDUU7`,
the seven tested models, and existing BIP84/standard BIP48 actions. It keeps
per-operation live fingerprint/xpub proof, exact chain and device selection,
policy and PSBT authorization, HWI and runtime digests, app code-signature
checks, and native returned-signature verification. The production runtime is
signed and frozen as a separate release input before compilation; independent
unsigned builds and the signed package must bind the same runtime manifest.
Fixed-network builds and other versions or signing teams cannot enable it.

This authorizes the Mainnet signing-path implementation, not publication of an
unverified artifact. The exact 5.3.0 source, reproducible executable, signed
runtime, notarized app/DMG, owner smoke test of that signed package, and final
version/tag release authorization remain separate gates.
