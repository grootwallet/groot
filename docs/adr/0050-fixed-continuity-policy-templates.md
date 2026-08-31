# ADR 0050: Fixed Partner and Family Continuity templates

- Status: proposed
- Date: 2026-09-01

## Context

Groot should help households recover without exposing a generic Miniscript builder. The product needs two understandable policies: continuity for an owner and partner, and continuity for parents and adult children. Each policy relies on relative timelocks and periodic renewal transactions. Arbitrary policies, editable delays, and mainnet activation remain out of scope.

## Decision

1. Groot exposes three creation choices: Standard multisig, Partner Continuity V1, and Family Continuity V1.
2. Both Continuity templates compile as native-SegWit P2WSH Miniscript. Rust owns role validation, compilation, descriptor sanity checks, and spending-path metadata.
3. Partner Continuity is owner 2-of-3 immediately; both partner keys after 13,140 blocks; either partner key after 39,420 blocks; or 2-of-3 estate guardians after 52,560 blocks.
4. Family Continuity is both parents immediately; either parent plus either child-assistance role after 13,140 blocks; or 2-of-3 child-inheritance roles and executor after 52,560 blocks.
5. The product recommends renewal near 26,280 blocks. Renewal is a self-transfer to a fresh descriptor output and does not alter the descriptor.
6. The coordinator supports up to eight public signer records so the Partner template can represent every independent role.
7. Ledger, Jade/Jade Plus, BitBox02, and BitBox02 Nova are firmware candidates only. ADR 0044 remains authoritative: direct USB enrollment, trusted display, and signing stay disabled until each exact model, firmware, transport, descriptor, and path passes packaged Testnet4 certification.
8. Mainnet remains compile-time blocked. Continuity V1 is a test-network feature until independent review, all-path physical evidence, renewal evidence, and recovery-drill evidence are complete.

## Persisted compatibility

The existing wallet-backup and resumable-setup envelopes remain structurally version 1, but their tagged template enum gains `partner_continuity_v1` and `family_continuity_v1`. Current Groot builds continue reading existing Standard, Recovery, and Inheritance data without migration. A downgrade to a build that predates ADR 0050 cannot interpret a Continuity template and must fail closed rather than treating it as Standard multisig. Descriptor backups remain the independent recovery artifact.

No private key, email address, account token, notification credential, or billing state is added to wallet persistence. Optional Groot accounts and email notifications require a separate service-boundary ADR.

## Consequences and remaining gates

The setup UI reuses the existing policy cards, progress, timeline, signer list, review, and backup primitives. A shared role-to-template function prevents creation and draft restoration from assigning signers differently.

The immediate owner/parent path is constrained to its intended signers. Named delayed-path proposal selection, renewal orchestration, mobile phone-key custody, physical signer certification, and end-to-end inheritance drills remain release blockers; the app must not imply those gates are complete.
