# Code cleanup plan

Post-v5.3.0 maintenance, tracked in [#121](https://github.com/grootwallet/groot/issues/121). The CSS extraction is complete in [#86](https://github.com/grootwallet/groot/issues/86). Counts below identify current review hotspots, not quality targets; measurement commands own performance evidence.

| Area                                    | Lines | Next change                                                            |
| --------------------------------------- | ----: | ---------------------------------------------------------------------- |
| `src/app.css`                           |    12 | Ordered entry point; private rules moved to existing components/routes |
| `src-tauri/src/wallet.rs`               | 7,940 | Extract one cohesive native domain at a time                           |
| `src/routes/multisig/send/+page.svelte` | 3,805 | Separate presentation state from transaction authority                 |
| `src/routes/settings/+page.svelte`      | 3,446 | Group node, security and appearance orchestration                      |
| `src/routes/send/+page.svelte`          | 2,844 | Share proven fee/draft/acceleration presentation logic                 |
| `src/lib/wallet/dummy.ts`               | 3,020 | Split existing WalletPort facets while preserving deterministic state  |
| `src/lib/wallet/tauri.ts`               | 1,161 | Separate low-risk diagnostics/export calls first                       |

The [CSS verification record](testing/css-refactoring-5.3.md) records the scoped extraction and remaining shared compatibility contracts. The [5.3 CSS refactoring plan](css-refactoring-plan.md) specifies global foundations, component/route ownership, preservation checks and the staged completion campaign.

## Order

1. **CSS ownership preserved.** Keep the ordered global boundary and scoped owners; remove duplication only with rendered-state evidence. No framework or font migration.
2. **Tests.** Organize cases beside their owning domain and share fixture builders. Remove a test only when it exercises unreachable code or duplicates an equivalent assertion. Keep wrong-credential, identity, cancellation, stale-response, rollback and recovery failures explicit. Replace brittle source-shape assertions with behavior tests only where equivalent boundary coverage exists; keep secret and release gates.
3. **Settings and Send.** Extract existing orchestration and pure presentation helpers, starting with fee state, draft/proposal transitions and node form state. Preserve route teardown, wallet identity and error/retry behavior. Compose existing components; obtain approval for any genuinely new reusable component.
4. **Adapters.** Split diagnostics/export, profile/session, receive and transaction facets behind the unchanged WalletPort. Preserve generation counters, wallet-scoped events and fixture isolation. Do not create a generic framework merely to move methods.
5. **Rust wallet ownership.** Extract notifications, profile lifecycle and recovery settings into existing `wallet/` modules. Move code separately from behavior changes. Retain command-side authentication, exact-wallet binding, operation ordering and atomic transactions.
6. **Hardware and concurrency last.** Characterize each device's unlock/reconnect/cancel behavior before sharing continuations. Change serialization only after measuring contention and proving resource ownership. Preserve bounded helpers, fresh identity and physical-device acceptance.

Repeated Continuity policy compilation during proposal reload is a measured follow-up hotspot from the native test campaign. Profile a production build before optimizing it; preserve current descriptor/path equality, signer binding and fresh maturity checks if introducing bounded reuse.

## Acceptance for each change

- Small, issue-linked diff; no unrelated dependencies, public-contract changes or persisted-format changes.
- Record the baseline once: applicable tests, bundle size and any claimed performance measurement. Repeat only affected checks.
- `pnpm validate` plus the [scope-specific harness](agent-harness.md). CSS/UI: desktop/mobile, both themes, translated copy, keyboard and modal/safe-area layouts. Rust: strict fmt/Clippy/tests and affected real-Core cases.
- Same observable behavior and safety properties. Do not remove repeated authorization as cosmetic duplication or claim a speed/size improvement without measurements.

The v5.3.0 authorization applies to its exact released source. This maintenance work does not authorize a new release or refresh source-policy hashes to obtain green output. Physical phone/Miniscript acceptance remains separate. Measurements and parser/command regression evidence are recorded in [post-5.3 maintenance](testing/post-5.3-maintenance.md).
