# ADR 0049: BIP329 label interchange and native explorer opening

Status: Accepted

## Context

Groot's permanent label history is richer than BIP329, while users need a portable, explicit interchange file that does not change the encrypted profile or public-backup formats. A normal web anchor also does not reliably open the system browser from a packaged Tauri webview. Both operations cross native privacy boundaries and must remain user-mediated.

The primary interchange specification is the official [BIP329 wallet label export format](https://github.com/bitcoin/bips/blob/master/bip-0329.mediawiki), including its JSONL schema and reference vector.

## Decision

- Settings exports and imports a separate UTF-8 BIP329 JSONL file through Rust-owned native file dialogs. The profile, proposal, registry, and public-backup formats remain compatible.
- Standard export maps only permanent address (`addr`), known wallet transaction (`tx`), wallet output (`output`), and saved public signer (`xpub`) labels. Records are compact JSON, deterministically ordered by type, reference, and label, and end with LF. Payment intents without a transaction, policy names/descriptors, privacy-cluster identities, replacement lineage, and standalone input provenance are not represented; Groot does not invent extension record types.
- Export is explicit and warns that labels plus public references reveal wallet history. It contains no PSBT, credential, mnemonic, private descriptor, private key, or RPC secret, and rejects private extended-key material found at the interchange boundary.
- Import is Rust-owned, at most 1 MiB, 10,000 records, and 8 KiB per line. It validates UTF-8, JSON object shape, BIP329 fields, reference types, exact address network, current-wallet ownership, current signer public keys, and output spendability before mutation. Unknown standard record types and records without a label do not mutate Groot.
- Import uses one SQLite transaction. Repeated records are idempotent. New labels are appended to immutable subject history up to the existing twelve-label cap; they never replace or erase an assignment. Foreign references, signer-name conflicts, contradictory spendability, or capacity conflicts roll back the entire import.
- Cross-platform label interchange is a portable metadata foundation, not wallet synchronization, key synchronization, conflict-free replication, or authority delegation.
- Public explorer opening accepts only a transaction ID. Rust constructs the exact `https://mempool.space/testnet4/tx/<txid>` or `https://mempool.space/signet/tx/<txid>` URL and delegates it to the OS through the reviewed Tauri opener plugin. Regtest and every unapproved network have no URL. Browser fixtures use the same pure URL policy with `window.open`; packaged code never accepts an arbitrary URL from the renderer.

## Consequences

Users can move the representable label subset without migrating or weakening existing profiles. Additive imports may increase a subject's truthful history, and conflicts fail without partial changes. The JSONL file is public wallet metadata and must be handled privately. Native explorer failures are durable inline errors plus toasts rather than dead links. Future phone-key coordination may reuse BIP329 files, but any live synchronization protocol requires a separate threat model and ADR.
