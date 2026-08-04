# ADR 0007: flow evidence and scoped coverage

Status: accepted.

## Context

High line coverage can still leave a user flow, persistence boundary, or consensus interaction untested. One percentage cannot represent all wallet risk.

## Decision

Release evidence uses two explicit gates:

- 100% traceability for documented user flows, with evidence at the layer owning each boundary;
- measured code coverage reported by scope, never relabeling a scoped score as whole-repository coverage.

Frontend pure policy is enforced at 100% statements, branches, functions, and lines. The Rust security core is enforced at 99% lines, 100% functions, and 97% regions. Tauri command code remains visible in whole-crate reports and must gain an instrumented command harness. Regtest is mandatory for BDK/PSBT/broadcast changes. Physical-device and OS-platform certification remain distinct from simulators.

## Consequences

Every green result has an explicit claim. New flows update `docs/testing.md`; untested rows block release. Coverage cannot be raised with shallow tests or hidden exclusions.
