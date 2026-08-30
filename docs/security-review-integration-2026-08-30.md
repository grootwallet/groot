# Pre-mainnet security review integration — 2026-08-30

## Decision

The supplied independent review was rechecked against the exact proposed main and mobile-coordination diffs. Every validated code fix was accepted after correction and regression testing. The reviewed changes are suitable for integration into development branches, but do not authorize mainnet.

## Integrated remediation

Main was reviewed from `682d48f` and includes:

- `8a937ba` — bound and canonicalize UR fountain headers before decoder work;
- `e8b594a` plus `38c99a0` — gate the complete Tauri capability surface and reject alternate files, directories, symlinks, JSON, or TOML grants;
- `f20d7e9` — compare extended keys against the compiled `NetworkKind`;
- `974a3c3` — clear the Overview credential after use and on teardown;
- `80ddbbc` — zeroize HWI PIN command buffers on every return path.

The mobile-coordination candidate includes the supplied stack through `c1c4a84`, plus:

- `4d8e274` — fail closed before an iOS recovery view is attached to a screen, recheck capture state on appearance, and expose each recovery word accurately to VoiceOver;
- the reviewed main remediation merged at `e838768`.

## Independent integration findings

The integration review found two issues that blocked accepting the proposals unchanged:

1. The first capability gate inspected only immediate JSON files. Tauri also accepts nested or TOML capabilities, so an added grant could bypass the check. The corrected gate permits exactly one regular root `default.json` and has injection regressions for extra JSON, nested directories, and TOML.
2. The iOS recovery controller checked `UIScreen.isCaptured` only during `viewDidLoad`, before the view necessarily had a window. A recording already active at presentation could therefore expose the words. The corrected controller fails closed without a screen and rechecks in both appearance callbacks. Its accessibility label now includes the actual word rather than only its index.

No other reportable vulnerability survived the two complete diff scans after validation. The main UR/network/credential/HWI fixes and the mobile bounds, serialization, staging-PIN throttle, status authorization, arithmetic, and keyboard/clipboard controls matched their stated invariants.

## Verification evidence

On reviewed main:

- `pnpm validate`: 70 Vitest files / 326 tests, Svelte diagnostics clean, production build and all repository gates passed;
- `cargo fmt --check` and strict all-feature Clippy passed;
- `cargo test --locked --all-features`: 359 library tests passed, 7 intentionally ignored; two adversarial-input tests passed; four harness-only tests were ignored by that command;
- `pnpm test:acceptance`: 167 passed, 3 intentional platform skips.

On the combined mobile candidate:

- `pnpm validate`: 73 Vitest files / 359 tests, Svelte diagnostics clean, production build and all repository gates passed;
- `cargo fmt --check` and strict all-feature Clippy passed;
- `cargo test --locked --all-features`: 395 library tests passed, 8 intentionally ignored; two adversarial-input tests passed; four harness-only tests were ignored by that command;
- `cargo check --locked --target aarch64-apple-ios --all-features` passed;
- `pnpm test:acceptance`: 167 passed, 3 intentional platform skips;
- `pnpm test:integration:regtest` covers compact filters, RBF/CPFP, descriptor recovery, delayed policies, real 2-of-3 signing/broadcast, and the funded mobile-cosigner review/sign/finalize/broadcast round trip. The descriptor suite runs on its own disposable Core node so its 30-second resource assertion is not distorted by state accumulated in preceding tests; test RPC calls also have an explicit bounded 30-second timeout.

## Remaining release work

The source review and automated gates do not replace:

- physical-iPhone verification of capture transitions, VoiceOver output, keyboard behavior, backgrounding, screenshots, and app-switcher snapshots;
- physical hardware-wallet certification and external coordinator interoperability;
- signed/notarized package, crash-artifact, and update evidence; the unsigned
  reproducibility evidence was later completed for frozen commit `2110eaf` and
  is recorded in
  [`reproducible-mainnet-builds-2026-09-04.md`](reproducible-mainnet-builds-2026-09-04.md);
- funded Signet and Testnet4 rehearsal, recovery, reorg, and lifecycle evidence;
- a final independent review of the exact release candidate and the full penetration-test scope.

At the time of this review, mainnet remained absent from the build allowlist.
Mainnet is now compile-time enabled only for the separately gated candidate,
and the canonical release checklist remains blocked by its other open rows.
