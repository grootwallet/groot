# Agent and maintainer harness

This is the operational source of truth for coding agents and maintainers. It
does not replace the product, architecture, design, flow, or ADR documents. The
root `AGENTS.md` applies repository-wide; the nearest nested `AGENTS.md` adds
scope-specific rules.

## Establish the real state first

Before changing files:

1. Read the root and nearest `AGENTS.md`, then the canonical documents named by
   the root guide.
2. Inspect `git status --short`, `git diff`, `git diff --cached`, and recent
   commits. Preserve all existing work and do not rewrite, discard, commit, or
   push unrelated changes.
3. Treat GitHub as live external state. Verify an issue with `gh issue view` or
   `gh issue list` before stating that it is open or closed. Documentation owns
   product truth; an issue state does not prove implementation, physical
   certification, or release readiness. Never create, edit, close, or reopen an
   issue without the user's authorization.
4. Identify who owns any running native app, Vite server, Bitcoin Core process,
   or certification profile. Do not start a second server against the same port
   or stop a process you did not start.
5. Identify every persisted format touched by the change. If compatibility is
   not exact, stop before implementation, write the ADR and migration-versus-
   discard proposal, and obtain explicit user approval. Test or Regtest data is
   not implicit permission to discard or migrate it.

The pinned local runtime is Node 24.19.0, pnpm 11.13.1, and Rust 1.97.1. Use the
committed lockfiles. `scripts/dev/tauri-regtest.sh` selects the pinned Node
runtime and reuses the saved isolated certification profile.

## Required command harness

| Scope                    | Command                                                                                   | What it proves                                                                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supported text files     | `pnpm format`                                                                             | Applies the committed Prettier configuration. Review its diff.                                                                                                                                                       |
| Fast frontend/type check | `pnpm check`                                                                              | Svelte and TypeScript diagnostics.                                                                                                                                                                                   |
| Frontend units           | `pnpm test`                                                                               | Vitest unit and component tests. Use focused tests while iterating.                                                                                                                                                  |
| Standard handoff         | `pnpm validate`                                                                           | Formatting, architecture and secret boundaries, supply chain, brand, hardware-preflight fixtures, release gates, signed-input fixture checks, runtime launcher, Svelte checks, unit tests, and production web build. |
| Frontend policy coverage | `pnpm test:coverage`                                                                      | The named pure policy modules remain at 100% line/function/branch/statement coverage.                                                                                                                                |
| Browser acceptance       | `pnpm test:acceptance`                                                                    | Playwright user flows. UI changes also require visual inspection at 1180×780 and 390×844.                                                                                                                            |
| Rust formatting          | `cargo fmt --check` from `src-tauri`                                                      | Rust formatting only; Prettier does not format Rust.                                                                                                                                                                 |
| Rust lint                | `cargo clippy --locked --all-targets --all-features -- -D warnings` from `src-tauri`      | Strict lint across every target and feature.                                                                                                                                                                         |
| Rust tests               | `cargo test --locked --all-features` from `src-tauri`                                     | Rust unit and integration tests under all features.                                                                                                                                                                  |
| Rust API docs            | `RUSTDOCFLAGS="-D warnings" cargo doc --locked --no-deps --all-features` from `src-tauri` | Public/internal API documentation compiles without warnings.                                                                                                                                                         |
| Native networks          | `pnpm network:check-builds`                                                               | Every permitted compile-time native network builds.                                                                                                                                                                  |
| Real Core Regtest        | `pnpm test:integration:regtest`                                                           | Disposable Bitcoin Core sync, transaction, multisig, and recovery integration. It is not physical-device evidence.                                                                                                   |
| Rust coverage            | `pnpm test:coverage:rust` and `pnpm test:coverage:rust:all`                               | Classified deterministic-core and whole-library coverage floors.                                                                                                                                                     |
| SBOM/license evidence    | `pnpm test:sbom`                                                                          | Deterministic CycloneDX inventory, lockfile integrity, and dependency-license evidence.                                                                                                                              |
| Full local suite         | `pnpm test:full`                                                                          | Standard validation, frontend policy coverage, classified Rust coverage, and browser acceptance.                                                                                                                     |

`pnpm validate` is mandatory before handoff but is not the entire CI workflow.
CI additionally runs the production dependency audit, deterministic SBOM,
browser acceptance in Chromium and WebKit, strict Rust formatting/lint/docs,
the native-network build matrix, all-feature Rust tests, isolated real-Core
Regtest, RustSec audit, and both Rust coverage gates. The canonical commands and
pinned GitHub Actions are in `.github/workflows/ci.yml`.

Real-Core integration scripts create disposable isolated data. Never redirect
them to the funded physical-certification profile. Do not recreate or replace a
saved certification profile merely to make a test pass.

## Evidence vocabulary

Always qualify a claim as one of:

- deterministic fixture or browser prototype;
- frontend unit/component test;
- Rust unit/integration test;
- isolated real Bitcoin Core Regtest;
- physically observed exact device/model/firmware/transport;
- public-network rehearsal;
- packaged-candidate evidence; or
- independent review.

No earlier tier implies a later one. Coverage is a floor, not evidence that the
assertions or product claim are correct.

## Physical hardware certification

