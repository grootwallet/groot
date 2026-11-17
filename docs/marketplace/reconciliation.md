# Marketplace recovery scope

This branch recovers the marketplace work from the preserved detached Groot checkout at `733bc513d5fe570a1ceb27d8815ed00a4b2a0459`. It carries the existing synthetic preview, public discovery research, LocalCoinSwap development gateway and private simulated-money sandbox frontend. The separate `grootwallet/groot-marketplace` repository retains the sandbox service and its existing SQLite v1 format.

Recovery preserves the current wallet version, dependency lockfiles, mobile fixes, Miniscript behavior, platform capabilities, validation runner and release approval gates. Marketplace ADRs originally numbered 0098–0103 and 0106–0110 are copied as 0111–0121 to avoid collisions with maintenance decisions; the preserved source archive retains the originals. This is source isolation, not a new trading implementation or release approval.

## Provider evaluation remains unresolved

The recovered provider decision and research describe the investigation as it stood. Later discussion in “Plan Bitcoin marketplace integration” on 11 November 2026 concluded that no evaluated provider was confirmed for the complete in-app signup, buy/sell, chat, disputes, refund and replacement-device recovery flow. Hodl Hodl remained the strongest lead for further qualification; bootstrapping Groot’s own order book was considered too risky for launch. Those later conclusions do not change the development adapter’s existing LocalCoinSwap research behavior.

The historical provider choice prose is retained for provenance. Recovering it does not select a production provider, establish usable liquidity, authorize live escrow, or resolve the recorded integration gaps. Native wallet access, funded trading and production release remain gated.

## Running the recovered work

Use the repository’s pinned runtime and dependencies. `pnpm dev:marketplace` opens the synthetic rehearsal. `pnpm dev:marketplace-provider` defaults to provider fixtures. The durable sandbox needs the separate service checkout: set `GROOT_MARKETPLACE_SOURCE` to its absolute path when it is not alongside this wallet worktree, then run `pnpm dev:marketplace-backend`. Preserve existing service data; do not replace its database to start this worktree.

Run `pnpm validate` and the focused marketplace checks before handoff. `pnpm verify:marketplace` owns its own loopback listener and repeats browser fixture acceptance. Service/deployment, live-provider and physical/native evidence remain separate. Historical test totals in recovered research are evidence for their recorded sources, not acceptance of this branch.

## Compatibility and standards

No wallet, profile, backup, proposal, registry, credential or service database format changes. No native command, derivation, descriptor, PSBT, signing or broadcast change. No dependencies are added or updated. BIP impact: none for recovery and isolation; the recovered sandbox’s BIP21-shaped Regtest fixture remains a nonpayable practice artifact rather than new wallet interoperability support.

## Recovery verification on 17 November 2026

The final recovered runtime passed formatting, Svelte checking with zero errors or warnings, 1,481 frontend tests across 119 files, the production frontend build, and the marketplace transport/provider fixture suites. Frozen, offline dependency installation reused the pinned lockfile with lifecycle scripts disabled; no dependency or runtime override was required.

Mandatory `pnpm validate` was run and remains red at the public frozen-source approval gate and the internal-snapshot regression test. The maintenance/mobile source and recovered package, shell and Settings additions differ from those reviewed snapshots. Their pins, assertions and release restrictions were retained; this branch is not authorized for packaging or distribution.

The focused offline browser rehearsal executed all 30 cases without retries: 25 initially passed, four failed because French/Spanish fixture literals disagreed with the retained catalog precedence, and one mobile hit test found a real toast overlap. The four literal expectations were aligned to the existing `marketplace-backend` catalog values; their unchanged unchecked/disabled receipt guards then passed in desktop Chromium and mobile WebKit. Combined evidence is 29 passing cases and one retained WIP defect. No case, assertion, timeout or retry policy was removed or relaxed.

The remaining mobile defect occurs in the unavailable-offers exercise: stacked scenario and error toasts obscure **Restore demo offers**. Its obstruction assertion, screenshot and trace are preserved. This recovery does not change that UI behavior. Desktop 1180×780 and mobile 390×844 screens, both themes and the receipt dialog were inspected; physical-device, native trading, service deployment and live-provider certification were not performed.
