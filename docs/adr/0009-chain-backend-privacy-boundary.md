# ADR 0009: chain backend and privacy boundary

- Status: accepted incrementally; compact-filter deferral superseded by ADR 0031
- Date: 2026-08-03
- Extends: ADR 0003

## Context

A remote Bitcoin Core node and a public Esplora indexer have different trust and privacy properties. Calling either one “trusted” would hide operator access to wallet queries. Embedding RPC credentials in a URL also leaks them through configuration and error surfaces. Client-side compact block filters may later reduce address-query leakage, but their transport and peer model require a separate threat review.

## Decision

Regtest uses loopback Bitcoin Core and cookie authentication. The configuration model distinguishes local Core, remote Core, and Esplora. Remote endpoints require HTTPS; URLs containing credentials are rejected. Curated Esplora entries are convenience presets with exact endpoint matching, not trust endorsements. Remote Core authentication will be stored separately through the platform secret boundary.

Peer-served client-side block filters are deferred. Before implementation, specify peer diversity/eclipse resistance, filter-header verification, Tor/proxy behavior, bandwidth, false-positive fetching, reorg handling, mobile background limits, and comparison against Bitcoin Core's supported compact-filter protocol. No central filter service is assumed by this ADR.

## Consequences

Only local Core is a live sync backend now. Signet is the next public integration target. The settings UI must explain metadata exposure before enabling a remote indexer. Mainnet remains disabled.
