# Groot security

Last review integration: 2026-09-03

Groot is security-sensitive wallet software under active development. The native implementation supports disposable Regtest testing, compile-time-isolated Signet/Testnet4 rehearsal builds, and the separately isolated ADR 0055 mainnet certification candidate. That candidate is authorized only for controlled certification and, after its preceding gates pass, a minimal-value owner-operated rehearsal. It is not authorized for distribution, ordinary use, or meaningful mainnet funds.

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
- External-signer imports accept only bounded public BIP84 material and reject seed fields, xprvs/tprvs, wrong-network keys, ambiguous paths, and non-canonical descriptors.
- The Vercel application is a deterministic browser demonstration without a wallet backend, signing keys, authentication service, hosted database, or multi-tenant state.

## Implemented hardening

### Secrets and credentials

- Software-wallet creation obtains exactly 32 bytes from Rust `OsRng`, backed by the native operating-system CSPRNG, and maps them directly to 24 BIP39 words. The fallible API aborts with `entropy_unavailable` rather than panicking or falling back, and the entropy buffer, mnemonic object, and derived seed are zeroized on success and failure. No key-generation entropy comes from JavaScript, time, process state, user input, a seeded user-space generator, or a raw CPU instruction used alone.
- Advanced creation can add a bounded transcript of physical coin flips or six-sided-die rolls. Rust validates it, commits the source/count/outcomes under one SHA-256 domain, and mixes that digest with the still-mandatory OS value under a separate domain. A hostile or predictable transcript cannot disable the OS source. The transcript is cleared after each attempt and is never persisted or logged; because it crosses the webview boundary, it is not protection against a compromised renderer or host.
- Device wrapping keys, AES-256 data keys, Argon2id salts, and AES-GCM nonces use the same fallible OS source. Any failure aborts secure storage; no cryptographic random value is reused or synthesized by the application.
- Generated 24-word BIP39 mnemonics remain in a bounded, zeroized Rust pending session and are presented by the native layer; they are not returned to the webview.
- Recovery mnemonics are entered in a native application sheet and move directly into bounded Rust parsing and wallet construction. They are never stored in renderer state or accepted as a Tauri command argument; unsupported platforms fail closed instead of using a browser form.
- Users may defer the exact-order backup challenge. The unverified marker is persisted per software wallet and remains visible until later verification succeeds. Later verification requires an unlocked wallet plus fresh wallet-passphrase authentication, decrypts the mnemonic only in Rust, and opens a native shuffled-word challenge without re-revealing or returning the ordered words. Renderer input cannot directly mark a backup verified.
- The wallet credential is both the BIP39 passphrase and app unlock/signing PIN. A wrong credential returns a stable `invalid_credential` failure instead of deriving and appearing to open another wallet.
- New software-wallet creation requires at least 16 Unicode characters without composition rules, so letters-only passphrases remain valid. Recovery and every existing-wallet operation continue accepting the exact historical non-empty passphrase because changing a BIP39 passphrase selects a different wallet. The remediation record is [`docs/security-remediation-2026-09-01.md`](docs/security-remediation-2026-09-01.md).
- Credentials, mnemonics, xprvs, private descriptors, decrypted signing material, and native command payloads are not logged or included in analytics.
- Credential IPC inputs and native recovery-mnemonic input have explicit byte limits. File, backup, descriptor, PSBT, HWI argument, and HWI output boundaries are also bounded.
- Every credential-bearing Svelte route clears its field after an attempt and on component teardown.
- Credential-bearing Settings dialogs also clear passphrases, RPC passwords, destructive confirmation text, and related error state on every dismissal path and before reopening.
- Version-3 secret envelopes use authenticated encryption with an Argon2id credential-derived key wrapping a separately generated AES-256 data key. They are portable across supported systems and do not depend on a platform Keychain or device key. Decrypted material is zeroized on every return path. A copied encrypted profile therefore permits offline credential guessing; strong wallet credentials, reviewed Argon2id calibration, full-disk encryption, and host security remain required defense in depth.
- Authenticated version-2 device-bound envelopes are accepted only as a compatibility input. After the credential successfully authenticates and decrypts the envelope, Groot rewrites its metadata as a portable version-3 envelope without the obsolete device-wrapping fields.

