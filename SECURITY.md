# Groot security

Last internal review: 2026-08-09

Groot is security-sensitive wallet software under active development. The current native implementation is intended for disposable **regtest** testing. It has not completed an independent audit, physical hardware-wallet certification, or the mainnet release process. Do not use it with mainnet funds.

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
- Hardware wallets remain independent external signers. Groot never requests their seed or private keys.
- External-signer imports accept only bounded public BIP84 material and reject seed fields, xprvs/tprvs, mainnet keys, ambiguous paths, and non-canonical descriptors.
- The Vercel application is a deterministic browser demonstration without a wallet backend, signing keys, authentication service, hosted database, or multi-tenant state.

## Implemented hardening

### Secrets and credentials

- Software-wallet creation obtains exactly 32 bytes from Rust `OsRng`, backed by the native operating-system CSPRNG, and maps them directly to 24 BIP39 words. The fallible API aborts with `entropy_unavailable` rather than panicking or falling back, and the entropy buffer, mnemonic object, and derived seed are zeroized on success and failure. No key-generation entropy comes from JavaScript, time, process state, user input, a seeded user-space generator, or a raw CPU instruction used alone.
- Advanced creation can add a bounded transcript of physical coin flips or six-sided-die rolls. Rust validates it, commits the source/count/outcomes under one SHA-256 domain, and mixes that digest with the still-mandatory OS value under a separate domain. A hostile or predictable transcript cannot disable the OS source. The transcript is cleared after each attempt and is never persisted or logged; because it crosses the webview boundary, it is not protection against a compromised renderer or host.
- Device wrapping keys, AES-256 data keys, Argon2id salts, and AES-GCM nonces use the same fallible OS source. Any failure aborts secure storage; no cryptographic random value is reused or synthesized by the application.
- Generated 24-word BIP39 mnemonics remain in a bounded, zeroized Rust pending session and are presented by the native layer; they are not returned to the webview.
- Users may defer the exact-order backup challenge. The unverified marker is persisted per software wallet and remains visible until later verification succeeds. Later verification requires an unlocked wallet plus fresh wallet-passphrase authentication, decrypts the mnemonic only in Rust, and opens a native shuffled-word challenge without re-revealing or returning the ordered words. Renderer input cannot directly mark a backup verified.
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
- Single-key and multisig transaction preparation atomically commits BDK change derivation, the reviewed proposal, and optional acceleration lineage. Explicit rollback and real `SQLITE_FULL` tests prove interruption or exhausted storage leaves no proposal/lineage and does not consume a change address.
- Registry fault injection proves partial writes and pre-rename failures preserve the prior authoritative file and remove temporary state. SQLite transaction-abort evidence proves multi-row changes roll back across reopen; registry identity validation remains linear for large profile sets.
- Multisig metadata must match the descriptor checksum registered for the wallet.
- Filesystem deletion is not described as secure erasure because flash filesystems and backups can retain deleted data.

### Descriptors, Miniscript, PSBTs, and broadcast

- Descriptor parsing and policy compilation happen in Rust, preserve origins and network identity, reject private material, and require checksums on exported backups.
- Multisig creation rejects duplicate fingerprints/xpubs, invalid origins, wrong-network keys, unsafe thresholds, and browser-only virtual signers at the native boundary.
- Backup recovery recompiles policy and descriptors and rejects mismatched network, policy type, thresholds, recovery paths, private material, or noncanonical descriptors.
- Transaction review facts come from the persisted unsigned PSBT rather than UI recomputation. Recipient amount and stored fee must match exactly, and every other output must be proven wallet-controlled before review, signing, or broadcast.
- Review includes authenticated input amounts/outpoints/sequences, network, locktime, RBF state, output count, and an effective signed-size fee rate derived in Rust. Missing, foreign, duplicate, overspending, or fee-inconsistent inputs fail closed.
- Imported signatures must match the stored unsigned transaction and every non-signature PSBT field. Changed inputs, outputs, amounts, recipients, UTXO/script/key-origin metadata, proprietary fields, sighashes, or externally finalized scripts fail closed.
- Hardware signing, signature import, and broadcast are bound to the exact PSBT revision returned for review. A proposal changed after review must be reloaded and reviewed again.
- A proposal cannot become ready until the collected signatures satisfy BDK finalization.
- Broadcast verifies the returned transaction ID, handles an already-known expected transaction idempotently, and atomically records accepted status with its durable notification.
- Amounts are integer satoshis and fee rates are validated positive sat/vB values.
- Standard public BIP129/BSMS records are bounded, private-material rejected, canonical descriptor parsed, network checked, and first-address verified. Groot does not claim BIP129 encrypted signer-round support.
- Blockchain Commons UR v2 exchange accepts only bounded `crypto-psbt` payloads. Frame count, frame size, decoded size, canonical CBOR envelope, duplicate/out-of-order input, and PSBT magic are validated in Rust.
- A deterministic dependency-free hostile-input corpus applies malformed ASCII, Unicode, nesting, duplicate-field, boundary-size, and fixed mutation cases across PSBT, BSMS, external-signer, UR, and multipart import boundaries in every Rust test run.
- RBF and CPFP produce ordinary persisted PSBT proposals and therefore cannot bypass transaction review, signer identity, exact-PSBT merge validation, credential checks, or finalization.
- Recovery scan birthday and gap limit are bounded and persisted. Receive revelation and actual PSBT change output creation fail before exceeding that gap, including after canceled proposal churn, and the setting cannot be lowered below already-derived receive/change requirements. Full rescan is credential authenticated; the interface warns that a birthday set too late can omit history.

