# ADR 0005: Descriptor-first Miniscript multisig coordinator

- Status: accepted
- Date: 2026-08-02

## Context

Satchel's original product boundary excluded multiple wallets, hardware wallets, and multisig. The next product milestone expands Satchel into a small coordinator while preserving the Rust trust boundary and the existing single-key wallet.

Hardware devices do not expose seeds to the coordinator. Interoperable wallet recovery therefore depends on origin-aware extended public keys, standard output descriptors, PSBTs, and an independently backed-up policy.

## Decision

1. BDK remains the wallet database, chain state, transaction builder, and PSBT authority.
2. Rust Miniscript descriptors are the canonical wallet identity. Svelte never constructs, mutates, or validates a descriptor.
3. The v1 coordinator supports only native-SegWit `wsh(sortedmulti(k,...))` policies with 3–7 cosigners and a minimum threshold of 2.
4. Hardware cosigner keys use the test-network BIP48 account origin `m/48'/1'/0'/2'`; external and change branches are `/0/*` and `/1/*`.
5. Each cosigner record contains a stable local ID, immutable label, master fingerprint, account xpub, origin, and transport metadata. Duplicate fingerprints or account xpubs are rejected.
6. Desktop USB hardware communication is isolated behind an HWI transport in Rust. Manual/QR key import and PSBT exchange are the portable desktop/mobile path.
7. Signing is always PSBT-based. The coordinator shows the authoritative transaction summary and signature progress, accepts partial signatures, and broadcasts only after BDK/Miniscript finalization succeeds.
8. A hardware-only coordinator has an app PIN verifier but no BIP39 secret. The existing single-key wallet continues using one credential as both BIP39 passphrase and app PIN.
9. CI uses deterministic virtual signers through the same Rust device port. Real-device claims require a model/firmware certification record.
10. V2 adds reviewed policy templates for timelocked recovery, decaying multisig, and expanding signer sets. Arbitrary raw Miniscript entry remains disabled until the policy-analysis and recovery-drill gates in the roadmap are complete.

## Consequences

The coordinator is recoverable in other descriptor-aware software and does not become a hidden key custodian. V1 remains understandable and broadly compatible with hardware wallets supporting P2WSH multisig. Device-specific registration and display behavior must be surfaced rather than assumed. Multiple-wallet registry work, persistent proposal state, PSBT import/export, and descriptor backup become required product infrastructure.

This ADR supersedes the single-wallet/hardware-wallet/multisig exclusions in the original product specification for the coordinator milestone. ADR 0002 continues to apply unchanged to single-key wallets; its BIP39-passphrase rule does not apply to a hardware-only coordinator with no local mnemonic.
