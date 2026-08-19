# Independent security review brief

## Objective

Assess whether the exact candidate commit is safe enough to enter a limited, hardware-focused Testnet4 release rehearsal. This review does not approve mainnet by itself.

## In scope

- Rust/Tauri command and secret boundaries, portable version-3 envelope authentication, v2 migration safety, offline-guessing exposure, credential throttling, wallet isolation, and deletion.
- BDK descriptor construction, BIP39/BIP84/BIP48/Miniscript use, BSMS records, PSBT construction/validation/finalization, RBF/CPFP and recovery scans.
- HWI process isolation, device identity, address display, signature merging, cable/file/UR transports, and hostile-device behavior.
- SQLite/filesystem atomicity, corruption, symlink, race, restart and migration behavior.
- Bitcoin Core local/direct-TLS/Tor authentication, chain identity, timeout, fallback and privacy behavior.
- The optional compact-filter boundary and its unresolved Kyoto, peer-conflict/eclipse, durable-cache, recovery, broadcast, Tor, public-network, and lifecycle gates in [`compact-filter-deferred-work.md`](compact-filter-deferred-work.md).
- Svelte/Tauri IPC exposure, CSP/capabilities, clipboard/camera/file handling, accessibility and secret lifetime.
- Locked dependencies, build scripts, CI permissions, unsigned reproducibility, signing/notarization and update design.

## Required reviewer inputs

- Exact commit and clean source archive.
- [`security-model.md`](security-model.md), [`mainnet-threat-model.md`](mainnet-threat-model.md), all ADRs, and [`mainnet-release-checklist.md`](mainnet-release-checklist.md).
- CI logs, coverage reports, regtest/Testnet4 evidence, dependency advisory/license output, and two-machine unsigned build comparison.
- Sanitized physical reports for every supported hardware model and remote TLS/Tor test evidence.

Never send seeds, PINs, xpubs, addresses, complete fingerprints, device paths, PSBTs, RPC credentials, wallet databases, or unredacted logs.

## Deliverables

Each finding must include severity, affected invariant, attacker prerequisites, impact, minimal disposable-test reproduction, affected code, and recommended remediation. Each fix requires a regression test and reviewer closure. Record residual risks and explicit unsupported configurations. The final statement must distinguish code review, physical testing, build/release review, and any work not performed.

## Exit rule

All critical/high findings are closed. Medium findings are closed or explicitly accepted in a reviewed ADR. The reviewer confirms the final commit and evidence set. Groot’s maintainer then reviews—but cannot replace—the independent conclusion and keeps mainnet disabled until every separate release checklist gate passes.
