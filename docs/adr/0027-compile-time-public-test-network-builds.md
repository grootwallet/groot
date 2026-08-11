# ADR 0027: Compile-time public test-network builds

- Status: accepted
- Date: 2026-08-11

## Context

The browser presentation supported Regtest, Signet, and Testnet4, while the trusted Rust wallet was fixed to Regtest. Changing only an RPC URL would leave wallet metadata, backups, address validation, hardware-wallet chain selection, and transaction summaries on the wrong network. A runtime environment switch would also make a distributed binary's network identity harder to audit.

## Decision

The native network is selected at compile time by `GROOT_BUILD_NETWORK`, with an allowlist containing exactly `regtest`, `signet`, and `testnet4`. The default remains Regtest. Any other value fails the Rust build, and Bitcoin mainnet has no selectable constant. CI compiles every allowed value.

Signet and Testnet4 use dedicated Tauri configurations and application identifiers, so their registries, databases, protected RPC credentials, and process locks cannot collide with Regtest or with each other. Public-network builds require explicit username/password Core authentication; Groot's automatic cookie discovery remains confined to its isolated Regtest node. The matching frontend mode is part of each Tauri configuration.

## Consequences

Wallet profiles, backups, proposal DTOs, address checks, exact genesis checks, HWI chain arguments, and default loopback RPC ports now derive from one trusted compile-time identity. A registry containing another network fails closed before a wallet is opened. Mainnet remains disabled by ADR 0012 and the separate trusted release policy; enabling it requires a superseding ADR and cannot be achieved through `GROOT_BUILD_NETWORK`.

Public-network binaries are rehearsal artifacts, not mainnet candidates. Live Signet and Testnet4 workflows still require external Core nodes, funded coins, and recorded manual evidence.
