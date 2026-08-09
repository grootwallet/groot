# Satchel security

Last internal review: 2026-08-09

Satchel is security-sensitive wallet software under active development. The current native implementation is intended for disposable **regtest** testing. It has not completed an independent audit, physical hardware-wallet certification, or the mainnet release process. Do not use it with mainnet funds.

This document summarizes the security posture and the hardening work present in this repository. Canonical controls are in [`docs/security-model.md`](docs/security-model.md); the attacker model and attack-vector register are in [`docs/mainnet-threat-model.md`](docs/mainnet-threat-model.md). Release authorization remains controlled by [`docs/mainnet-release-checklist.md`](docs/mainnet-release-checklist.md) and ADR 0012.

## Reporting a vulnerability

Do not disclose a suspected vulnerability, mnemonic, PIN, descriptor, xpub, device fingerprint, device path, PSBT, transaction metadata, or wallet database in a public issue.

Prefer a private GitHub Security Advisory for this repository. Include only the minimum reproduction information necessary, redact wallet/device identifiers, state the affected commit and platform, and use regtest data. If private advisories are unavailable, contact the repository owner privately before sharing technical details.

Reports should describe:

- the affected boundary and expected invariant;
- a minimal regtest reproduction;
- impact and required attacker access;
- whether secrets, signing authority, transaction intent, persistence, or availability are affected;
- suggested remediation, if known.

## Security boundaries

- Rust/Tauri owns mnemonics, key derivation, credential verification, signing material, descriptors, BDK state, PSBT validation/finalization, persistence, synchronization, and broadcast.
- Svelte owns presentation and public-data orchestration through `WalletPort`; it is not wallet truth.
- Bitcoin Core, Esplora responses, files, QR payloads, backups, descriptors, PSBTs, HWI output, and USB devices are treated as adversarial inputs.
- Hardware wallets remain independent external signers. Satchel never requests their seed or private keys.
- External-signer imports accept only bounded public BIP84 material and reject seed fields, xprvs/tprvs, mainnet keys, ambiguous paths, and non-canonical descriptors.
- The Vercel application is a deterministic browser demonstration without a wallet backend, signing keys, authentication service, hosted database, or multi-tenant state.

## Implemented hardening

### Secrets and credentials

- Software-wallet creation obtains exactly 32 bytes from Rust `OsRng`, backed by the native operating-system CSPRNG, and maps them directly to 24 BIP39 words. The fallible API aborts with `entropy_unavailable` rather than panicking or falling back, and the entropy buffer, mnemonic object, and derived seed are zeroized on success and failure. No key-generation entropy comes from JavaScript, time, process state, user input, a seeded user-space generator, or a raw CPU instruction used alone.
- Advanced creation can add a bounded transcript of physical coin flips or six-sided-die rolls. Rust validates it, commits the source/count/outcomes under one SHA-256 domain, and mixes that digest with the still-mandatory OS value under a separate domain. A hostile or predictable transcript cannot disable the OS source. The transcript is cleared after each attempt and is never persisted or logged; because it crosses the webview boundary, it is not protection against a compromised renderer or host.
- Device wrapping keys, AES-256 data keys, Argon2id salts, and AES-GCM nonces use the same fallible OS source. Any failure aborts secure storage; no cryptographic random value is reused or synthesized by the application.
- Generated 24-word BIP39 mnemonics remain in a bounded, zeroized Rust pending session and are presented by the native layer; they are not returned to the webview.
- The wallet credential is both the BIP39 passphrase and app unlock/signing PIN. A wrong credential returns a stable `invalid_credential` failure instead of deriving and appearing to open another wallet.
- Credentials, mnemonics, xprvs, private descriptors, decrypted signing material, and native command payloads are not logged or included in analytics.
- Credential and mnemonic IPC inputs have explicit byte limits. File, backup, descriptor, PSBT, HWI argument, and HWI output boundaries are also bounded.
- Every credential-bearing Svelte route clears its field after an attempt and on component teardown.
- Secret envelopes require both an Argon2id credential-derived key and a device wrapping key, use authenticated encryption, and zeroize decrypted material on every return path.
- Apple Keychain lookup now distinguishes “not found” from denial or unavailability. A denied or failed lookup fails closed and cannot silently create a replacement wrapping key.
- macOS can retry an inaccessible existing item through the original Keychain Services authorization path, then zeroizing-cache a successful read for that app launch. No key enters the webview, a cancelled prompt stays locked, and production signing remains required for stable cross-launch identity.

