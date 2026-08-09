# ADR 0022: explicit coverage scope and frontend state lifetimes

Status: accepted.

## Context

ADR 0007 requires separate deterministic-core and whole-crate Rust coverage claims. A raw exclusion regular expression can implement that decision correctly while remaining difficult to audit, and a newly added module can change the reported scope without an explicit architectural review. Separately, route-only hardware health history was held in a process-global Svelte store, allowing stale presentation records to outlive the route and selected wallet that produced them.

## Decision

Every top-level Rust source module is explicitly classified as deterministic core or adapter/orchestration by the coverage gate. CI fails on an unclassified module. The deterministic core remains gated at 99% lines, 100% functions, and 97% regions; the whole library is independently gated at 55% lines, 51% functions, and 51% regions. Both scopes and current measured values are reported separately.

Frontend state uses the narrowest lifetime that owns it. Durable wallet truth stays behind `WalletPort`. Selected-wallet orchestration stays in `AppShell`. Toasts are the sole process-wide Svelte store. Form drafts, modal state, and session-only device health observations remain route-scoped unless multiple mounted consumers and an explicit wallet identity key justify broader state.

## Consequences

Coverage scope changes become reviewable diffs instead of regular-expression side effects, and new Rust modules cannot silently alter the near-100% claim. Adapter coverage remains visibly lower and must be raised through command, platform, and real-boundary harnesses rather than being relabeled as deterministic core. Route navigation clears ephemeral health history, preventing stale cross-wallet presentation.
