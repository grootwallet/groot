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
| Rust coverage            | `pnpm test:coverage:rust` and `pnpm test:coverage:rust:all`                               | Classified deterministic-core coverage and whole-library coverage merged with the isolated real-Core scenarios.                                                                                                      |
| SBOM/license evidence    | `pnpm test:sbom`                                                                          | Deterministic CycloneDX inventory, exact commit/lockfile identity, artifact-hash binding, and dependency-license evidence.                                                                                           |
| Full local suite         | `pnpm test:full`                                                                          | Standard validation, frontend policy coverage, classified Rust coverage, and browser acceptance.                                                                                                                     |

`pnpm validate` is mandatory before handoff but is not the entire CI workflow.
CI additionally runs the production dependency audit, deterministic SBOM,
browser acceptance in Chromium and WebKit, strict Rust formatting/lint/docs,
the native-network build matrix, all-feature Rust tests, isolated real-Core
Regtest, RustSec audit, and both Rust coverage gates. The canonical commands and
pinned GitHub Actions are in `.github/workflows/ci.yml`.

Native Signet and Testnet4 package commands require a clean tracked and
untracked worktree, then generate a fresh target-specific SBOM after the
executable exists. `pnpm release:unsigned` does the same for the unsigned
release evidence set, while `pnpm release:unsigned:mainnet` creates the dedicated
fixed-Mainnet supporting evidence set. `pnpm release:unsigned:multi` is the ADR
0069 GA evidence builder. It requires the frozen production-signed HWI helper
and its generated provenance manifest, verifies the helper's exact upstream
digest, Developer ID team, hardened runtime, secure timestamp, and HWI-only
library-validation entitlement, then compiles that signed helper digest into
the independently reproduced multi-network Groot executable. The macOS evidence records stable exact OS, Xcode, Clang,
SDK, architecture, and language-toolchain inputs without binding otherwise
independent machines to one Apple hardware-family kernel suffix. These generated
files bind the exact commit and lockfiles to the built executable digest. The
mainnet builder rejects external `RUSTFLAGS`/`CARGO_ENCODED_RUSTFLAGS`, clears
Apple ld's ambient `RC_UUID_SALT`, remaps the physical checkout, Cargo-home, and
Cargo-target paths to stable virtual prefixes, and requests Apple ld's
reproducible mode. Because current Apple ld still emits different content-based
UUIDs for byte-identical full application payloads, the builder derives the
retained UUID from the finished pre-signature Mach-O bytes and recomputes the
existing linker-generated ad hoc CodeDirectory's SHA-256 code slots. The
normalizer accepts only the reviewed thin 64-bit Mach-O, single UUID/signature,
ad hoc full-SHA-256 layout, replaces the target atomically, and must pass strict
`codesign` verification before evidence is emitted. It does not apply an
identity signature. The builder rejects an executable if its checkout, Cargo
home, Cargo target, or user home survives in its strings. It compiles with
Tauri's production
`custom-protocol` feature so the evidence binary matches the packaged execution
mode. Generated evidence remains untracked build artifacts.

`pnpm release:prepare:signed-hwi` is the only production HWI signing step. It
copies the manifest-pinned upstream HWI, applies the reviewed HWI-only
entitlement with hardened runtime and a secure timestamp, and emits a bounded
signed-HWI manifest. Run it once, freeze the resulting helper and manifest as
release inputs, and provide those exact public inputs to both independent build
machines. `pnpm release:package:macos:ga` accepts only matching sealed
multi-network evidence, requires the packaged pre-sign Groot executable to
equal that reproduced executable byte for byte, recreates the evidence build's
source epoch and reproducible Rust path/linker environment, normalizes the
packaged Mach-O UUID before that comparison, signs the outer app without
the HWI entitlement, notarizes and staples the app and DMG, verifies Gatekeeper
and packaged HWI policy, and emits signed SBOM/provenance/checksum evidence. It
never creates, imports, or prints signing credentials; the Developer ID identity
and notarization profile must already exist in Keychain.

