# ADR 0031: Optional private networking and Payjoin V2 gates

## Status

Accepted for the compact-filter backend and Payjoin V2 protocol foundation. Payjoin transport, sender/receiver sessions, and production claims remain gated.

## Context

Bitcoin Core RPC gives Groot complete confirmed and mempool wallet state, fee estimates, and broadcast through one explicitly trusted service. Issue #7 asks for a lower-query-leakage alternative using peer-served BIP157/BIP158 compact block filters. Issue #10 asks for asynchronous Payjoin V2 through Payjoin Dev Kit (PDK) 1.0. Both features change the privacy and adversarial-network boundary; neither may become an implicit fallback or a marketing claim merely because a dependency compiles.

Kyoto 0.17 uses verified headers, filter-header chains, compact filters, and matching full blocks to produce BDK updates. Its current hostname and DNS-seed paths resolve locally before SOCKS5 is applied. PDK 1.0 provides a V2-only typestate protocol and append-only event model, but Groot still needs encrypted durable session storage, no-redirect/OHTTP transport, authoritative proposal review, signing, restart, receiver, and interoperability evidence.

## Decision

- Pin `bdk_kyoto` 0.17.0 and `payjoin` 1.0.0 exactly. PDK is compiled with default features disabled and only `v2`, making a V1 downgrade impossible in this build.
- Record the dependency spike before protocol traffic: RustSec reports no known vulnerabilities in the selected graph. Kyoto, BIP157, BIP324, and PDK have no active build scripts. `bitcoin-ohttp` has an NSS-oriented build path, but PDK's selected V2 graph uses its pure-Rust HPKE features and does not enable NSS. PDK's own security-review warning and the absence of final-1.0 reference-CLI interoperability keep sender/receiver support gated.
- Add a per-wallet `WalletSyncSource`. Bitcoin Core remains the default. Compact filters are explicit and affect confirmed wallet discovery only; the configured Core service remains separately visible for fees, mempool-dependent operations, recovery scans, and broadcast.
- Compact-filter sync applies only a Kyoto-produced BDK update, persists the wallet and Groot notification/provenance state in one SQLite transaction, walks back Kyoto's bounded reorg horizon, uses a shared public chain cache, and keeps wallet state isolated.
- Public test networks require at least two peers. Manual mode never uses DNS seeds or unconfigured peers. Tor mode accepts only a loopback SOCKS5 proxy plus explicit numeric `IP:port` peers and disables discovery, because the pinned Kyoto stack cannot yet guarantee proxy-side hostname resolution. There is no direct or Core fallback.
- Compact filters are explicitly confirmed-only. Pending incoming activity is unavailable; locally created pending spends remain in BDK's wallet graph. Mobile/desktop sync runs in a dedicated runtime with bounded peer and overall deadlines.
- Add trusted-Rust parsing and network validation for BIP21 Payjoin V2 URIs. Plain BIP21, V1-only, malformed, oversized, and wrong-network requests fail closed with a stable error. This parser sends no protocol traffic.
- Do not expose Payjoin sending or receiving until Groot has encrypted append-only PDK event persistence, fresh OHTTP encapsulation per attempt, redirect-free direct/Tor transport, original-versus-proposal review DTOs, explicit fallback consent, label/provenance integration, restart tests, adversarial proposal tests, and reference interoperability evidence. Dependency pinning and URI parsing do not close Issue #10.

## Consequences

Compact-filter users gain an optional local-match discovery path without changing signing authority, fee selection, or broadcast. They trade mempool visibility and faster client/server queries for P2P bandwidth, peer/eclipse risk, and confirmed-only state. A Core service is still required by current fee, recovery, and broadcast flows and is named as such in Settings.

Payjoin's external input remains parsed at the native boundary and cannot accidentally degrade into a normal payment. The remaining sender/receiver work is intentionally visible in implementation status rather than hidden behind a non-functional toggle.

## Evidence required before expanding the gates

- Funded Regtest compact-filter sync, reorg, malformed/conflicting peer, interruption, cache-corruption, and restart tests.
- Signet/Testnet4 peer-diversity and bandwidth evidence; Tor DNS-leak and no-fallback evidence; desktop/iOS/Android lifecycle certification.
- PDK final-version sender and receiver interoperability; encrypted event-log corruption/replay tests; OHTTP retry non-reuse evidence; hostile proposal corpus; hardware-wallet signing and restart; explicit fallback UX; security review.

References: #7, #10.