### Authentication and wallet isolation

- Unlock sessions are scoped to the selected wallet UUID, expire after five minutes of wallet inactivity, clear on wallet switch or explicit lock, and are never reused across profiles.
- Authentication throttling persists per wallet across restarts.
- Wallet profiles use isolated UUID-backed storage directories.
- Per-wallet Core RPC URLs are public configuration; RPC passwords are encrypted with the wallet credential plus device wrapping key, loaded only for that wallet's unlocked session, and cleared on lock/switch. Direct remote RPC is HTTPS-only. `.onion` RPC may use HTTP only through an explicit loopback SOCKS5 proxy; credentials in URLs, non-loopback proxies, and onion endpoints without Tor are rejected.
- Single-key deletion requires the wallet credential and exact confirmation. Multisig deletion additionally requires the exact wallet name and a successful recovery drill bound to the current descriptor.
- Disposable locked-wallet reset is restricted to regtest and requires the exact `RESET REGTEST` confirmation.

### Filesystem, registry, and SQLite

- Wallet databases, registries, secure metadata, descriptor metadata, and private JSON reject symlinks and non-regular files.
- Private reads are bounded. Private writes are atomic, fsynced, and owner-only on Unix; wallet directories are owner-only.
- SQLite database files are forced to owner-only mode on Unix.
- Production SQLite connections enable a bounded busy timeout, foreign keys, `trusted_schema=OFF`, and `SQLITE_DBCONFIG_DEFENSIVE`.
- State-changing native commands are serialized. Proposal signatures use compare-and-swap persistence to avoid lost updates.
- Multisig metadata must match the descriptor checksum registered for the wallet.
- Filesystem deletion is not described as secure erasure because flash filesystems and backups can retain deleted data.

### Descriptors, Miniscript, PSBTs, and broadcast

- Descriptor parsing and policy compilation happen in Rust, preserve origins and network identity, reject private material, and require checksums on exported backups.
- Multisig creation rejects duplicate fingerprints/xpubs, invalid origins, wrong-network keys, unsafe thresholds, and browser-only virtual signers at the native boundary.
- Backup recovery recompiles policy and descriptors and rejects mismatched network, policy type, thresholds, recovery paths, private material, or noncanonical descriptors.
- Transaction review facts come from the persisted unsigned PSBT rather than UI recomputation. Recipient amount and stored fee must match exactly, and every other output must be proven wallet-controlled before review, signing, or broadcast.
- Imported signatures must match the stored unsigned transaction and expected descriptor identity. Changed inputs, outputs, amounts, recipients, origins, sighashes, or externally finalized scripts fail closed.
- A proposal cannot become ready until the collected signatures satisfy BDK finalization.
- Broadcast verifies the returned transaction ID, handles an already-known expected transaction idempotently, and atomically records accepted status with its durable notification.
- Amounts are integer satoshis and fee rates are validated positive sat/vB values.
- Standard public BIP129/BSMS records are bounded, private-material rejected, canonical descriptor parsed, network checked, and first-address verified. Satchel does not claim BIP129 encrypted signer-round support.
- Blockchain Commons UR v2 exchange accepts only bounded `crypto-psbt` payloads. Frame count, frame size, decoded size, canonical CBOR envelope, duplicate/out-of-order input, and PSBT magic are validated in Rust.
- RBF and CPFP produce ordinary persisted PSBT proposals and therefore cannot bypass transaction review, signer identity, exact-PSBT merge validation, credential checks, or finalization.
- Recovery scan birthday and gap limit are bounded and persisted. Receive revelation and actual PSBT change output creation fail before exceeding that gap, including after canceled proposal churn, and the setting cannot be lowered below already-derived receive/change requirements. Full rescan is credential authenticated; the interface warns that a birthday set too late can omit history.

### Hardware-wallet transport