### Authentication and wallet isolation

- Unlock sessions are scoped to wallet UUIDs and are never reused across profiles. Switching wallets preserves each independent session until its own inactivity deadline; explicit lock clears only the selected wallet.
- Authentication throttling covers every credential-verification command, persists per wallet across restarts, and adds a process-monotonic retry floor. Durable cooldown still depends on operating-system wall time; ADR 0028 records the restart-plus-clock-control residual.
- Failed wallet creation or recovery removes the partial profile directory. Version-3 profile creation does not create a UUID-scoped device key.
- Wallet profiles use isolated UUID-backed storage directories.
- Per-wallet Core RPC URLs are public configuration; the complete validated route, authentication mode, username, proxy, and RPC password are one encrypted record protected by the wallet credential. Runtime use requires the public configuration to match that protected record exactly, including after unlock, so public-file tampering cannot redirect a saved password. Legacy password-only records stay disconnected until the user reviews and re-saves them. Direct remote RPC is HTTPS-only. `.onion` RPC may use HTTP only through an explicit loopback SOCKS5 proxy; credentials in URLs, non-loopback proxies, and onion endpoints without Tor are rejected.
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
- Imported signatures must match the stored unsigned transaction and every non-signature PSBT field. Changed inputs, outputs, amounts, recipients, UTXO/script/key-origin metadata, proprietary fields, sighashes, or externally finalized scripts fail closed. Every ECDSA partial signature is also verified against the actual input sighash and public key before counting, merge, or persistence; invalid signatures return `invalid_signature` without mutation.
- Saved multisig descriptors and cosigner xpub metadata are unavailable while the selected wallet is locked.
- Hardware signing, signature import, and broadcast are bound to the exact PSBT revision returned for review. A proposal changed after review must be reloaded and reviewed again.
- A proposal cannot become ready until the collected signatures satisfy BDK finalization.
- Broadcast verifies the returned transaction ID, handles an already-known expected transaction idempotently, and atomically records accepted status with its durable notification.
- Amounts are integer satoshis and fee rates are validated positive sat/vB values.
- Standard public BIP129/BSMS records are bounded, private-material rejected, canonical descriptor parsed, network checked, and first-address verified. Groot does not claim BIP129 encrypted signer-round support.
- Blockchain Commons UR v2 exchange accepts only bounded `crypto-psbt` payloads. Frame count, frame size, decoded size, canonical CBOR envelope, duplicate/out-of-order input, and PSBT magic are validated in Rust. Every multipart fountain frame's CBOR part header is additionally pre-validated before the `ur` decoder sees it: only canonical minimal-length arrays are accepted, declared sequence counts can never exceed the configured frame bound, and declared message/fragment sizes stay within payload/frame bounds, so a hostile frame cannot amplify decoder allocations or CPU.
- A deterministic dependency-free hostile-input corpus applies malformed ASCII, Unicode, nesting, duplicate-field, boundary-size, and fixed mutation cases across PSBT, BSMS, external-signer, UR, and multipart import boundaries in every Rust test run.
- RBF and CPFP produce ordinary persisted PSBT proposals and therefore cannot bypass transaction review, signer identity, exact-PSBT merge validation, credential checks, or finalization.
- Recovery scan birthday and gap limit are bounded and persisted. Receive revelation and actual PSBT change output creation fail before exceeding that gap, including after canceled proposal churn, and the setting cannot be lowered below already-derived receive/change requirements. Full rescan is credential authenticated; the interface warns that a birthday set too late can omit history.

### Hardware-wallet transport

