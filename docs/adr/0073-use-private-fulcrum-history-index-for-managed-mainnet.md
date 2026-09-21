# ADR 0073: Use a private Fulcrum index for managed Mainnet history

- Status: accepted for internal testing; live cutover and release evidence pending
- Date: 2026-09-21
- Supersedes: ADR 0070 for the fixed Groot-managed endpoint only
- Extends: ADR 0061, ADR 0067, ADR 0070, and ADR 0071

## Context

Bitcoin Core `scanblocks` removes full-block transfer but still scans every
compact filter in the requested birthday range for each new wallet. That is
acceptable for incremental refresh and deterministic recovery evidence, but a
newly imported Mainnet hardware wallet with old history can remain in its first
scan for minutes. Electrum-style servers maintain an address/script index and
answer the same history discovery in near-constant lookup time.

The managed service already runs an archival, fully validating Bitcoin Core
node. Replacing Core would weaken the established chain, fee, mempool, and
broadcast boundary. Exposing a public Electrum port would add a second
unauthenticated surface and bypass the gateway's per-wallet credentials,
bounds, and rate limits.

## Decision

The fixed Groot-managed Mainnet service runs pinned Fulcrum beside the existing
Bitcoin Core node. Fulcrum reads the same validated block data and listens only
on loopback. The authenticated HTTPS gateway exposes one versioned,
Groot-specific history method accepting at most 256 unique lowercase Electrum
script hashes per call and returning at most 10,000 bounded history entries.
Raw Electrum TCP, Fulcrum administration, subscriptions, fee estimation, and
broadcast are never exposed.

Groot derives BIP84/BIP48 scripts locally and queries them adaptively until the
wallet's configured gap limit is satisfied, with a hard 4,096-script ceiling.
The client requires the index tip to equal the independently observed Core tip.
It then resolves each claimed height through Core, downloads each matching full
block from Core, and rejects the response unless every claimed transaction is
actually present in its claimed active-chain block. BDK continues to derive
balances and transaction state locally. Mempool activity, fees, and broadcast
continue through their existing narrow Core RPCs.

The index is an availability and omission trust boundary, not a source of
consensus truth. A malformed, stale, excessive, or unavailable index fails
closed. Groot does not silently fall back to a long `scanblocks` operation on
the managed route. User-configured remote Core keeps ADR 0070's `scanblocks`
path, and local Core keeps its current filter/full-block path.

The managed service can associate the authenticated principal, IP/timing, and
queried script hashes with wallet history. Product copy must disclose this and
must not claim that all wallet data stays local. Recovery words, private keys,
hardware secrets, labels, wallet names, and signing material remain local and
are never sent to Fulcrum, the gateway, or Core.

## Consequences

Existing wallet, profile, credential, node-setting, descriptor, proposal,
backup, and database formats do not change; no migration is required. The
existing archival Core data is reused, but Fulcrum requires its own derived
index and additional disk/RAM. Initial server indexing completes before
cutover. The exact client and gateway candidate must pass stale-index,
malformed-response, wrong-chain, reorg, restart, recovery, fee, broadcast,
route-observation, rate-limit, and no-fallback tests before GA.

Rollback disables the gateway history method and restores the previous client;
it never exposes Fulcrum publicly or changes Core wallet data.
