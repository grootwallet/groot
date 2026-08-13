# Compact-filter deferred work

This is the canonical remaining-work checklist for Issue #7 after the deterministic Regtest certification on `codex/compact-filter-adversarial-certification`. Merging that branch makes the implemented test-network foundation available; it does **not** by itself close Issue #7 or authorize mainnet.

## Implemented foundation

- Explicit per-wallet confirmed-only compact-filter discovery, separate from the configured Core fee, mempool, recovery, and broadcast service.
- Verified Kyoto updates applied atomically with BDK state, address observation, provenance, notification markers, and wallet snapshots.
- Sanitized startup progress and failure state with the last verified wallet height.
- Locally broadcast software, external-signer, and multisig transactions persisted immediately as unconfirmed, including across restart.
- Deterministic Regtest evidence for happy path, restart, longer-chain reorg and re-anchor, valid BIP158 false positives, wallet isolation, commit rollback, notification idempotence, bounded peer failures, initial-handshake privacy, and mocked SOCKS5 no-fallback routing.

## Decisions required before more implementation

These are architectural choices, not routine follow-up patches:

1. **Kyoto adversarial-test boundary.** Prefer an upstream Kyoto test API or a reviewed upgrade that exposes deterministic post-handshake message injection. A narrowly maintained fork is the second choice. Adding another P2P parser or weakening Kyoto's verified-update boundary requires its own ADR, dependency review, and threat-model update.
2. **Durable public-chain index.** Pinned `bip157` 0.6.3 ignores `data_dir`, so headers, filter headers, and filters are memory-only. Before claiming a durable cache, select and review an upstream version/fork that persists it; define versioning, atomic replacement, owner-only permissions, corruption recovery, bounded growth, eviction, and migration behavior.
3. **Compact-filter recovery.** The current recovery scan intentionally uses Core. A compact-filter recovery design needs a trusted birthday checkpoint containing both height and block hash, gap-limit discovery, resumable progress, cancellation, restart semantics, and a decision about how checkpoints are obtained without creating a trusted central service. There must be no silent Core fallback.
4. **Broadcast transport.** Current broadcast is authenticated Core RPC; compact filters affect activity discovery only. If direct P2P broadcast becomes part of Issue #7, specify success semantics (submission versus relay observation), peer fan-out, Tor stream isolation, rebroadcast, rejection handling, privacy leakage, and explicit fallback consent before implementation. Do not silently fall back from P2P/Tor to Core or direct networking.

Record the selected outcomes in a new ADR or a superseding amendment before code changes. Dependency changes must follow the exact-pin and supply-chain rules in `engineering-standards.md`.

## Deterministic engineering still blocked on the Kyoto decision

- [ ] Invalid proof-of-work and discontinuous header chains produce no Groot update.
- [ ] Invalid or conflicting filter-header chains and compact-filter hashes produce no Groot update.
- [ ] Divergent multi-peer tips/data cannot advance the wallet without the library's required consensus checks.
- [ ] A wrong, malformed, or non-matching full block cannot mutate checkpoint, balance, history, provenance, or notification state.
- [ ] Unsolicited, duplicated, and out-of-order post-handshake messages remain bounded and non-mutating.
- [ ] Withheld headers, filters, and matching blocks terminate within bounded deadlines without partial persistence.
- [ ] If durable cache support is selected: truncated, substituted, oversized, incompatible-version, and corrupt cache cases recover safely or fail closed; disk growth is measured and bounded.
- [ ] If compact-filter recovery is selected: single-key, external-signer, and multisig birthday/gap scans pass funding, restart, cancellation, reorg, and clean-storage recovery tests.

Each adversarial test must assert both sides of the boundary: the peer/library result and the reopened Groot SQLite checkpoint, balance, history, provenance, and notification baseline.

## Public-network and platform evidence

Run Signet first and Testnet4 second using `public-network-rehearsal.md`. Use fresh test-only wallets and sanitized records.

- [ ] Record exact Groot commit, build network, Core/Kyoto versions, OS/device, peer-selection mode, required peer count, Tor version when applicable, start/end heights, elapsed time, transferred bytes, peak memory, and local disk delta.
- [ ] Demonstrate at least two independently administered peers from distinct netgroups; loss or disagreement of one peer must be visible and must not cause direct, DNS-seed, Core, or alternate-peer fallback in manual/Tor mode.
- [ ] Confirm startup progress remains monotonic and bounded, failure retains the prior verified snapshot, restart redownload behavior is disclosed, and a later successful retry advances exactly once.
- [ ] Confirm incoming confirmed activity, outgoing locally pending state, confirmation, shallow reorg, retained history, and exact re-anchor on both public test networks.
- [ ] Capture real Tor traffic at the host/network boundary: no local DNS for manual numeric peers, no direct peer connection after proxy rejection/loss, and documented stream-isolation behavior.
- [ ] Exercise local archival Core, local pruned Core, and authenticated remote archival Core as the separate fee/broadcast/recovery service. Record prune height, wallet checkpoint, whether required blocks remain available, IBD state, disk use, and filter-index state. Groot's Core RPC scan does not require `blockfilterindex`; Bitcoin Core's own BIP157 peer service does.
- [ ] Certify foreground, suspend/resume, network change, interruption, retry, low-storage, and app-restart behavior on packaged macOS desktop.
- [ ] Repeat lifecycle, secure-storage, memory, background-time, and network-permission checks separately on physical iOS and Android devices before claiming those platforms.

Never place peer IPs, wallet addresses, descriptors, xpubs, fingerprints, transaction IDs, RPC credentials, or Tor identifiers in committed evidence. Keep sensitive raw captures local and commit only a sanitized summary.

## Issue #7 completion gate

Issue #7 can be marked complete only when:

- [ ] One reviewed Kyoto strategy resolves or explicitly scopes every deterministic blocked case above.
- [ ] Durable-cache and compact-filter-recovery claims match what is actually implemented; unsupported capabilities remain explicitly out of scope in product copy.
- [ ] The broadcast architecture is explicitly recorded as Core-only or its reviewed P2P replacement is fully certified.
- [ ] Signet and Testnet4 peer-diversity, bandwidth, storage, restart, reorg, and outgoing-transaction evidence is attached to the exact candidate commit.
- [ ] Real-Tor no-DNS/no-direct-fallback evidence is complete.
- [ ] Every claimed desktop/mobile platform has lifecycle evidence; untested platforms remain unclaimed.
- [ ] `pnpm validate`, strict Rust checks, the isolated funded Regtest harness, and relevant public-network smoke tests are green on the final commit.
- [ ] `architecture.md`, `flows.md`, `implementation-status.md`, `testing.md`, the applicable ADRs, threat model, and release checklist all describe the same boundary.

Branch merge and issue closure are separate decisions. Until this checklist is complete, compact-filter synchronization remains an optional confirmed-only test-network feature with Core retained for fee estimation, mempool-dependent operations, recovery, and broadcast.
