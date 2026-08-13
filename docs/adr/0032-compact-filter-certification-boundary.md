# ADR 0032: Compact-filter certification boundary

## Status

Accepted as a clarification of ADR 0031. It does not enable mainnet or replace Kyoto.

## Context

Certification work for Issue #7 must distinguish Groot-owned behavior from behavior that can only be injected inside the pinned `bdk_kyoto` 0.17.0 / `bip157` 0.6.3 stack. Groot owns peer/configuration policy, the bounded runtime, the decision to apply only a completed Kyoto `Update`, and the atomic wallet/provenance/notification transaction. Kyoto owns Bitcoin P2P framing, header proof-of-work and continuity checks, filter-header consensus, compact-filter validation, matching-block validation, peer conflict handling, and the update construction.

The pinned `bip157` builder accepts a `data_dir`, but 0.6.3 currently discards that value when constructing its node. Header, filter-header, and filter state are therefore memory-only. Groot's shared network directory is a reserved, owner-only working directory, not a durable public-chain cache. Corrupt/truncated Kyoto cache repair and cache-growth claims are not applicable until upstream persists data.

The pinned dependency also contains a debug-assertion-only macro that prints diagnostics directly to stdout. Those diagnostics can include peer endpoints and matching block hashes. Groot disables debug assertions specifically for the pinned `bip157` package in Cargo's development and test profiles; release builds already omit the path. Groot drains Kyoto's structured info/warning channels and maps only connection counts, weighted overall percentage, public chain height, and coarse lifecycle states into a sanitized status DTO. It never forwards peer addresses, raw warnings, block hashes, scripts, or descriptors to the webview.

## Decision

- Keep Kyoto exact-pinned and keep its P2P parser and verified-update boundary intact.
- Add only a narrow timeout seam around the existing builder so deterministic local peers can disconnect, stall, or send malformed pre-handshake bytes without implementing another Bitcoin parser.
- A failed or timed-out peer session returns no `Update`; tests assert that the caller's checkpoint and balance remain unchanged.
- Prepare the reserved shared working directory as a real owner-only directory and reject final-component file or symlink substitution before starting Kyoto.
- Run funded Regtest certification through Bitcoin Core's real BIP157/BIP158 service. The test persists a confirmed transaction, reopens the wallet, builds a longer alternate chain without the transaction, proves retained unconfirmed history, and then proves one correct re-anchor without duplication.
- Search a bounded disposable Regtest chain for a mathematically valid BIP158 false-positive against a large deterministic script set, verify the selected block contains none of those scripts, then let Kyoto fetch and validate it and prove BDK creates no transaction or balance.
- Do not expose dependency diagnostics to the webview. Keep the package-specific debug-output suppression in development and test builds. Do not claim durable cache integrity, conflicting-peer coverage, or complete hostile-message certification from these tests.
- Persist Groot's own successfully broadcast transaction as unconfirmed in the same SQLite transaction as proposal completion, intent/replacement metadata, and notification state. Compact-filter mode still makes no claim that it can discover unrelated incoming mempool transactions.

## Consequences

Groot has deterministic evidence for its fail-closed integration boundary, funded reorganization/restart behavior, false-positive safety, two-wallet graph isolation, notification idempotence, directory substitution rejection, initial-handshake identifier non-disclosure, SOCKS5 routing without direct fallback, and rollback after every wallet/application commit stage. The certification remains incomplete for invalid proof-of-work/header chains, filter-header conflicts, divergent multi-peer data, wrong matching blocks, unsolicited/duplicated/out-of-order post-handshake messages, and withheld headers/filters/blocks. Compact-filter recovery mode is also not wired: the current recovery flow remains an explicit Core rescan, and Groot's recovery setting stores a height while Kyoto requires a verified height-and-hash checkpoint. Birthday/gap/single-key/multisig/restart/reorg recovery certification therefore cannot be attributed to compact filters. Those cases require an upstream Kyoto test API or a reviewed minimal injection seam inside Kyoto; replacing Kyoto or adding a second P2P implementation requires separate approval.

Groot-owned development, test, and release output remains free of the dependency's direct debug prints, but physical Signet, Testnet4, real-Tor, desktop, iOS, and Android privacy/lifecycle evidence remains external. The loopback SOCKS5 fixture proves exact numeric-peer routing, visible proxy failure, no direct connection, and no wallet mutation; it is not a network-level DNS-capture or stream-isolation certification. One reachable peer remains an explicitly degraded trust/privacy condition, and requesting a matching full block can reveal interest in a height.

References: #7 and ADR 0031.