The canonical matrix is `docs/hardware-certification.md`; policy semantics are
in `docs/hardware-policy-readiness.md`; each exact-device campaign gets a
gitignored worksheet under `hardware-certification.local/` and a sanitized
public report when evidence exists.

During a physical session:

- proceed one action at a time and explicitly request every device confirmation,
  rejection, visual comparison, password/PIN action, and cable action;
- record only what the reviewer reports seeing; never infer a pass from HWI or
  UI state alone;
- update the sensitive worksheet and sanitized public report after each result;
- never commit seeds, PINs, passphrases, addresses, xpubs, fingerprints, device
  paths, PSBTs, RPC credentials, or transaction identifiers;
- do not inherit evidence between exact models or transports; and
- retain vendor limitations exactly instead of converting them into a stronger
  readiness label.

Current local status on 2026-08-24:

- Coldcard Mk4, Blockstream Jade Classic, original BitBox02 Bitcoin-only,
  Trezor Model One, and Ledger Nano S Plus have the local core passes and open
  limitations recorded in the canonical matrix.
- Blockstream Jade Classic additionally passed a focused packaged v0.4.28
  Testnet4 regression: Groot initiated locked-device login, completed trusted
  address display, kept the modal open when close was requested during the
  device decision, drained an explicit Jade rejection without persisting
  verification, and completed a fresh approved retry. HWI 3.2.0 exposes no
  common remote-cancel command for active address display.
- Ledger Nano S Plus additionally passed the equivalent focused packaged
  v0.4.28 Testnet4 regression: the trusted address display remained active,
  repeated blocked-dismissal attempts gave clear modal attention feedback,
  explicit Ledger rejection closed the device prompt and modal without
  persisting verification, and a fresh unchanged approval succeeded. The
  equivalent close/reject/retry regression remains required per exact Trezor,
  BitBox02, and Coldcard model; source-path similarity is not physical evidence.
- Trezor Safe 3 Bitcoin-only, firmware 2.12.3, has a complete BIP84 local
  Regtest USB core pass. Its BIP48 import, 2-of-3 construction, cosigner address
  proof, confirmed 100,000-sat Groot sync, permanent label, history, accounting,
  saved-identity health, Safe 3 address review/signing, partial-signature
  restart, duplicate and foreign PSBT rejection, wrong-device rejection, USB
  interruption with an unchanged successful retry, and independent clean-profile
  balance/history recovery pass. A bounded hostile unsigned-transaction mutation
  was also rejected before the preserved proposal reached 2 of 2 with the
  original Jade and Safe 3; it remains unfinalized and unbroadcast. Only
  public-network/package and independent-review rows remain pending. Its policy
  status is always **No setup needed**, never **Policy verified**.
- BitBox02 Nova firmware 9.26.3 has a local HWI 3.2.0 Regtest USB core pass
  under self-review for BIP84 and BIP48 import, policy/address proof, funded
  rejection/retry, canonical signing, restart, Ledger wrong-device rejection,
  duplicate/foreign/mutated-PSBT rejection, interruption/retry, threshold
  broadcast/accounting, and independent clean-profile Groot JSON recovery with
  the funded source preserved and reopened intact. It is **not release
  certified**: cold-cache reset was not isolated from the shared BitBoxApp cache, and Testnet4,
  packaged-candidate, independent-review, and Whisper/BLE rows remain open.
  Original BitBox02 evidence is not inherited.
- Packaged v0.4.28 Testnet4 testing with the original BitBox02 exposed that
  HWI 3.2.0 may wait for device-password entry inside aggregate discovery,
  before returning the locked device row. The former 30-second discovery
  deadline failed after a successful unlock. ADR 0043 and the same-version
  portable correction extend that cancelable discovery window to five minutes;
  physical retesting is still required before recording a pass.
- The following packaged BitBox02 Nova attempt completed discovery but returned
  sanitized `hardware_unavailable` from initial account-key import. Repeating
  the primary action unnecessarily repeated aggregate discovery. The corrective
  candidate retains the selected capability, retries only typed HWI transient
  reopen codes, and localizes the scan title; exact-model physical retesting is
  still required.

GitHub issue state is intentionally not duplicated as a large static list. The
live tracker is <https://github.com/thibistaken/groot/issues>. At this snapshot,
label provenance issue #9 is closed; compact filters #7, Payjoin #10, active
PSBT overview #11, hardware roadmap #25, BitBox02 Nova Whisper/Bluetooth #32,
and BitBox02 Nova USB #34 are open. Recheck before repeating these states.

## Clean implementation and handoff

- Make the smallest coherent change at the owning layer. Remove obsolete or
  duplicated code encountered in that scope; do not perform unrelated rewrites.
- New feature UI composes existing reusable components. If a verified gap
  requires a new reusable component, explain it and obtain explicit user
  approval before creating it.
- Add named regression tests for the failure that motivated a fix. Do not weaken
  a gate or assertion to obtain green output.
- Keep product, architecture, implementation status, flow, design, hardware
  matrix, and ADR claims synchronized with code in the same change.
- Never hide a breaking persisted-format change behind a generic unlock,
  corruption, or wrong-PIN error. Preserve unsupported data until explicit
  deletion and state its recovery or recreation path.
- Review the final diff, rerun the proportionate harness above, and report exact
  commands and results. Commit only coherent completed work when authorized;
  never push unless explicitly asked.