- HWI is executed directly without a shell and never searched through ambient `PATH`.
- The HWI executable is selected from an absolute configured or known installation path, canonicalized, and required to be a regular file. Regtest permits the explicit developer installation used for certification. Public-network Unix builds additionally require the build-pinned `GROOT_HWI_SHA256`, root ownership, and non-writable ancestry; other production targets fail closed until equivalent platform-signature verification is implemented.
- HWI subprocesses receive a cleared environment with only a Tauri-resolved canonical `HOME` restored for the BitBoxApp pairing cache. Dynamic selectors and payloads, including paths, fingerprints, descriptors, PSBTs, and bounded Trezor Model One PIN positions, travel through HWI's quoted stdin command protocol and are zeroized after use. The sole argv exception is initial BitBox single-key import: after Rust proves the cached scan contains exactly one BitBox family row, it executes a fixed documented BIP84 command containing only the chain, literal device type, address type, account, and range. No device path, fingerprint, address, descriptor, account key, PSBT, password, or other device identifier enters argv. Concurrent output reads are bounded, raw device stderr is discarded, and timeout, cancellation, or a parent exit with inherited pipes still open terminates and reaps the complete child process tree before the coordinator is reused.
- Detected-but-locked devices remain visible with safe typed readiness states. Trezor empty-passphrase warnings fail closed until the user explicitly selects the seed-only standard wallet; Rust independently enforces that consent before import.
- Mounted public-key files are capped at 256 KiB and reject private/recovery material, extended private keys, wrong-network origins, malformed fingerprints, and account keys that do not use the compiled network's extended-public-key encoding before Rust descriptor validation.
- Every operation carries an explicit chain. One aggregate, validated discovery supplies only an opaque short-lived path hint; immediately before health, display, policy, or signing work, the same exclusive native lease reopens that path and requires the live type, fingerprint, derivation, and complete account xpub to match authoritative wallet metadata.
- Duplicate HWI records for one connection path are rejected as ambiguous. The persisted BDK external and internal descriptors are revalidated against authenticated hardware-wallet metadata on every database open.
- Software-wallet database opens are bound to both BIP84 descriptors re-derived from the decrypted mnemonic at unlock; the authenticated pair is removed on lock and idle expiry.
- External-signer and multisig receive screens distinguish unverified Groot derivation from durable, address-specific on-device verification evidence. Verification uses a validated discovery hint, proves the saved signer identity and account key, derives the exact descriptor index in Rust, and invokes the trusted display under one exclusive lease. Rust revalidates the wallet, policy, and address context immediately before appending an immutable timestamped event; the same lease remains active through that final append so cancellation linearizes before or after persistence, never during it. Text must match exactly by default. On Regtest, Ledger Bitcoin Test, Trezor, and BitBox02 may return the testnet `tb1` encoding; Groot accepts that cross-prefix representation only when Rust proves it and the canonical `bcrt1` address decode to identical scriptPubKeys. Testnet4 devices, including Coldcard, must return the canonical `tb1` address exactly; a Regtest encoding fails closed rather than being normalized. Coldcard address display returns automatically without an approve/reject decision, so Groot's evidence proves exact returned-address equality while the trusted screen remains available for independent human comparison.
- User rejection, timeout, unavailable/busy hardware, missing xpubs, identity mismatch, malformed responses, and oversized output map to stable safe errors.
- USB hardware support is integration-ready, not physically certified. Vendor/model/firmware/host combinations must complete [`docs/hardware-certification.md`](docs/hardware-certification.md).

### Network and webview policy

- Native wallet code is compile-time pinned to exactly one of Regtest, Signet, Testnet4, or the separately configured ADR 0055 mainnet certification identity, each with isolated application storage. Only that dedicated candidate can select Bitcoin mainnet. Before it creates or opens wallet SQLite, trusted Rust requires purpose-, wallet-, configuration-, and time-bound admission of an authenticated, synchronized, loopback-only Bitcoin Core node on the exact Bitcoin genesis chain. Its trusted transaction policy permits one recipient and at most 1,000,000 satoshis; distribution remains blocked.
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

