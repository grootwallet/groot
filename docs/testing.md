# Testing and coverage methodology

Satchel uses two independent release measures:

1. **Flow coverage:** every documented user flow has executable evidence. The target is 100%; a flow without evidence blocks release.
2. **Code coverage:** measured statements, branches, functions, and lines. Pure security/product policy is held at 100%. Stateful adapters and UI are judged primarily by behavior and branch-oriented scenarios because a high line score alone does not prove wallet safety.

Coverage is never increased by silently excluding reachable product code, deleting assertions, snapshotting large pages without semantic checks, or counting browser fixtures as Rust-wallet integration evidence. Any scoped metric is named and reported separately from whole-crate coverage.

## Test layers

### Pure unit tests

Use for deterministic policy and hostile inputs. Each invariant gets the happy path, every rejection branch, and boundary values. `pnpm test:coverage` enforces 100% statements, branches, functions, and lines for `src/lib/wallet/policy.ts` and `src/lib/multisig/policy.ts`.

Rust unit tests own cryptography-adjacent behavior: credential encryption failures, authentication cooldown, descriptor canonicalization, backup validation, notification persistence, Miniscript compilation, adversarial PSBT merge rules, atomic/bounded storage, registry corruption, backend URL policy, HWI process limits, and air-gap frame limits. `pnpm test:coverage:rust` enforces the deterministic security-core scope (`auth`, `multisig`, `notifications`, `proposal`, and `recovery`) at 99% lines, 100% functions, and 97% regions. Platform-native UI and secure-store adapters still run in the Rust suite, but are excluded from this portable line threshold and require platform acceptance evidence.

The restart layer uses file-backed SQLite: it persists a payment PSBT, frozen outpoint, and notification, drops every handle, reconstructs fresh state, and verifies exact recovery and exactly-once drain. It then injects corrupt PSBT and frozen rows. Registry migration tests simulate an interrupted commit and require every directory to return to its original path.

Secret-envelope units use an in-memory device-key provider to prove that the correct credential alone, correct device key alone, corrupt metadata, oversized metadata, and mismatched wrapped keys all fail. Platform adapters compile with the native app and are exercised in platform acceptance without returning test secrets to the webview.

The whole Rust library is reported separately with `pnpm test:coverage:rust:all`. Environment adapters and Tauri `AppHandle` orchestration are not included in the enforced percentage; their behavior is covered through boundary units, regtest, and E2E. The scoped score must never be presented as whole-crate coverage.

### Integration tests

`pnpm test:regtest` talks to the isolated Bitcoin Core node. It creates fresh descriptor keys and addresses on every run, funds a real `wsh(sortedmulti())` wallet, syncs BDK, builds a real PSBT, signs it with two isolated signers, finalizes it in the coordinator, broadcasts it, and verifies that the transaction returns through sync. Fresh keys prevent prior regtest state from making tests order-dependent.

Integration tests must assert state on both sides of a boundary: for example, BDK balance plus Core acceptance, persisted proposal plus reconstructed PSBT, or notification row plus exactly-once drain. Signet is a smoke/rehearsal layer after deterministic regtest is green; it is not used for exhaustive edge cases.

### End-to-end tests

`pnpm test:e2e` runs semantic Playwright flows against desktop Chromium at 1180×780 and mobile WebKit at 390×844. Tests interact through labels, roles, and visible durable state. Toasts are asserted only in addition to a durable result. Each destructive or signing flow tests confirmation gates and at least one failure before success.

The browser adapter is a deterministic UI fixture. E2E success proves presentation and orchestration, not private-key security or Bitcoin consensus behavior; those claims require Rust and regtest evidence.

Theme coverage has two layers: unit tests verify every semantic foreground/background token pair and reject legacy hard-coded dark surfaces; desktop/mobile E2E measures computed contrast on unlock and all 24 revealed recovery-word cells in both light and dark modes. Tests must inspect rendered foreground and background colors, not only root token values.

### Hardware and platform tests

Virtual signer coverage is mandatory in CI. Physical certification is separate and must record device model, firmware, HWI version, host OS, policy registration, xpub import, address display, rejection, signing, reconnect, and cancellation. A simulator result is never labeled physical certification. iOS/Android camera, permission, interruption, background/resume, and safe-area checks require the platform harnesses and real/simulated OS builds.

## Flow traceability matrix

