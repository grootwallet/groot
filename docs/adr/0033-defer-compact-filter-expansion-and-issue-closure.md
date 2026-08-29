# ADR 0033: Defer compact-filter expansion and Issue #7 closure

## Status

Accepted as a clarification and partial supersession of ADR 0031's shared-cache expectation. ADR 0032's verified-update and certification boundary remains unchanged.

## Context

The deterministic Regtest foundation now covers Groot-owned compact-filter configuration, bounded execution, sanitized progress, atomic application, locally persisted outgoing pending transactions, restart, reorganization/re-anchor, valid false positives, working-directory substitution, initial-handshake privacy, mocked Tor routing, and notification behavior.

Pinned `bdk_kyoto` 0.17.0 uses `bip157` 0.6.3, whose builder accepts but does not use `data_dir`. The public header/filter index is therefore memory-only. ADR 0031's phrase “uses a shared public chain cache” describes the intended architecture, not the behavior of the pinned dependency, and its cache-corruption evidence cannot be claimed in this version.

Kyoto also owns post-handshake parsing and validation. Groot cannot honestly inject invalid proof-of-work/header chains, filter-header conflicts, divergent peer data, wrong matching blocks, or reordered/withheld protocol messages without an upstream test API, reviewed dependency upgrade, or maintained fork. Compact-filter recovery and direct P2P broadcast would independently change trusted-checkpoint, fallback, relay-success, privacy, and lifecycle semantics.

## Decision

- Merge eligibility for the existing test-network foundation is separate from Issue #7 closure.
- Keep the current behavior confirmed-only. Core remains the explicit separate service for fee estimation, mempool-dependent operations, recovery scans, and broadcast.
- Make no durable shared-cache claim while the pinned dependency keeps its public index in memory. The owner-only directory remains reserved for a future reviewed implementation.
- Keep compact filters visibly experimental in desktop test-network builds and unavailable on iOS/Android. Mobile must hide the selector, avoid automatic scans, exclude compact-filter setup reuse, and reject direct native save/adopt/sync attempts until durable resumability, an authenticated height-and-hash scan start, and physical-device evidence are complete.
- Do not implement compact-filter recovery or direct P2P broadcast without an explicit recorded design. Neither may introduce an implicit Core, direct-network, DNS-seed, or alternate-peer fallback.
- Select an upstream Kyoto test API or reviewed upgrade before deterministic post-handshake adversarial certification. A narrowly maintained fork is a second choice; a second P2P parser requires a separate threat-model and architecture decision.
- Track the complete implementation decisions, deterministic cases, public-network measurements, platform evidence, and Issue #7 completion criteria in [`compact-filter-deferred-work.md`](../compact-filter-deferred-work.md).

## Consequences

Merging the foundation makes an experimental desktop-only confirmed-activity test-network backend available but does not close Issue #7, expose it on mobile, enable mainnet, certify production privacy, or imply durable cache, resumable initial progress, authenticated pairing checkpoints, compact-filter recovery, or P2P broadcast support.

Signet, Testnet4, real-Tor, packaged macOS, physical iOS, and physical Android evidence remain required for any corresponding claim. Untested platforms remain unclaimed. Dependency changes remain exact-pinned and require supply-chain review.

References: #7, ADR 0031, ADR 0032.
