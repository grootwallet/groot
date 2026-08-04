# ADR 0003: Regtest → Signet → Testnet4 network strategy

- Status: accepted
- Date: 2026-07-17

## Context

Development needs both deterministic large histories and realistic remote-chain behavior. No single public test network provides both reliably.

## Decision

Use regtest for automated scenarios and dense transaction fixtures, Signet for the first hosted Esplora/fee/broadcast integration, and Testnet4 for a final public-network rehearsal. Mainnet remains disabled.

## Consequences

Configuration must be network-aware and tests must reject cross-network addresses. Fixtures are generated on regtest rather than relying on public history. Explorer and API links are derived from configuration, never hard-coded in components.
