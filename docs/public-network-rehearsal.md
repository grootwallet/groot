# Public test-network rehearsal

This runbook produces network-specific desktop builds without enabling mainnet. Signet and Testnet4 have distinct application identifiers and default storage roots. Version-3 encrypted wallet profiles are portable by design, but a rehearsal must copy them only as an explicit relocation test and must never open one storage root concurrently from two processes. Never reuse a Regtest certification profile, RPC password, seed, descriptor, or evidence artifact between networks.

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

The trusted build defaults to loopback RPC port `38332` for Signet and `48332` for Testnet4. A wallet with no saved node configuration must unlock without requiring nonexistent RPC credentials. In **Settings → Bitcoin Core node**, enter protected username/password credentials and use **Save & test**. Groot encrypts the validated route and RPC password inside that wallet's portable credential-encrypted envelope; it does not use a platform Keychain. Public-network builds reject Groot's Regtest cookie shortcut. Rust verifies both Core's reported chain and the exact compiled-network genesis before sync work.

## Required suite

Use fresh, non-sensitive test wallets and record only sanitized results:

1. Create a 24-word single-key wallet, verify backup, receive funds, restart, unlock without a platform-keystore prompt, sync, send, confirm, and delete.
2. Recover the wallet from its independently retained words and passphrase; compare descriptor checksum and full balance/history without recording either secret.
3. Create and restore a 2-of-3 descriptor backup; verify receive addresses and complete sequential PSBT import, finalization, broadcast, restart, and confirmation.
4. Exercise wrong-network recipient, wrong-chain Core, stale/unreachable Core, invalid credentials, fee-estimation failure, and rejected broadcast. Each must fail closed without mutating the persisted proposal.
5. Copy a closed disposable encrypted profile into a separate application-data root. Confirm correct-credential relocation, wrong-credential rejection, corruption failure without source mutation, and authenticated v2-to-v3 migration where a v2 fixture is available.
6. On Testnet4, additionally record RBF replacement, CPFP package confirmation, a one-block reorg, mempool restoration, and reconfirmation.

The same-machine Core command, build identity check, exact connection fields, and ordered storage/payment drill are specified in [the Testnet4 portable-storage rehearsal](pre-mainnet-test-runbook.md#2a-testnet4-portable-storage-and-core-rehearsal).

## Compact-filter Issue #7 suite

Run this section only after choosing the peer set and, for the adversarial cases, the Kyoto strategy recorded in [`compact-filter-deferred-work.md`](compact-filter-deferred-work.md). Compact filters remain confirmed-only; keep the separately configured Core service visible for fees, recovery, mempool-dependent operations, and broadcast.

1. On Signet, select at least two independently administered peers in distinct netgroups. Record sanitized peer diversity, start/end heights, elapsed time, transferred bytes, peak memory, and local disk delta. Do not commit peer addresses.
2. Start from a durable wallet checkpoint, restart Groot, and confirm the UI discloses and completes the pinned engine's public-filter redownload while retaining the prior verified snapshot until atomic application.
3. Receive and confirm a payment, broadcast an outgoing transaction through Core, immediately confirm its locally persisted pending state, restart before confirmation, then confirm it and verify exact accounting.
4. Remove one peer, stall the proxy, interrupt the app, and change networks during sync. Each failure must be bounded, retain the last verified height, and avoid direct, DNS-seed, Core, or alternate-peer fallback in manual/Tor mode.
5. With a real loopback Tor daemon and host/network capture, prove numeric manual peers create no local DNS lookup and proxy rejection/loss creates no direct connection. Record stream-isolation behavior without identifiers.
6. Repeat on Testnet4 and include a shallow reorg with retained transaction history and one exact re-anchor.
7. Exercise packaged macOS suspend/resume, low-storage, retry, and restart behavior. Repeat separately on physical iOS/Android before claiming those platforms.
8. Run the Core service matrix independently: local archival, local pruned, and authenticated remote archival. Record prune height versus wallet checkpoint, IBD, disk use, and filter-index state. Do not imply that Groot's Core RPC scan needs `blockfilterindex`.

Use the Issue #7 completion gate in [`compact-filter-deferred-work.md`](compact-filter-deferred-work.md) for sign-off. A successful public smoke test does not substitute for the blocked deterministic post-handshake adversarial cases.

The checklist remains blocked until the complete live suites are recorded. Successful compilation or Regtest tests are supporting evidence only, not substitutes for public-chain execution.