- HWI is executed directly without a shell and never searched through ambient `PATH`.
- The HWI executable is selected from an absolute configured or known installation path, canonicalized, required to be a regular file, and rejected on Unix when group- or world-writable.
- HWI subprocesses receive a cleared environment with only a Tauri-resolved canonical `HOME` restored for the BitBoxApp pairing cache, plus fixed argument arrays, bounded concurrent output reads, and a timeout/kill path. Stdin is null except for bounded Trezor/KeepKey PIN positions; those use a single-use expiring challenge, never appear in argv/logs, and are zeroized after use. Raw device stderr is discarded.
- Detected-but-locked devices remain visible with safe typed readiness states. Trezor empty-passphrase warnings fail closed until the user explicitly selects the seed-only standard wallet; Rust independently enforces that consent before import.
- Mounted public-key files are capped at 256 KiB and reject private/recovery material, extended private keys, wrong-network origins, malformed fingerprints, and non-tpub account keys before Rust descriptor validation.
- Every operation carries an explicit test/main chain, freshly enumerated device type and path, and exact expected fingerprint matching.
- User rejection, timeout, unavailable/busy hardware, missing xpubs, identity mismatch, malformed responses, and oversized output map to stable safe errors.
- USB hardware support is integration-ready, not physically certified. Vendor/model/firmware/host combinations must complete [`docs/hardware-certification.md`](docs/hardware-certification.md).

### Network and webview policy

- Native wallet code remains pinned to regtest. The release gate fails if mainnet is introduced without the approved ADR/checklist process.
- Local Bitcoin Core endpoints must be loopback. Remote endpoint policy rejects embedded credentials, cleartext non-loopback transport, forged presets, and network mismatches.
- Tauri capabilities remain minimal: no shell, filesystem, generic HTTP, clipboard-read, or remote-origin capability is granted.
- The Tauri CSP denies remote scripts, frames, objects, workers, and manifests. Camera media is limited to same-origin/blob capture for the explicit PSBT scanner and requires platform permission.
- Vercel responses set CSP, frame denial, MIME sniffing protection, strict referrer policy, restrictive Permissions Policy, COOP/CORP, and HSTS.
- External explorer links use `noopener noreferrer`.
- The browser demonstration has no server-side database or authorization surface, so row-level security is not applicable. Any future hosted multi-tenant database requires a dedicated ADR, deny-by-default RLS, tenant-isolation tests, service-role containment, and migration review.

### Supply-chain and CI controls

- Remote Bitcoin Core TLS activates `https-rustls` on the already-transitive, exactly pinned `minreq 2.14.1` transport. The lockfile adds the rustls 0.21 closure (`ring`, `rustls-webpki`, `sct`, `untrusted`, `webpki-roots`, and platform `windows-sys`) with registry checksums. This exception has a narrow RPC-TLS purpose; advisory and license scans remain release evidence.
- Direct JavaScript dependency versions, Node `22.22.0`, and pnpm `11.13.1` are pinned. Cargo and pnpm lockfiles are committed and automation uses `--locked` or `--frozen-lockfile`.
- Node package lifecycle scripts are disabled through the repository `.npmrc`; exact saves and pnpm store-integrity verification are enabled.
- GitHub Actions are pinned to immutable commit SHAs, job permissions default to read-only, and checkout credentials are not persisted.
- Pull-request CI does not publish wallet release artifacts.
- CI runs npm and RustSec advisory checks. A green scanner is evidence, not release authorization.
- Vendored Rust sources, lockfiles, CI workflows, package-manager settings, Tauri capabilities, and release scripts require explicit supply-chain review when changed.
- Quality and mainnet shell gates use `rg` when present and a portable system `grep` fallback otherwise; validation does not require installing an extra workstation package.
- The exact pinned `ur` 0.4.1 crate was source-reviewed before use; it forbids unsafe code and has no build script. The exact pinned `jsonrpc` 0.18.0 proxy feature and `socks` 0.3.4 source were reviewed. Direct RPC explicitly uses the rustls-backed minreq transport because the proxy feature changes the legacy simple transport globally; only an explicit onion configuration constructs SOCKS. SOCKS remains a narrow socket transport boundary and receives no wallet key material.

## Verification evidence

