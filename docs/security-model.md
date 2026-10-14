# Security model

## Assets

- Single-key mnemonic, seed, BIP39 passphrase, xprvs, and decrypted signing material.
- Hardware-device secrets, which Groot must never request or receive.
- External-signer imports are public-only, capped at 256 KiB, network/path checked, and normalized into canonical BIP84 descriptors. Seed fields and private extended keys fail closed.
- Direct remote Bitcoin Core RPC is HTTPS-only, refuses redirects, and uses platform certificate validation. HTTP is allowed only for a syntactically valid v3 `.onion` destination encoded directly into SOCKS5 through an explicit numeric loopback proxy; local DNS and direct fallback are never attempted. Both transports bound headers, bodies, and I/O time. Every production Core connection must match both the selected chain name and its exact compiled Bitcoin genesis before use. The ADR 0055 mainnet candidate additionally requires a short-lived, Rust-owned, purpose-bound admission before either SQLite constructor can run; new-wallet admission is consumed once and existing-wallet admission must exactly match that profile's saved public Core setup. Credentials are never accepted in URLs; passwords are credential-encrypted per wallet, held only while that profile is unlocked, borrowed directly by recurring transport construction without an avoidable `Auth::UserPass` clone, and zeroized on lock/switch. Pinned HTTP/TLS libraries can still own short-lived credential-derived header buffers; ADR 0028 records that residual.
- Coordinator PIN, unsigned/partially signed PSBTs, public descriptors, address labels, transaction metadata, and wallet identity.

## Trust boundaries

Rust/Tauri is trusted for key derivation, credential verification, descriptor parsing, BDK persistence, PSBT construction/validation/finalization, sync, and broadcast. Svelte is trusted only for presentation, public data entry, and orchestration through `WalletPort`. Bitcoin Core/mempool services provide adversarial network data and must not define wallet policy. HWI and connected hardware are external signers whose identity and returned data are verified.

## Required controls

- Software-wallet key material starts with exactly 32 bytes requested by trusted Rust from the native OS CSPRNG. Those bytes are used directly as 256-bit BIP39 entropy unless the user explicitly supplies the bounded physical transcript described below; Groot does not generate entropy in JavaScript, stretch a smaller random value, mix in predictable application data silently, or fall back after failure. `try_fill_bytes` failure returns stable `entropy_unavailable` before any mnemonic or wallet is created. The fixed-size entropy buffer, BIP39 mnemonic object, and derived seed are zeroized on success and error. The OS may incorporate hardware random sources into its conditioned pool, but Groot neither assumes nor claims that every supported device exposes an independently verifiable hardware TRNG.
- Optional supplemental entropy accepts only 128–256 `H`/`T` coin outcomes or 50–100 `1`–`6` die outcomes. Rust bounds and validates the transcript, hashes its source/count/outcomes with explicit domain separation, and combines that digest with the independently generated 32-byte OS value through a second domain-separated SHA-256 extraction. The OS call remains mandatory and its value never enters the webview. Supplemental transcripts do enter the webview/IPC and therefore cannot compensate for a compromised renderer or host; they are cleared after every attempt, never persisted/logged, and are not assigned a guaranteed entropy claim by Groot.
- Secret-envelope data keys, salts, and AEAD nonces use the same fallible OS CSPRNG boundary. Failure aborts secure storage with `secure_storage_unavailable`; it never reuses a value or substitutes application-generated randomness.
- No generated mnemonic, seed, xprv, private descriptor, or decrypted signing material crosses into the webview. Deterministic browser fixtures contain no production secret.
- Secret envelopes require the credential-derived Argon2id key. Version 5
  stores and strictly validates its 64 MiB, three-iteration, one-lane profile;
  its AAD binds the payload and credential wrap to the wallet UUID and purpose.
  Authenticated v2/v3/v4 envelopes migrate atomically after successful unlock.
  Migration is upgrade-compatible but deliberately not downgrade-compatible.
  A copied encrypted profile is intentionally portable and therefore permits
  offline credential guessing. New software wallets require a minimum
  16-character passphrase without composition rules; recovery and existing-
  wallet operations accept exact historical passphrases. Platform-calibrated
  KDF review, unpredictable credentials, full-disk encryption, and host access
  control remain required defense in depth.
