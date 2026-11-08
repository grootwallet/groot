# ADR 0110: Test-network Taproot receiving

- Status: implemented for development and rehearsal, pending physical acceptance
- Date: 2026-11-08

## Context

The wallet owner requested explicit Taproot receiving while preserving the existing default and every existing wallet's descriptor identity. Standard hardware signing and SegWit-v0 Miniscript evidence establish no Taproot signer capability. Prior Mainnet release decisions cover specific wallet families and builds.

## Decision

Keep Native SegWit as the software default. A newly created or restored software profile can explicitly choose single-key Taproot on macOS Regtest and Testnet4. It uses BIP86 account 0 with a key-only `tr()` descriptor, external branch 0 and change branch 1. Use the existing atomic receive and permanent-label transaction and the normal native PSBT review and broadcast path. The BIP86 branch origins are included in PSBT-derived review details.

Groot exports a checksummed public receive/change multipath descriptor. Taproot software recovery compares that exact descriptor with the two branches derived from the native 24-word input and the exact passphrase before committing a profile. Existing native backup sheets, deferred word verification, encryption and credential throttling retain their role. Only the public descriptor crosses the IPC boundary. A descriptor reveals related addresses, so the backup flow discloses its privacy implications.

Existing profiles retain their exact receive and change descriptors. No registry or database schema, encrypted mnemonic envelope or existing backup format changes. Native SegWit recovery continues to accept words and passphrase. Software Taproot profiles require this descriptor-aware implementation when opened in Groot and can be recovered in an independent implementation using the same BIP86 account and credentials. A descriptor does not recover local labels.

## Fixed Continuity rehearsal

Regtest admits fixed Partner and Family Taproot templates through the native coordinator for software-signer rehearsal. The desktop Regtest setup keeps Native SegWit selected by default and offers a Taproot choice for fixed templates. Taproot setup accepts only manual software accounts, shows the exact first address for independent comparison and saves the native-generated Groot JSON backup before creation. Each existing named condition is a separate Miniscript leaf. The deterministic internal key is the public NUMS point in BIP341, so there is no usable key-path bypass. The stable point simplifies independent derivation. A revealed control block exposes that point when spending.

| Template | Immediate         | 13,140 blocks                           | 39,420 blocks      | 52,560 blocks                                                           |
| -------- | ----------------- | --------------------------------------- | ------------------ | ----------------------------------------------------------------------- |
| Partner  | 2 of 3 owner keys | Both partner keys                       | Either partner key | 2 of 3 estate keys                                                      |
| Family   | Both parent keys  | One parent and one child-assistance key |                    | 2 of 3 inheritance keys, including the executor among the eligible keys |

Only explicitly entered public accounts for offline software signing are in scope. Their account uses the Groot rehearsal path `m/48'/1'/0'/3'`, separate from BIP48 P2WSH. Each named path binds the exact descriptor-derived leaf, control block, canonical prevouts, signer origins and sequence before the coordinator accepts verified Schnorr signatures. Existing role, maturity, reorg and finalization checks apply. Renewal uses the immediate leaf. Taproot Continuity acceleration and direct USB, phone, virtual, and hardware enrolment remain unavailable. A manually entered public key alone establishes no physical device identity.

Groot JSON contains both exact descriptors and fixed role metadata. Groot derives the first receive address from that verified pair for comparison during setup and restore. Distinct recovery template tags, `partner_continuity_taproot_v1` and `family_continuity_taproot_v1`, make older builds reject the new sidecar and backup. Existing exports keep their original template tags. Restoring a Taproot policy requires a descriptor-aware Groot build in isolated Regtest. The P2WSH templates and their existing data retain their original semantics.

## Activation and release

Mainnet BIP86 derivation is checked against the standard vector. Mainnet activation requires a separate ADR, threat-model review, exact-candidate evidence and explicit release authorization. Native mobile and hardware Taproot signing require their own evidence before admission. The current evidence and physical rehearsal are recorded in [Taproot receiving verification](../testing/taproot-receiving.md).
