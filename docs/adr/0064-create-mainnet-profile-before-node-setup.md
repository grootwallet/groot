# ADR 0064: Create a mainnet profile before node setup

- Status: accepted for the isolated certification candidate; distribution remains blocked
- Date: 2026-09-12
- Supersedes: ADR 0055 and ADR 0056 only where they require Core admission before creating a new empty wallet database
- Extends: ADR 0037, ADR 0052, ADR 0061, ADR 0062, and ADR 0063

## Context

Requiring RPC credentials inside wallet creation and recovery couples key backup
to network setup and prevents an offline encrypted profile. Creating a
descriptor-bound empty SQLite file does not read or trust chain data. Opening it
for balance, history, address, coin, proposal, or transaction work does.

## Decision

The isolated Mainnet candidate may create the new wallet's empty database and
encrypted secret envelope before Bitcoin Core is configured. The typed
selected-wallet database permit remains mandatory for every later wallet-data
read and mutation. It is issued only after the selected wallet has an
authenticated, exact-chain Core session admitted under the existing loopback
HTTP or direct-HTTPS policy.

RPC fields are removed from creation and recovery. An unconfigured wallet
unlocks normally, then presents the network-setup action before wallet data can
load. A valid same-network setup may be revalidated and encrypted as an
independent per-wallet copy, including on Mainnet.

The first history scan starts automatically after Core is ready. A generated
wallet uses the current verified tip by default; recovery uses full history. The
no-credential path exists only before the first successful sync. Later scan
settings and full rescans still require the wallet credential. Manual birthday,
gap-limit, and full-history controls remain in Settings.

## Compatibility and consequences

Wallet, database, registry, descriptor, proposal, backup, node-config, and
secret-envelope formats are unchanged; no migration is required. Exact-node
admission remains mandatory before any Mainnet chain-derived wallet state is
available. ADR 0061 remote Core evidence remains blocking.