- Credentials are never logged, included in analytics, persisted in plaintext, or retained after use. Native credential inputs are bounded, every credential-bearing Svelte route clears its field after success, failure, and component teardown, and CI rejects production logging/telemetry sinks or an analytics/crash-reporting dependency until explicitly reviewed.
- Descriptor imports parse in Rust, require checksums on export, preserve origins, reject secret keys, and use a configured network.
- Every transaction summary comes from the actual PSBT. Recipient amount and stored fee must match it exactly, and every other output must be proven wallet-controlled before review, signing, or broadcast. Software authorization carries a domain-separated binding to the proposal ID and exact reviewed PSBT bytes. Imported partial PSBTs must match the stored proposal before merging, and every ECDSA partial signature must verify against the actual input sighash before it can count, merge, persist, or appear in progress.
- Every software, external-signer, and multisig finalization path replaces PSBT
  prevout metadata with canonical wallet history and fails on missing, duplicate,
  or mismatched inputs. External-device signing also performs a second serialized
  coin-availability check after device interaction and before merging or
  persisting any returned signature.
- Address revelation fails closed before the next external derivation index would exceed the configured recoverable gap. Transaction preparation applies the same rule to the actual internal change output, preventing canceled proposals from pushing a later broadcast beyond recovery lookahead. A user cannot lower the limit below the longest already-revealed receive or change run.
- Address reveal and immutable label persistence are atomic. New direct,
  BIP329-imported, and signer labels reject control, bidi, and invisible
  formatting characters before normalization; existing history is unchanged.
  A restored address-label import computes the complete prospective recovery gap
  before persistence and rejects any new increase above the supported maximum.
  Discard retires presentation only.
- SQLite state and notification/proposal markers use atomic persistence, owner-only files on Unix, a bounded busy timeout, foreign-key enforcement, `trusted_schema=OFF`, and SQLite defensive mode. Proposal preparation commits the BDK changeset, proposal row, and optional acceleration lineage together; accepted broadcast status and its notification are likewise committed together. Notifications remain pending until explicit acknowledgement.
- Private JSON, secure-envelope metadata, registry files, and wallet databases reject symlink/non-regular storage. Reads are bounded; private writes are atomic, fsynced, and owner-only on Unix. Wallet directories are owner-only. Filesystem deletion is not claimed to securely erase flash storage.
- HWI runs only from a canonical absolute configured/known installation path and never from `PATH`. Packaged macOS builds select the bundled helper and require the enclosing app signature, nested helper signature, reviewed Developer ID team and build-pinned SHA-256 digest. Regtest keeps the explicit developer path required for physical testing. Other public-network Unix installations additionally require the build-pinned digest plus root ownership and non-writable ancestry; other production targets fail closed until equivalent platform-signature verification exists. The environment is cleared and only canonical `HOME` is restored for BitBox pairing. Arguments, output, execution time, fingerprint matching, and Trezor PIN stdin are bounded.
- Unlock sessions are wallet-UUID scoped and use a reviewed monotonic idle timeout. Switching profiles removes the previous wallet's data from presentation but preserves its independent session until explicit lock or its own expiry; lock clears only the selected wallet. Every credential-verification command uses persisted per-wallet cooldown state plus a process-monotonic retry floor. Restart persistence depends on the operating-system wall clock; clock control plus restart remains an accepted pre-release residual in ADR 0028.
- The Tauri webview uses a deny-by-default CSP with remote scripts, frames, and object embedding disabled. Same-origin/blob workers are permitted only for the bundled local QR decoder; network access remains restricted to Tauri IPC. Clipboard access is write-only and centralized: every explicit export declares whether it is an address, identifier, public wallet record, or PSBT/transaction record and is rejected above its class-specific size bound. Groot never reads the system clipboard.
- The static browser demo has no wallet backend, signing keys, database, authentication service, or server-side authorization surface. Vercel serves it with CSP, frame denial, content-type/referrer controls, restricted browser capabilities, cross-origin isolation headers, and HSTS. Database RLS becomes mandatory only if a hosted multi-tenant data service is introduced.
- Dependency versions and GitHub Actions are immutable-pinned, lockfile integrity is enforced, and Node dependency lifecycle scripts are disabled. CI advisory scans are release evidence, not authorization to publish an unreviewed artifact.
- Public v0.4.96 and v0.5.1 retain their exact-commit historical authorizations. ADR 0088 conditionally authorizes v5.2.0 after its final commit is independently reviewed, reproduced under the recorded same-Mac exception, signed, notarized, bound to fresh `origin/main` and an annotated `v5.2.0` tag, and verified as the published artifact.
- BSMS and UR inputs are public but adversarial: private material, noncanonical descriptors/CBOR, wrong networks/types, invalid first addresses, oversized payloads, too many frames, and malformed PSBT magic fail closed.
- Direct RPC uses a transport constructed separately from the SOCKS-capable transport. An enabled proxy dependency must never silently reroute localhost or direct HTTPS traffic.