`pnpm build:native:mainnet:internal` and `pnpm build:native:multi:internal` are
the separate non-distributable physical-testing builders. Each requires a clean
exact commit, bundles the pinned HWI, compiles the runtime signature requirement
as `REHEARSAL_ONLY`, applies only an ad-hoc identity, and verifies the copied
`.app`. The multi-network command is the ADR 0069 GA-candidate path; the fixed
Mainnet command remains supporting evidence. Neither command signs with
Developer ID, notarizes, staples, packages for distribution, or pushes source.

The completed independent fixed-Mainnet `76fb54e8` Build A/Build B run, including
exact evidence hashes, validation totals, deviations, and path-leak results, is
recorded in
[`reproducible-mainnet-builds-2026-09-04.md`](reproducible-mainnet-builds-2026-09-04.md).
It is supporting evidence only; the final ADR 0069 multi-network commit must
repeat the two-machine campaign using the frozen signed-HWI input.

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

For ADR 0075 passive-inventory certification, use the disposable Testnet4
package and the seven-device set: Coldcard Mk4, Jade Classic, original BitBox02
Bitcoin-only, BitBox02 Nova Bitcoin-only, Trezor Model One, Trezor Safe 3
Bitcoin-only, and Ledger Nano S Plus. Record firmware, macOS build, direct versus
hub connection, and package identity without recording device paths or wallet
identifiers. Run these rows in order:

1. With every device disconnected, open and close the picker five times. Expect
   an empty result, no HWI process, no vendor prompt, and no device-screen change.
2. Connect each device alone while locked or at its earliest host-visible state.
   Expect one stable row for every host-visible approved endpoint, no prompt, and
   no screen change. A pre-login Coldcard is expected to be absent; unlock it and
   enable USB, then require exactly one Coldcard row. On Testnet4 the passively
   ambiguous Safe 3 revision-A/Model-T USB identity may appear as generic
   **Trezor**; Mainnet must omit that ambiguous record.
3. Connect all seven together, first directly where practical and then through
   the intended hub. Run at least ten cold picker opens and ten immediate repeat
   opens. Require one row per visible device, two distinct BitBox rows, no
   duplicate Jade `/dev/tty` row, stable family/model labels, no device prompt,
   and no unselected screen change. Record sanitized durations for p50/p95.
4. Select one row at a time. Only that exact device may prompt or change screen;
   cancel or complete the non-spending BIP84/BIP48 account-key proof, then verify
   all other devices were untouched. Repeat with two devices from the same family
   connected where available.
5. Unplug one device between inventory and selection. The selected action must
   fail closed without substituting another device. Reconnect and explicitly
   rescan; the old capability must remain invalid.

Stop on any scan-time password, PIN, login, approval, duplicate row, wrong-model
row, unselected-device screen change, or same-family substitution. Do not proceed
to funded signing until the inventory rows are reviewed.

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
  original Jade and Safe 3; it remains unfinalized and unbroadcast. Exact
  packaged v0.4.88 commit `4fcd5f27` additionally passed funded BIP84
  signing/broadcast and wrong-device rejection. The same candidate passed the
  shared Safe 3 plus Nova BIP48 trusted-display, real Testnet4 deposit and
  2-of-3 spend, confirmation, restart/accounting, and genuine clean-profile
  descriptor/public-backup recovery campaign. Its policy status was correctly
  **No setup needed**, never **Policy verified**. Exact packaged v0.4.89 commit
  `c9309d3` subsequently passed full-history rescans for every exercised wallet
  with Bitcoin Core fully synchronized. The separately deferred clean-profile
  recovery procedure and an independent tester/reviewer run remain open.
- BitBox02 Nova firmware 9.26.3 has a local HWI 3.2.0 Regtest USB core pass
  under self-review for BIP84 and BIP48 import, policy/address proof, funded
  rejection/retry, canonical signing, restart, Ledger wrong-device rejection,
  duplicate/foreign/mutated-PSBT rejection, interruption/retry, threshold
  broadcast/accounting, and independent clean-profile Groot JSON recovery with
  the funded source preserved and reopened intact. It is **not release
  certified**: cold-cache reset was not isolated from the shared BitBoxApp
  cache. Exact packaged v0.4.88 commit `4fcd5f27` passed Nova RBF plus the
  shared Safe 3/Nova BIP48 display, deposit, 2-of-3 spend, confirmation,
  restart/accounting, and genuine clean-profile descriptor/public-backup
  recovery rows. The RBF result is functional evidence for that candidate only
  and does not certify its superseded UX or v0.4.89. The separately deferred
  recovery procedure, independent tester/reviewer, and Whisper/BLE remain open.
  Original BitBox02 evidence is not inherited.
