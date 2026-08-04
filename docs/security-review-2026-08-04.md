# Security and reliability review — 2026-08-04

Status: internal hardening review complete for the regtest build. This is not an external audit and does not approve mainnet.

## Scope

The review covered the Svelte/WalletPort boundary, Tauri commands, BDK/Miniscript descriptors and PSBTs, secret storage, wallet registry and SQLite persistence, Bitcoin Core RPC, HWI process execution, backups, notifications, destructive actions, CI, dependency locks, and desktop/mobile browser flows.

## Controls verified or added

- Generated mnemonics remain Rust-owned and zeroized; credential/recovery inputs are cleared after every frontend attempt.
- Secret envelopes use explicit Argon2id parameters, authenticated encryption, a device wrapping key, bounded metadata, and RAII zeroization on every return path.
- Unlock sessions are wallet-UUID scoped, idle-expiring, switch-safe, and explicitly lockable. Authentication cooldown persists per wallet across restarts.
- State-changing native commands are serialized. Proposal signature merges use compare-and-swap persistence and cannot become ready unless BDK can finalize the collected signatures.
- Amounts are integer satoshis. Review values come from the persisted PSBT proposal, including the fee rate actually applied by the builder.
- Broadcast verifies the returned txid, treats an already-known expected transaction idempotently, does not report post-acceptance sync failure as broadcast failure, and atomically records proposal status plus its notification.
- Notifications are unique, durable, ordered, pending until acknowledgement, and honestly documented as at-least-once delivery.
- Single-key deletion requires credential plus exact confirmation. Multisig deletion requires credential, exact name, and a recovery drill bound to the current descriptor.
- Backup imports recompile descriptors/policies and reject mismatched policy type, threshold, paths, network, private material, or noncanonical descriptors.
- Local Core endpoints must be loopback. Remote backend policy rejects URL credentials, cleartext remote transport, and forged presets.
- HWI never uses a shell or ambient `PATH`; it has bounded arguments/output, null stdin, timeout/kill, discarded raw stderr, explicit chain, and exact connected-fingerprint checks.
- File/air-gap, wallet/cosigner, network, and policy inputs are bounded and reject control data, wrong networks, duplicate identities, and unsafe thresholds.
- CI tools, Node packages, Rust toolchain, and GitHub Actions are pinned; Cargo operations use the committed lockfile. npm and RustSec scans report no known vulnerabilities. RustSec still reports inherited unmaintained/unsound warnings in the Tauri Linux GTK3 dependency tree, tracked as a release dependency risk.

## Evidence

- Frontend policy: 100% statements, branches, functions, and lines.
- Rust security core: 99.53% lines and 100% functions; 62 Rust unit tests pass under strict Clippy.
- Whole Rust library regression floor: 55.46% lines and 53.69% functions. This number includes platform/Tauri orchestration that cannot be honestly covered by portable unit tests.
- Playwright: 43 passed across desktop Chromium and mobile WebKit; one desktop-only duplicate of a mobile overflow assertion is intentionally skipped.
- Live regtest: real fresh 2-of-3 descriptors, funding, PSBT construction, two signatures, finalization, Core broadcast, confirmation, and BDK resync pass.
- Production Svelte build, architecture boundary check, mainnet release gate, npm audit, Cargo audit, formatting, tests, and strict linting pass.

## Mainnet and production blockers

These are not defects hidden by the review; they are explicit release gates:

1. Independent external security review and remediation.
2. Reproducible signed builds, SBOM/provenance, update-channel review, and HWI artifact hash/version verification.
3. Physical certification for each supported hardware model/firmware/host combination, including policy registration, address display, rejection, reconnect, and changed-PSBT cases.
4. Android Keystore and Windows credential-vault implementation/certification; Apple Keychain and native backup UI still need platform accessibility/screenshot/lifecycle evidence.
5. Verified backend chain identity and the initial user-controlled-Core mainnet adapter; remote Core/Esplora privacy and authentication require separate review.
6. Funded delayed/recovery branch tests before, at, and after timelock boundaries, including reorgs and per-UTXO maturity.
7. Single-instance enforcement or an interprocess registry lock before concurrent app processes are supported.
8. Pagination/birthday-based scanning and large-history performance profiling before claiming production-scale speed.

ADR 0012 keeps mainnet unavailable until the canonical release checklist is independently approved.