| ID | Flow | Unit/security evidence | Integration evidence | Desktop/mobile E2E | Gate |
| --- | --- | --- | --- | --- | --- |
| F01 | Generate 24 words and create | Rust pending session + device/credential envelope; TS recovery count + theme contrast | Descriptor derivation tests | Fixture onboarding + 24-word light/dark contrast | Green on regtest; native platform certification remains |
| F02 | Recover 24 words + credential | Invalid length/credential | Descriptor backup round-trip | 23-word rejection then recovery | Green fixture; full Core rescan expansion pending |
| F03 | Unlock/wrong PIN/rate limit | Auth cooldown + AEAD rejection + exact regtest-reset confirmation | Selected-profile routing and deletion | Wrong then correct credential; reveal control; exit/switch routes; locked regtest deletion; light/dark contrast | Green |
| F04 | Overview/balance/recent activity | Snapshot accounting helpers | Core-backed BDK sync | Overview visible | Green |
| F05 | Activity/filter/details | DTO/accounting tests | Core transaction round-trip | Explicit empty state, filter, and details modal | Green |
| F06 | UTXO list, manual selection, freeze/unfreeze | Selection normalization, persistence/corruption/restart | BDK exact-input builder and persisted freeze table | Select, freeze, unfreeze, carry to Send, restore auto | Green |
| F07 | Mandatory immutable receive label | 100% policy coverage + Rust bounds | BDK address derivation | Multiple concurrent requests, disabled empty label, enlarged QR, derivation disclosure | Green |
| F08 | Discard unused awaiting address | All discard branches | SQLite conditional update | Independent confirmed discard while other requests remain active | Green |
| F09 | Fee presets/custom validation | Amount/rate boundaries | Real fee-funded PSBT | Zero custom disabled; valid custom enabled | Green |
| F10 | Single-key review/sign/broadcast | Active-network address prefix, credential + persisted trusted-PSBT restart/corruption rules | Core signing path shares BDK signer options | Receive address round trip, wrong PIN, updated-balance broadcast | Green on regtest |
| F11 | Exactly-once receive/confirmation/broadcast notices | SQLite uniqueness/order/drain | Broadcast inserted after Core acceptance | Durable state plus toast host | Green backend; background scheduling pending |
| F12 | Single-key delete | Tombstone/idempotence/non-directory | Filesystem boundary | Typed DELETE gate | Green; no flash-erasure claim |
| F13 | Multisig policy/manual setup | Canonical descriptors + all validation branches, including M/N bounds | BDK accepts descriptors | 2-of-3 and 3-of-5 recipes; advanced 3-of-4; 1-of-N exclusion; duplicate rejection | Green |
| F14 | Hardware enumerate/xpub/sign/address display/health | Fixed args, timeout, output, injection, stable errors; native rejection of virtual sources | Virtual isolated signers | Device-details modal; connected fingerprint match; honest offline-record check; virtual HWI setup/sign | Harness green; physical certification external |
| F15 | Multisig receive/sync | Descriptor and label rules | Funded WSH address | Receive QR | Green |
| F16 | Persist/merge/cancel multisig proposal | Adversarial PSBT suite | Real PSBT persistence/signing primitives | Prepare/resume/sign; cancellation UI | Green except command-level restart integration expansion |
| F17 | Finalize/broadcast multisig | Threshold/finalization rejection | Real 2-of-3 Core broadcast | Pre-created funded vault, two virtual signatures, wrong PIN, updated-balance broadcast | Green on regtest |
| F18 | Export/drill/delete/recover multisig | Canonical/checksummed backup validation | Stable first-address reconstruction | Export, wrong PIN, drill, delete, recover | Green |
| F19 | Timelocked recovery/inheritance template | Compiler, sanity, delay/unknown-key boundaries | BDK accepts compiled descriptor | Select template, compile, inspect descriptor, create | Creation green; funded delayed-path spends/reorgs block V2 release |
| F20 | Decaying multisig | Timeline/strict decay/property cases | — | Warning and simulator | Preview green; funded boundary tests pending |
| F21 | Expanding multisig | Strict superset/fixed threshold cases | — | Disabled when no recovery key | Preview green; 4+ key UI scenario and funded boundary tests pending |
| F22 | Responsive coordinator | Pure validation avoids viewport logic | — | Every E2E on desktop/mobile + overflow assertion | Green |
| F23 | File air-gap transport | Bounded PSBT/backup/file parsers | File save/import | Desktop/mobile save/import | Green |
| F24 | UR/animated QR/camera transport | Bounded hostile-frame foundation | — | Hidden | Standards/platform work pending |
| F25 | Multiple wallet create/switch/delete/migrate | Registry identity, selection, rollback, corruption | Isolated BDK paths and restart reconstruction | Create, select, relock, unlock on desktop/mobile | Green on regtest |
| F26 | Production/mainnet release boundary | Network constants and release documents checked in CI | — | Mainnet absent from selectable networks | Green guard; mainnet release remains blocked |

Every row must be updated in the same change that adds or changes a flow. “Pending” in a release column is a blocker, not an invitation to infer coverage.

## Commands

```bash
pnpm validate          # Svelte diagnostics, unit tests, production build
pnpm test:boundaries   # architecture/import boundary enforcement
pnpm test:release-gate # prove mainnet remains disabled until reviewed
pnpm test:coverage     # enforced 100% pure-policy coverage
pnpm test:coverage:rust # enforced ~100% Rust security-core coverage
pnpm test:coverage:rust:all # whole Rust library report, explicitly unscoped
pnpm test:e2e          # desktop + mobile semantic flows
pnpm regtest:start     # isolated local Bitcoin Core
pnpm test:regtest      # start/reuse isolated Core, then real BDK/PSBT integration
cd src-tauri
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
```

`pnpm test:full` runs validation, enforced policy coverage, and E2E. Regtest remains explicit because it requires a running local node.

## Adding or changing a flow

1. Add or update its row above and state its invariant.
2. Add unit cases for every policy/error branch and boundary.
3. Add a Rust/regtest test when the flow crosses persistence, secrets, descriptors, PSBT, signing, synchronization, or broadcast.
4. Add desktop/mobile E2E for the happy path, validation failure, retry/interruption, durable success, and destructive confirmation where applicable.
5. Run the full command set and record any physical/platform limitation honestly.