## 2026-08-12 independent-review remediation

The supplied Phase 1 review of exact commit `dc16efa5efdfee3391898dc7cc6996fd6a467c46` was revalidated finding by finding. The remediation closes the confirmed public-network envelope regression, missing external-signer export throttle, unverified imported-signature progress, locked multisig metadata disclosure, avoidable RPC credential copies, same-process wall-clock bypass, failed-creation device-key orphaning, and related error/policy/documentation inconsistencies.

The implementation record, regression mapping, and remaining acceptance work are in [`docs/security-hardening-2026-08-12.md`](docs/security-hardening-2026-08-12.md); the settled boundaries and explicit residual risks are in [ADR 0028](docs/adr/0028-security-review-remediation-boundaries.md). This remediation is not reviewer closure: the exact final commit and validation evidence still require independent re-review, and the mainnet gate remains blocked.

## 2026-08-30 pre-mainnet review integration

The supplied review of the main and mobile-coordination branches was independently rechecked against the exact diffs before integration. Its validated fixes were accepted, and two additional merge blockers found during re-review were corrected: alternate Tauri capability formats could bypass the capability gate, and an already-active iOS screen capture could precede recovery-view protection. The review map, correction commits, test evidence, and remaining physical/platform work are recorded in [`docs/security-review-integration-2026-08-30.md`](docs/security-review-integration-2026-08-30.md).

This integration closes the reviewed code findings; it is not a complete penetration test, physical iOS assurance, or authorization for mainnet distribution.

## 2026-09-03 independent-review remediation

The independent baseline review of commit `2832acbb2f9aac3ed1b4079f70dd74d7277b2291` found no critical or high issue, one medium release-scope issue, and bounded low-severity hardening gaps. The current working tree implements the required trusted-boundary fixes: exact-model future-mainnet HWI admission, final-broadcast policy and RBF-intent revalidation, expiry-aware network-setup adoption, frozen-coin enforcement in RBF/CPFP, compiled-network recovery-key validation, cancellation-atomic policy evidence, immediate credential zeroization, atomic v2 migration failure behavior, and stricter release/secret-surface gates.

Production packaged-HWI verification now requires matching Developer ID teams, hardened runtime, secure timestamps, and the reviewed helper-only library-validation entitlement. The onboarding warning explicitly discloses offline guessing of copied encrypted profiles. The release owner accepts the current Argon2id parameters only for the capped limited-release design; a versioned KDF envelope remains mandatory before any cap or scope expansion.

The complete disposition and residual-risk record is [`docs/security-remediation-2026-09-03.md`](docs/security-remediation-2026-09-03.md). It is not independent closing review, exact-candidate evidence, or mainnet release authorization. The old notarized v0.4.91 artifact remains historical Testnet4 evidence only.

## Mainnet distribution blockers

The isolated ADR 0055 candidate is available only for certification. Mainnet distribution and ordinary use remain blocked. At minimum, release requires:

1. independent external security review and remediation;
2. reproducible signed builds, SBOM/provenance, reviewed update delivery, and pinned/verified HWI artifacts;
3. physical certification for every supported hardware-wallet model, firmware, host OS, address-display flow, rejection path, reconnect path, and signing flow;
4. Android Keystore and Windows credential-vault implementation and certification, plus Apple lifecycle/accessibility evidence;
5. verified backend chain identity and reviewed mainnet Core/remote-backend privacy and authentication;
6. funded recovery/timelock boundary and reorg testing;
7. signed-package second-launch, forced-termination, and cross-platform process-lock acceptance;
8. large-history scanning, pagination, and performance validation;
9. green, current dependency advisory checks and closure of applicable inherited dependency warnings;
10. explicit approval of the canonical mainnet checklist.

No test count, coverage percentage, internal review, or hardware simulator result overrides these blockers.