### Hardware-wallet transport

- HWI is executed directly without a shell and never searched through ambient `PATH`.
- The HWI executable is selected from an absolute configured or known installation path, canonicalized, required to be a regular file, and rejected on Unix when group- or world-writable.
- HWI subprocesses receive a cleared environment with only a Tauri-resolved canonical `HOME` restored for the BitBoxApp pairing cache, plus fixed argument arrays, bounded concurrent output reads, and a timeout/kill path. Stdin is null except for bounded Trezor/KeepKey PIN positions; those use a single-use expiring challenge, never appear in argv/logs, and are zeroized after use. Raw device stderr is discarded.
- Detected-but-locked devices remain visible with safe typed readiness states. Trezor empty-passphrase warnings fail closed until the user explicitly selects the seed-only standard wallet; Rust independently enforces that consent before import.
- Mounted public-key files are capped at 256 KiB and reject private/recovery material, extended private keys, wrong-network origins, malformed fingerprints, and non-tpub account keys before Rust descriptor validation.
- Every operation carries an explicit test/main chain, freshly enumerated device type and path, and exact expected fingerprint matching.
- Duplicate HWI records for one connection path are rejected as ambiguous. The persisted BDK external and internal descriptors are revalidated against authenticated hardware-wallet metadata on every database open.
- External-signer and multisig receive screens distinguish unverified Groot derivation from durable, address-specific on-device verification evidence. Verification re-enumerates the device, matches the saved policy fingerprint, derives the exact descriptor index in Rust, invokes the trusted display, and appends an immutable timestamped event only after the returned address decodes to the identical output script. Text must match exactly on the same network; the sole cross-prefix exception is Ledger Bitcoin Test on Regtest, where `tb1` and `bcrt1` encodings are accepted only when Rust proves their decoded scriptPubKeys are identical.
- User rejection, timeout, unavailable/busy hardware, missing xpubs, identity mismatch, malformed responses, and oversized output map to stable safe errors.
- USB hardware support is integration-ready, not physically certified. Vendor/model/firmware/host combinations must complete [`docs/hardware-certification.md`](docs/hardware-certification.md).

### Network and webview policy

- Native wallet code remains pinned to regtest. Rust rejects mainnet before opening wallet SQLite, and the release gate fails if either lock is changed. Dormant candidate policy separately requires exact Bitcoin genesis, loopback Core, one recipient, and a 1,000,000-satoshi cap; none enables mainnet.
- Local Bitcoin Core endpoints must be loopback. Remote endpoint policy rejects embedded credentials, cleartext non-loopback transport, forged presets, and network mismatches.
- Tauri capabilities remain minimal: no shell, filesystem, generic HTTP, clipboard-read, or remote-origin capability is granted.
- The Tauri CSP denies remote scripts, frames, objects, workers, and manifests. Camera media is limited to same-origin/blob capture for the explicit PSBT scanner and requires platform permission.
- Vercel responses set CSP, frame denial, MIME sniffing protection, strict referrer policy, restrictive Permissions Policy, COOP/CORP, and HSTS.
- External explorer links use `noopener noreferrer`.
- The browser demonstration has no server-side database or authorization surface, so row-level security is not applicable. Any future hosted multi-tenant database requires a dedicated ADR, deny-by-default RLS, tenant-isolation tests, service-role containment, and migration review.