The 2026-08-05 pre-mainnet interoperability pass produced the following local evidence:

- architecture boundary and mainnet release gates pass;
- `svelte-check` reports zero errors and zero warnings;
- 25 frontend unit tests pass;
- frontend wallet/miniscript policy coverage is 100% for statements, branches, functions, and lines;
- 98 Rust unit tests pass under strict Clippy with warnings denied;
- the scoped Rust security-core gate passes at 99.56% of lines, 100% of functions, and 97.13% of regions;
- 61 Playwright journeys pass across desktop Chromium and mobile WebKit, with one intentionally skipped desktop duplicate;
- live Core regtest covers 2-of-3 funding/signing/broadcast, confirmation, RBF replacement, CPFP package broadcast, and clean-wallet birthday/gap-limit recovery;
- the production static Svelte build passes;
- repository diff whitespace validation passes.

The detailed current evidence and scope qualifications are recorded in [`docs/security-review-2026-08-05.md`](docs/security-review-2026-08-05.md). Browser fixtures, virtual signers, and automated tests do not constitute physical hardware certification or an independent security audit.

Run the portable local gate with:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm validate
```

Run the Rust gate with:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let/src-tauri
cargo fmt --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked --all-features
```

Advisory scans require current registry access. CI must show both JavaScript and Rust advisory jobs green for release evidence.

## 2026-08-09 internal audit

This internal code audit traced address derivation, descriptor identity, proposal construction and persistence, PSBT import, change ownership, signing, broadcast, recovery scanning, session isolation, storage hardening, hardware process execution, and mainnet gates. It added bounded adversarial regression tests and fixed these confirmed gaps:

- Receive-address creation could advance beyond the configured recoverable descriptor gap. It now fails atomically before reveal, and the gap cannot be lowered below already derived receive/change runs.
- Repeated canceled proposals could consume internal indexes before a later broadcast used change. Every prepared transaction now proves its actual internal output remains within the configured recovery gap before wallet state is persisted.
- Proposal review treated every non-recipient output as change without independently proving ownership. Single-key, external-signer, multisig, RBF, and CPFP paths now reject any such output not controlled by the selected wallet.
- Single-key signing reloaded only a PSBT after restart. It now retains and revalidates the persisted recipient, amount, and fee immediately before signing.
- Single-key review omitted authoritative change and output-count details. The Rust DTO and review UI now expose the verified change amount/address and transaction shape.
- A browser fixture journey attempted to sign a newly created policy with virtual devices whose fingerprints were not members of that policy. The fixture now preserves exact device-to-policy identity instead of simulating signatures from unrelated devices.

Local evidence for this audit includes 121 Rust tests under strict Clippy, 76 frontend unit tests, the full boundary/release/check/build gate, 81 previously green Playwright journeys plus the corrected desktop/mobile signer-identity regression, and direct desktop/mobile inspection of the single-key change review at 1180×780 and 390×844 with no horizontal overflow. Dependency advisory lookup could not complete in the restricted workspace because registry DNS was unavailable, and `cargo-audit` was not installed; current CI advisory jobs remain required release evidence.

This is an internal code audit and bounded adversarial test pass, not an independent penetration test, cryptographic proof, physical-device certification, or authorization for mainnet release.

## Mainnet blockers

Mainnet remains intentionally unavailable. At minimum, release requires:

1. independent external security review and remediation;
2. reproducible signed builds, SBOM/provenance, reviewed update delivery, and pinned/verified HWI artifacts;
3. physical certification for every supported hardware-wallet model, firmware, host OS, address-display flow, rejection path, reconnect path, and signing flow;
4. Android Keystore and Windows credential-vault implementation and certification, plus Apple lifecycle/accessibility evidence;
5. verified backend chain identity and reviewed mainnet Core/remote-backend privacy and authentication;
6. funded recovery/timelock boundary and reorg testing;
7. single-instance enforcement or an interprocess registry lock;
8. large-history scanning, pagination, and performance validation;
9. green, current dependency advisory checks and closure of applicable inherited dependency warnings;
10. explicit approval of the canonical mainnet checklist.

No test count, coverage percentage, internal review, or hardware simulator result overrides these blockers.
