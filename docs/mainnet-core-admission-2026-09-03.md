# Mainnet pre-wallet Core admission — 2026-09-03

Status: implemented and independently reviewed on the isolated preparation branch.
ADR 0055 permits enabled-path certification in a non-distributable candidate;
live-Core candidate evidence remains pending.

## Security invariant

No mainnet wallet SQLite file may be created, opened for mutation, or opened for
identity inspection until trusted Rust has authenticated the approved local
Bitcoin Core backend and verified the exact compiled network and genesis. A
renderer assertion, environment toggle, saved public configuration, or unrelated
wallet session is not an admission.

## Implementation

- Both production SQLite constructors require a private `DatabaseOpenPermit` and
  validate it before calling SQLite. The release source-policy gate recognizes
  and byte-pins this boundary and rejects unpermitted, late-guarded, or alternate
  `Connection::open` calls. Its reviewed snapshot pins `wallet.rs` plus every
  production child module under `src-tauri/src/wallet`, and a crate-wide scan
  rejects alternate production SQLite disk opens; the three explicitly compiled
  wallet test/benchmark modules are excluded.
- `mainnet_core_admit` accepts only explicit protected user/password RPC
  authentication and the already constrained loopback-only HTTP `LocalCore`
  backend. Client construction validates the endpoint before network I/O; Core's
  chain and genesis are checked before admission is stored.
- Existing-wallet admission is bound to the selected wallet UUID and exact saved
  public Core configuration. Admission expires after 15 monotonic minutes, is
  cleared after successful unlock, and hands ownership to the authenticated
  per-wallet node session. If the Core password was rotated, the valid preflight
  still allows wallet unlock so the user can save the replacement protected
  credential; the stale saved session cannot connect. Lock and inactivity remove
  the session.
- New-wallet admission is scoped to one serialized creation attempt, expires after
  15 monotonic minutes, and is invalidated whenever that command exits. Software
  creation/recovery, external-signer creation,
  standard multisig creation, Groot multisig recovery, and BSMS recovery all need
  its permit before their first database open.
- A successfully validated new Core setup is encrypted under the new profile's
  credential before the registry commit. Any later failure removes the incomplete
  profile and its in-memory node session. Command exit clears unused admission.
- Exact-descriptor duplicate checks use a separate identity-inspection permit so
  they can inspect other same-network public wallet identities without pretending
  those wallets share the selected wallet's Core configuration.
- Stable `node_admission_required` and `mainnet_disabled` errors are represented at
  the frontend contract. RPC credentials remain native and are zeroized on every
  admission exit.
- Explicit hardware-operation cancellation also clears pending Core admission, so
  returning to wallet creation requires a fresh preflight.
- Mainnet onboarding never offers cross-wallet network-setup adoption, and both
  native listing and adoption commands reject it. The exact setup that passed
  admission is the only setup persisted into a new profile; cross-wallet adoption
  remains available only on test networks.

## Compatibility and scope

Registry v1, SQLite schemas, secret envelopes, public backups, descriptors,
proposals, and network-settings formats are unchanged; no migration is required.
Regtest, Signet, and Testnet4 database behavior is unchanged. This change affects
backend authorization order only and has no BIP impact.

The follow-on ADR 0055 branch adds a dedicated mainnet build target without
accepting ADR 0053 or transferring any Testnet4 physical evidence. Distribution
remains gated by review of that exact diff, two-machine reproducibility,
signed/notarized candidate validation, physical-device certification, and the
minimal-value mainnet rehearsal.

## Reproducible validation

Run from the repository root with the exact pinned Node, pnpm, and Rust toolchain:

```sh
pnpm validate
cd src-tauri
cargo fmt --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked --all-features
```

Additional release evidence remains:

```sh
pnpm network:check-builds
pnpm test:integration:regtest
pnpm test:sbom
```

Final preparation-branch results at the reviewed tree:

- pinned Node 24.19.0 `pnpm validate`: pass; 74 frontend test files and 366 tests
  passed, with zero Svelte errors or warnings;
- `cargo fmt --check`: pass;
- strict all-target, all-feature Clippy: pass with zero warnings;
- all-feature Rust tests: 390 passed, 12 ignored, 0 failed, plus 2/2 adversarial
  integration tests;
- source-policy unit tests: 10/10 passed, including allowed and rejected
  crate-wide database-open cases;
- the earlier full Regtest, native network-build, and deterministic 539-component
  SBOM evidence remains valid for this same implementation delta.

The internal read-only post-patch review found no remaining evidence-backed issue
in the pre-wallet Core admission boundary. It confirmed permit-first SQLite
opens, scope/config binding, monotonic expiry, cleanup and rollback paths,
credential zeroization, exact chain/genesis validation, crate-wide source-policy
coverage, and the independent disabled-mainnet gates. This is supporting evidence
only and does not replace the external independent review required by ADR 0053.

The eventual independent review must inspect the exact diff from the frozen
`codex/mainnet-enablement` tip through this branch tip and explicitly attempt:
database-open bypass, wrong scope, wrong selected wallet, changed public Core
configuration, expired/replayed admission, failure after partial profile creation,
duplicate-identity inspection, wrong chain/genesis, remote/non-loopback endpoints,
and secret/error egress.