### Supply-chain and CI controls

- Remote Bitcoin Core TLS activates `https-native` on the already-transitive, exactly pinned `minreq 2.14.1` transport. ADR 0020 removed its legacy Rustls 0.21/WebPKI 0.101.7 backend after three certificate-validation advisories; that vulnerable branch must remain absent from the lockfile. Platform TLS and trust-store differences remain part of remote-node certification.
- Direct JavaScript dependency versions, Node `24.19.0`, and pnpm `11.13.1` are pinned. Cargo and pnpm lockfiles are committed and automation uses `--locked` or `--frozen-lockfile`.
- Node package lifecycle scripts are disabled through the repository `.npmrc`; exact saves and pnpm store-integrity verification are enabled.
- GitHub Actions are pinned to immutable commit SHAs, job permissions default to read-only, and checkout credentials are not persisted.
- Pull-request CI does not publish wallet release artifacts.
- Offline release tooling streams artifact hashes and verifies an exact signed-update manifest. Separate bounded HWI provenance tooling binds the executable, source archive, license, version, and replacement policy; disposable mutation tests run in `pnpm validate` without adding an updater or network client to the binary.
- CI runs npm and RustSec advisory checks. A green scanner is evidence, not release authorization.
- Vendored Rust sources, lockfiles, CI workflows, package-manager settings, Tauri capabilities, and release scripts require explicit supply-chain review when changed.
- Quality and mainnet shell gates use `rg` when present and a portable system `grep` fallback otherwise; validation does not require installing an extra workstation package.
- The exact pinned `ur` 0.4.1 crate was source-reviewed before use; it forbids unsafe code and has no build script. The exact pinned `jsonrpc` 0.18.0 proxy feature and `socks` 0.3.4 source were reviewed. Direct RPC explicitly uses the native-TLS-backed Minreq transport because the proxy feature changes the legacy simple transport globally; only an explicit onion configuration constructs SOCKS. SOCKS remains a narrow socket transport boundary and receives no wallet key material.

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
- Hardware-wallet metadata and the registry were authenticated, but a loaded BDK database was not re-compared against both saved external and internal descriptors on every open. Database substitution or internal-descriptor corruption now returns `wallet_corrupt` before derivation, review, signing, or broadcast.
- Signed-PSBT merge accepted the same unsigned transaction while permitting unrelated PSBT metadata additions. Imports now permit signature additions only and reject all other metadata mutations.
- Hardware signing/import/broadcast could load a newer proposal revision than the renderer had reviewed. The exact reviewed PSBT revision is now required at each boundary and concurrent changes return `proposal_mismatch`.
- Duplicate HWI records sharing one connection identity could be selected with first-match behavior. They now fail as `hardware_ambiguous` and require disconnect/rescan.
- Hardware-backed receive addresses were described as verifiable but the command was not wired for external-signer wallets and the UI did not distinguish verification state. Both external-signer and multisig receive flows now provide exact device-display comparison. A successful match appends an address-specific timestamped event in Rust after connected-signer identity and decoded output checks pass; the durable green status can therefore be reconstructed after restart without treating the event as permanent trust in the device or firmware.
- Review omitted authenticated input values/sequences, locktime, RBF state, and network, and displayed the requested fee target rather than a PSBT/descriptor-derived effective rate. Rust now returns those authoritative facts and rejects foreign/duplicate/missing inputs and impossible totals.

Local evidence for this audit includes 131 Rust tests under strict Clippy, 78 frontend unit tests, the full boundary/release/check/build gate, 87 passing Playwright journeys with one intentional project skip, and two isolated Bitcoin Core 31.1 regtest integrations covering bounded descriptor recovery and real 2-of-3 PSBT signing/finalization/broadcast. CI downloads that exact official Core archive over HTTPS, verifies its pinned SHA-256 before extraction, and runs the same isolated harness on every change. `pnpm audit --prod --audit-level high` reports no known vulnerabilities. The pinned CI version of `cargo-audit` reports no vulnerabilities; its 17 pre-existing allowed warnings remain release follow-up items. Current CI advisory jobs remain required release evidence.

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
