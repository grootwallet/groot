# ADR 0032: Compact-filter certification boundary

## Status

Accepted as a clarification of ADR 0031. It does not enable mainnet or replace Kyoto.

## Context

Certification work for Issue #7 must distinguish Groot-owned behavior from behavior that can only be injected inside the pinned `bdk_kyoto` 0.17.0 / `bip157` 0.6.3 stack. Groot owns peer/configuration policy, the bounded runtime, the decision to apply only a completed Kyoto `Update`, and the atomic wallet/provenance/notification transaction. Kyoto owns Bitcoin P2P framing, header proof-of-work and continuity checks, filter-header consensus, compact-filter validation, matching-block validation, peer conflict handling, and the update construction.

The pinned `bip157` builder accepts a `data_dir`, but 0.6.3 currently discards that value when constructing its node. Header, filter-header, and filter state are therefore memory-only. Groot's shared network directory is a reserved, owner-only working directory, not a durable public-chain cache. Corrupt/truncated Kyoto cache repair and cache-growth claims are not applicable until upstream persists data.

The pinned dependency also prints debug diagnostics directly to stdout when Rust debug assertions are enabled. Those diagnostics can include peer endpoints and matching block hashes. Release builds omit them, but debug builds do not meet Groot's sensitive-match logging gate.

## Decision

- Keep Kyoto exact-pinned and keep its P2P parser and verified-update boundary intact.
- Add only a narrow timeout seam around the existing builder so deterministic local peers can disconnect, stall, or send malformed pre-handshake bytes without implementing another Bitcoin parser.
- A failed or timed-out peer session returns no `Update`; tests assert that the caller's checkpoint and balance remain unchanged.
- Prepare the reserved shared working directory as a real owner-only directory and reject final-component file or symlink substitution before starting Kyoto.
- Run funded Regtest certification through Bitcoin Core's real BIP157/BIP158 service. The test persists a confirmed transaction, reopens the wallet, builds a longer alternate chain without the transaction, proves retained unconfirmed history, and then proves one correct re-anchor without duplication.
- Search a bounded disposable Regtest chain for a mathematically valid BIP158 false-positive against a large deterministic script set, verify the selected block contains none of those scripts, then let Kyoto fetch and validate it and prove BDK creates no transaction or balance.
- Do not expose dependency diagnostics to the webview. Do not claim debug-log privacy, durable cache integrity, conflicting-peer coverage, or complete hostile-message certification from these tests.

## Consequences

Groot has deterministic evidence for its fail-closed integration boundary, funded reorganization/restart behavior, false-positive safety, two-wallet graph isolation, notification idempotence, directory substitution rejection, and initial-handshake identifier non-disclosure. The certification remains incomplete for invalid proof-of-work/header chains, filter-header conflicts, divergent multi-peer data, wrong matching blocks, unsolicited/duplicated/out-of-order post-handshake messages, and withheld headers/filters/blocks. Compact-filter recovery mode is also not wired: the current recovery flow remains an explicit Core rescan, so birthday/gap/single-key/multisig/restart/reorg recovery certification cannot be attributed to compact filters. Those cases require an upstream Kyoto test API or a reviewed minimal injection seam inside Kyoto; replacing Kyoto or adding a second P2P implementation requires separate approval.

Release-mode logging remains free of the dependency's debug prints, but physical/debug Signet, Testnet4, Tor, desktop, iOS, and Android privacy/lifecycle evidence remains external. One reachable peer remains an explicitly degraded trust/privacy condition, and requesting a matching full block can reveal interest in a height.

References: #7 and ADR 0031.