- Internal Mainnet `v0.4.95 · a393a0e7` passed an owner-operated standard
  2-of-3 signing and broadcast with Ledger Nano S Plus and BitBox02 Nova.
  Evidence remains bound to that exact package and signer pair; confirmation,
  negative PSBT, recovery, exact-firmware, replacement-build, and independent
  review rows remain open.
- Exact packaged v0.4.89 commit `fc2ac74f` passed the reviewer-operated
  Testnet4 software-wallet create, copied-network-setup, wrong-passphrase,
  reopen-without-Keychain-prompt, labeled receive and restart-persistence,
  funded receive, send/broadcast, accounting, Activity, Coins, and relaunch
  checks. The run found insufficient warning spacing, crowded amount/unit
  presentation, and one false unsupported-wallet startup toast. These findings
  are fixed in v0.4.90, but the physical evidence remains bound to `fc2ac74f`;
  it is not silently transferred to the replacement package.
  Exact packaged v0.4.90 commit `c6d0d5d2` subsequently passed the focused
  physical regression: warning separation, first-open status presentation,
  and BTC/sats unit spacing were all reported correct. A closed, owner-only
  copy of the same software-wallet profile was then opened under that package
  from clean application state: it presented the expected locked wallet,
  rejected one wrong passphrase, accepted the correct passphrase, restored its
  saved Core setup without editing, completed a full-history rescan, reconciled
  balance/history/labels/coins, and preserved that state across restart. A
  separately copied profile with one controlled encrypted-payload mutation was
  rejected as corrupt and remained locked. The reviewer then reported both
  cancellation and confirmed deletion against a disposable copy, with unrelated
  wallets retained. The untouched source was restored byte-for-byte from a
  second matching safety copy, relaunched, unlocked, and physically confirmed
  with matching balance/history/labels/coins, restored Core setup, no corruption
  error, and no Keychain prompt. A separate clean application profile then
  created one disposable app-PIN external-signer wallet after first confirming
  that an existing public descriptor is rejected as a duplicate without
  changes. The new profile passed locked restart, correct-PIN unlock, public
  state persistence, owner-only relocation, wrong- then correct-PIN handling,
  controlled encrypted-verifier corruption rejection, valid-copy restoration,
  cancelled deletion, confirmed deletion, and return to the empty chooser. The
  original multi-wallet source was restored from its matching safety copy and
  physically reconfirmed. Authenticated v2 migration and independent review
  remain open. The broader funded functional evidence above remains accurately
  bound to `fc2ac74f`.
- Exact packaged v0.4.90 commit `c6d0d5d2` also passed the reviewer-operated
  ad-hoc macOS lifecycle: one-minute inactivity lock, explicit lock/unlock,
  short sleep/wake with Core recovery, forced termination and normal reopen,
  second-instance refusal with the first instance unaffected, immediate lock
  reacquisition after quit, keyboard focus containment, locked/discreet
  VoiceOver inspection, explicit-only clipboard behavior, single-window
  behavior, and final restart persistence. macOS displayed its standard
  crash-recovery prompt after the intentional forced termination; Groot then
  reopened normally without manual lock-file cleanup. A disposable native
  recovery-word sheet was deliberately captured through the operating-system
  screenshot shortcut, the unsaved image and clipboard value were discarded,
  wallet creation was cancelled, and the original profile was restored. The
  reviewer explicitly accepted deliberate user-initiated capture as intended
  behavior; Groot still warns against digital storage and must never initiate
  or retain such a capture. Signed/notarized repetition and crash-artifact
  inspection remain open.
