# Code health audit — 2026-08-09

## Scope

This internal audit reviewed dependency direction, Rust/frontend separation, presentation-state lifetimes, reusable UI primitives, canonical documentation, ADR coverage, and the automated test pyramid. It is engineering evidence, not an independent security assessment or mainnet approval.

## Current evidence

| Layer | Automated evidence | Current result |
| --- | --- | --- |
| Static architecture | adapter/import/network/log/state-lifetime boundary gate; mainnet release gate; Svelte diagnostics; strict Rust format, Clippy, and rustdoc | Green |
| Frontend unit | policy, presentation, localization, address formatting, live sync, modal locking, recovery, descriptors, and fixture-session tests | 78 passing |
| Rust unit/boundary | 131 named tests, including hostile parsers, entropy failure, descriptor identity, gap limits, PSBT mutation, storage, sessions, and HWI process controls | 131 passing |
| Deterministic Rust core coverage | explicitly classified eight-module scope | 99.58% lines, 100% functions, 97.20% regions |
| Whole Rust library coverage | all library modules, including native adapters and command orchestration | 56.07% lines, 52.71% functions, 53.04% regions |
| Real integration | isolated Bitcoin Core 31.1 descriptor recovery and real 2-of-3 PSBT sign/finalize/broadcast | 2 passing in CI |
| Browser acceptance | semantic desktop Chromium and mobile WebKit journeys | 87 passing, 1 intentional project skip |
| Supply chain | frozen lockfiles, immutable Actions, disabled package lifecycle scripts, npm/RustSec advisory jobs | Green with the inherited warnings listed in `SECURITY.md` |

## Findings corrected

1. The Rust coverage scope was correct but encoded as an opaque exclusion expression. A new module could change interpretation without an obvious architecture decision. The gate now names both scopes, requires every top-level Rust module to be classified, fails on unclassified files, and independently regression-gates whole-library lines, functions, and regions.
2. Multisig hardware-health history had only one mounted consumer but lived in a process-global Svelte store. It could outlive route and wallet context. It is now route-scoped session state; durable wallet truth remains behind `WalletPort`.
3. `SECURITY.md` still described receive verification as session-only and byte-for-byte. It now matches the implemented append-only evidence model and the tightly bounded Regtest Ledger `tb1`/`bcrt1` identical-script exception.
4. Architecture documentation did not explicitly state that Satchel has no REST server or define frontend state lifetimes. Both boundaries are now canonical, and ADR 0022 records the decision.

## Architecture assessment

The intended dependency direction is enforced: routes and reusable components depend on the `WalletPort` composition root; only the Tauri adapter invokes native commands; BDK, descriptors, signing, persistence, hardware processes, and network access remain in Rust. Reusable components own modal focus/scroll behavior, buttons, tooltips, readable addresses/identifiers, timestamps, progress, wallet switching, and common result surfaces. Routes retain orchestration and presentation state.

The largest maintainability risk is `src-tauri/src/wallet.rs` at 8,135 lines. It combines command orchestration, persistence coordination, DTO translation, and extensive same-module test access. Its tests are valuable and the boundary is currently behaviorally strong, but the file should be decomposed incrementally by coherent ownership—not mechanically—while preserving stable commands and adversarial tests. Good first extraction candidates are address records/verification evidence, proposal persistence, and recovery-scan settings. This is a pre-mainnet maintainability item because a broad one-shot rewrite would create more wallet risk than it removes.

Native adapter coverage is also uneven: deterministic domain modules are near-complete, while `wallet.rs`, native backup presentation, secure storage, and Tauri registration depend more heavily on environment-bound acceptance. The honest whole-library gate prevents regression, but raising it requires instrumented command/AppHandle harnesses and platform-native tests. Moving adapter code into the deterministic scope merely to raise a number is prohibited.

## Test-pyramid assessment

The pyramid is already automated in CI: many frontend/Rust units, fewer real Core integrations, then semantic desktop/mobile browser journeys. The top layer uses a deterministic browser adapter and therefore proves presentation/orchestration only. It does not prove native IPC wiring, Keychain/credential-vault behavior, USB hardware, cameras, packaging, or consensus behavior beyond the separate Core harness.

The next automation investment should be native command acceptance with isolated application data and a real Tauri webview, followed by platform jobs for macOS, Windows, iOS, and Android. Physical signer certification remains manual because simulation cannot prove a trusted display, cable/USB lifecycle, firmware behavior, cancellation, or reconnect identity.

## Remaining production gaps

- Independently reviewed security audit and remediation.
- Physical certification of every supported signer/model/firmware/host combination.
- Instrumented native command and packaged-app E2E on supported operating systems.
- Platform credential storage, lifecycle, camera, safe-area, interruption, and accessibility certification.
- Incremental decomposition of the Rust command/orchestration module.
- Funded delayed-recovery/reorg tests, remote-node privacy/TLS evidence, large-history performance, single-instance locking, reproducible signed builds, SBOM/provenance, and update-delivery review.

These gaps remain blockers under the canonical mainnet checklist. Test counts and coverage floors do not waive them.
