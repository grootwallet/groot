# Public test-network rehearsal

This runbook produces network-specific desktop builds without enabling mainnet. Signet and Testnet4 have distinct application identifiers and storage. Never reuse a Regtest certification profile, RPC password, seed, descriptor, or evidence artifact between them.

## Prerequisites

- Run a fully synced Bitcoin Core node on the intended chain with RPC bound only to loopback, or use the separately reviewed TLS/Tor Core configuration.
- Configure a unique RPC username and high-entropy password outside this repository. Do not put credentials in shell history, `.env` files, screenshots, or evidence records.
- Confirm the node reports the intended chain and preserve the exact Groot commit, Core version, build command, and sanitized timestamps in the evidence record.

## Launch

From the repository root with the pinned Node and Rust toolchains:

```sh
pnpm dev:native:signet
```

or:

```sh
pnpm dev:native:testnet4
```

The trusted build defaults to loopback RPC port `38332` for Signet and `48332` for Testnet4. In **Settings → Bitcoin Core node**, enter protected username/password credentials and use **Save & test**. Public-network builds reject Groot's Regtest cookie shortcut. Rust verifies both Core's reported chain and the exact compiled-network genesis before sync work.

## Required suite

Use fresh, non-sensitive test wallets and record only sanitized results:

1. Create a 24-word single-key wallet, verify backup, receive funds, restart, sync, send, confirm, and delete.
2. Recover the wallet from its independently retained words and passphrase; compare descriptor checksum and full balance/history without recording either secret.
3. Create and restore a 2-of-3 descriptor backup; verify receive addresses and complete sequential PSBT import, finalization, broadcast, restart, and confirmation.
4. Exercise wrong-network recipient, wrong-chain Core, stale/unreachable Core, invalid credentials, fee-estimation failure, and rejected broadcast. Each must fail closed without mutating the persisted proposal.
5. On Testnet4, additionally record RBF replacement, CPFP package confirmation, a one-block reorg, mempool restoration, and reconfirmation.

The checklist remains blocked until the complete live suites are recorded. Successful compilation or Regtest tests are supporting evidence only, not substitutes for public-chain execution.