- Exact packaged v0.4.91 commit `0849375d` passed the focused reviewer-operated
  build-identity follow-up: the version and short commit were visible and the
  copy control worked in the normal sidebar, shell-less wallet setup flows, and
  Settings. This presentation-only result is bound to v0.4.91; the broader
  portable-profile and macOS lifecycle evidence above remains bound to exact
  packaged v0.4.90 commit `c6d0d5d2` and is not silently transferred.
- The same exact v0.4.91 source commit `0849375d` was subsequently packaged as
  a Developer ID signed, hardened-runtime, Apple-notarized and stapled macOS
  arm64 Testnet4 app. Deep strict verification, Gatekeeper assessment, offline
  ticket validation, packaged HWI 3.2.0 execution, and the signed-executable
  binding in a fresh 539-component SBOM passed. A reviewer then opened the
  exact repository artifact without an unidentified-developer warning and
  confirmed its displayed `v0.4.91 · 0849375d` identity. The package then used
  its bundled HWI to discover one previously certified signer, derive its
  authoritative public identity, reject duplicate creation, and open the
  existing wallet. A following non-spending check matched a newly revealed
  Testnet4 receive address exactly between Groot and the signer's trusted
  display. The reviewer then used a previously certified signer for one
  disposable Testnet4 payment: Groot's review matched before signing, the
  bundled HWI returned a valid hardware signature, Bitcoin Core accepted the
  finalized transaction, and a full app restart plus sync showed confirmed
  outgoing activity with the expected fee, remaining balance, label, and
  accounting. No wallet, signer, transaction, address, or node identifier is
  retained. The same-team HWI helper alone carries the explicitly approved
  library-validation entitlement required by its PyInstaller embedded runtime;
  Groot does not. This focused result does not transfer the broader v0.4.90
  lifecycle campaign or provide independent review.
- Packaged v0.4.28 Testnet4 testing with the original BitBox02 exposed that
  HWI 3.2.0 may wait for device-password entry inside aggregate discovery,
  before returning the locked device row. The former 30-second discovery
  deadline failed after a successful unlock. ADR 0043 and the same-version
  portable correction first extended that cancelable discovery window to five
  minutes; packaged Nova follow-up showed that this looked like an endless
  scan, so discovery is now capped at 90 seconds while selected-device review
  retains five minutes;
  physical retesting is still required before recording a pass.
- Packaged v0.4.29 testing subsequently disproved transient retries, custom-path
  keypool, direct-`getxpub` re-attestation, and canonical BIP84 keypool over
  Groot's cached HID path. The last candidate failed on both original BitBox02
  and Nova while Trezor and Ledger passed in the same package. HWI-owned
  rediscovery through global `--stdin` also failed on both BitBox models. The
  last certified Nova build used HWI 3.2.0 with ordinary documented argv, so
  v0.4.29 initial BitBox single-key import then required exactly one scanned
  BitBox row and invoked only a fixed non-sensitive BIP84 argv command. The HID
  path and fingerprint were not forwarded and the complete
  live identity proof remains mandatory; separate exact-model physical retests
  are still required.
- After the BitBoxApp pairing state was repaired, packaged v0.4.29 initial
  BIP84 import passed independently on the original BitBox02 and Nova. Nova
  then passed BIP84 trusted receive display, while the original model was
  enumerated as ready and failed unlock-required when the display command
  reopened the cached HID path. No verification was persisted. A later
  pre-Sep30 candidate kept the full live identity proof but reopened saved BitBox address
  display through HWI's exact fingerprint selector and provided a same-signer
  interactive retry. The Sep 30 correction supersedes that selector: account
  proof, retries, and trusted display now remain on the explicitly selected exact
  path, and empty/type/fingerprint-only action selection fails before spawn. Both
  exact models require packaged retesting on this newer boundary; the earlier
  Nova display pass is not inherited. ADR 0075's macOS passive picker is now
  implemented, but its packaged seven-device inventory and timing matrix remains
  open physical evidence.

GitHub issue state is intentionally not duplicated as a large static list. The
live tracker is <https://github.com/grootwallet/groot/issues>. At this snapshot,
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
