# ADR 0070: Use server-side script scanning for remote Core

- Status: accepted for internal testing; live gateway deployment and release evidence pending
- Date: 2026-09-17
- Supersedes: ADR 0067's no-script remote discovery boundary
- Extends: ADR 0009, ADR 0031, ADR 0061, and ADR 0067

## Context

Client-side full-block and BIP158-filter downloads over authenticated remote
HTTPS produced unacceptable latency for a Mainnet wallet only 135 blocks behind
the node. The product owner explicitly accepts disclosure of public wallet
queries to a trusted remote service in exchange for normal indexed-wallet UX.
Peer-served compact filters remain the separate privacy-oriented sync option.

Bitcoin Core provides `scanblocks`, which uses its basic block-filter index to
return block hashes that may match supplied scan objects. Bitcoin Core 29 adds
`getdescriptoractivity`, which pairs with that result and can return only
matching mempool activity. Together they avoid transferring every filter,
unrelated block, or unrelated public mempool transaction while retaining
Groot's own transaction interpretation and atomic wallet database.

## Decision

For an explicitly configured `RemoteCore` activity source, Groot sends a
bounded, deduplicated set of derived public output scripts as `raw(script)`
scan objects to `scanblocks`. It never sends private descriptors, xprvs,
mnemonics, labels, wallet names, PSBTs, or signing material. The remote node can
associate every queried script, matching block, mempool lookup, IP address, and
authenticated principal with the wallet.

The gateway accepts only `scanblocks` action `start`, one to 4,096 bounded raw
scripts, an ordered bounded height range, and filter type `basic`. Status,
abort, address/key descriptors, options, and arbitrary scan forms remain
denied. It accepts `getdescriptoractivity` only with no confirmed block list,
the same bounded raw scripts, and mempool inclusion enabled. Remote mode
therefore requires Bitcoin Core 29 or newer, a fully synced basic block-filter
index, and both exact least-privilege RPC methods; it fails clearly rather than
silently falling back to full-block or full-mempool downloads.

Groot independently obtains the active block-hash range, rejects returned
matches outside that range, downloads the full contents of matching blocks,
checks their hashes and predecessor links, rechecks the active start and target
hashes, and fetches only the matching mempool transaction identifiers and raw
transactions. It applies the complete checkpoint, relevant transactions, and
pending evictions in the existing atomic commit. Fee estimation, broadcast,
wallet formats, and signing boundaries are unchanged.

Local Core keeps the current local filter/full-block behavior. The explicit
P2P compact-filter source remains separate and does not disclose wallet scripts
to the configured RPC service.

## Consequences

Remote sync is faster and operationally simpler for the chosen trusted-server
mode, but it is no longer private from that operator. Settings must disclose
this before the user selects or saves a remote node. The shared gateway can
observe public script queries even though request logging remains disabled.

The live gateway and Core whitelist must deploy `scanblocks` and
`getdescriptoractivity` before the new client is usable. Multi-client scan concurrency, timeout/cancellation,
rate-limit capacity, and exact Mainnet timing require live evidence before GA.
This decision changes no persisted data and requires no migration.