## Release boundary

Public v0.5.1 approval applies only to commit `c731fa1c` (ADR 0083). ADR 0088 conditionally authorizes v5.2.0 only at the final commit shared by the packaged source, fresh `origin/main` and peeled annotated tag after every named evidence gate passes. Automated checks do not transfer exact-device or release evidence. Windows/Linux/mobile and delayed-policy creation remain uncertified or disabled. The [Mainnet checklist](mainnet-release-checklist.md) owns release acceptance; [deferred hardening decisions](security-hardening-decision-queue-2026-10-04.md) are not approved implementation work.

## Review checklist

For any wallet-boundary change, identify secret inputs, public outputs, persistence mutations, zeroization point, stable error code, offline behavior, malicious-data limits, and tests for wrong network/wrong credential/mismatched identity. Update an ADR when a trust boundary or settled policy changes.

The complete attacker assumptions, attack-vector register, mitigations, detection/recovery controls, residual risks, and release evidence are maintained in [`mainnet-threat-model.md`](mainnet-threat-model.md). Any new coordinator feature must add or update its entries before implementation is considered release-ready.

BIP329 files intentionally expose labels and public wallet references. Export requires an explicit native destination and privacy warning; import is bounded, Rust-owned, exact-wallet/network checked, and atomic. Only standard address, transaction, output, and public account-key records are mapped. Private extended-key prefixes are rejected, and no PSBT, decrypted key material, credential, RPC secret, private descriptor, or profile envelope is serialized. The file is not authenticated synchronization state, so users must protect its confidentiality and verify its source.

Native explorer opening accepts no renderer-provided URL. Rust derives an exact mempool.space Testnet4 or Signet transaction URL from a parsed txid; every other host, path, network, and Regtest is unavailable. The third-party privacy warning remains mandatory, and OS-open failures are visible rather than silently swallowed.

## Release discovery and download trust

GitHub discovery is untrusted public metadata, isolated from all wallet inputs. It receives only IP/app-version metadata after a manual request or explicit daily opt-in. A compromised repository/CDN cannot substitute an installer without the pinned owner key's exact-byte Ed25519 signature and matching SHA-256. Replay/same-version, platform/name substitution, unbounded streams, duplicate assets and redirects outside the release CDN are rejected. Key compromise, valid malicious owner-signed releases and local OS compromise remain external trust risks requiring incident response/independent release review. Missing key material fails closed. Preparation never executes, replaces or downgrades the application or wallet data. ADR 0086 owns the detailed limits and cleanup policy.
