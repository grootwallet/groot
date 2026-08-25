# ADR 0042: bind delayed spend paths and unify self-managed recovery

Status: accepted.

## Context

Recovery and Inheritance creation exposed the same Miniscript structure under two names: three primary keys requiring two signatures, plus one independent key that can spend a coin after a relative block delay. Only the default delay and role label differed. The coordinator also stored proposals without an explicit path because every implemented spend used the primary path. Enabling the delayed key without binding that choice to the persisted proposal could let signature counting, device selection, or broadcast validation use the wrong signer set.

## Decision

- New self-managed delayed wallets use one **Recovery** template. Setup offers reviewed discrete block-delay presets: 4,320 blocks by default, 13,140 blocks, or 26,280 blocks. Exact blocks are authoritative; calendar labels are approximate.
- **Assisted recovery** is a disabled Coming soon choice. A future design may add a recovery service and beneficiary workflow, but Groot does not imply that service exists today.
- Existing `inheritance` wallets and setup drafts remain compatible and retain their policy type, heir wording, descriptors, and 52,560-block delay. No profile, wallet metadata, backup, registry, or existing proposal is rewritten.
- An additive `groot_proposal_spend_paths` table binds a proposal to `primary` or `delayed`. A missing row means `primary`, preserving every existing proposal. The bound path determines eligible fingerprints and signature threshold.
- A delayed spend requires a recent chain tip, one unfrozen mature input, one external destination, the persisted delayed signer set, and its threshold. It is revalidated immediately before finalization so a reorg or stale tip fails closed. QR, file, and supported HWI PSBT transport share the same proposal validation boundary.
- A protection renewal remains a separate primary-path, one-input self-spend to a fresh internal output. It is optional; the UI does not imply that a mature coin is broken or expired.

## Consequences

The common self-managed mechanism has one honest setup name and a configurable wait, while existing inheritance wallets keep their original intent. Proposal restart and import cannot change the selected path, and unrelated keys cannot satisfy a delayed proposal. The schema evolution is additive and backward compatible. Funded Regtest proves the delayed branch and reorg boundary; device-specific Testnet4 certification is still required before claiming physical support for a model.
