# Security model

## Assets

- Single-key mnemonic, seed, BIP39 passphrase, xprvs, and decrypted signing material.
- Hardware-device secrets, which Satchel must never request or receive.
- External-signer imports are public-only, capped at 256 KiB, network/path checked, and normalized into canonical BIP84 descriptors. Seed fields and private extended keys fail closed.
- Direct remote Bitcoin Core RPC is HTTPS-only. HTTP is allowed only for an `.onion` destination through an explicit loopback SOCKS5 proxy. Credentials are never accepted in URLs; passwords are device-bound encrypted per wallet, held only while that profile is unlocked, and zeroized on lock/switch.
- Coordinator PIN, unsigned/partially signed PSBTs, public descriptors, address labels, transaction metadata, and wallet identity.

## Trust boundaries

Rust/Tauri is trusted for key derivation, credential verification, descriptor parsing, BDK persistence, PSBT construction/validation/finalization, sync, and broadcast. Svelte is trusted only for presentation, public data entry, and orchestration through `WalletPort`. Bitcoin Core/mempool services provide adversarial network data and must not define wallet policy. HWI and connected hardware are external signers whose identity and returned data are verified.

## Required controls

- No generated mnemonic, seed, xprv, private descriptor, or decrypted signing material crosses into the webview. Deterministic browser fixtures contain no production secret.
- Secret envelopes require both the credential-derived key and a device wrapping key. A copied wallet directory must not be sufficient to decrypt the wallet elsewhere.
- Credentials are never logged, included in analytics, persisted in plaintext, or retained after use. Native credential inputs are bounded, and every credential-bearing Svelte route clears its field after success, failure, and component teardown.
- Descriptor imports parse in Rust, require checksums on export, preserve origins, reject secret keys, and use a configured network.
- Every transaction summary comes from the actual PSBT. Imported partial PSBTs must match the stored proposal before merging.
- Address reveal and immutable label persistence are atomic. Discard retires presentation only.
- SQLite state and notification/proposal markers use atomic persistence, owner-only files on Unix, a bounded busy timeout, foreign-key enforcement, `trusted_schema=OFF`, and SQLite defensive mode. Accepted broadcast status and its notification are committed together; notifications remain pending until explicit acknowledgement.
- Private JSON, secure-envelope metadata, registry files, and wallet databases reject symlink/non-regular storage. Reads are bounded; private writes are atomic, fsynced, and owner-only on Unix. Wallet directories are owner-only. Filesystem deletion is not claimed to securely erase flash storage.
- HWI runs only from a canonical absolute configured/known installation path, never from `PATH`, rejects group/world-writable executables on Unix, and clears the inherited environment. It restores only a Tauri-resolved canonical `HOME` so BitBox HWI can read BitBoxApp's existing pairing cache. Fixed arguments, bounded concurrent output, a timeout/kill path, exact connected-fingerprint checks, and stable errors that discard raw device stderr remain mandatory. Stdin is null except for a bounded Trezor/KeepKey PIN-position command; those digits never enter argv or logs, use a single-use expiring challenge, and are zeroized after use. A Trezor standard-wallet/empty-passphrase warning requires explicit user selection at the native import boundary; it is never accepted silently.
- Unlock sessions are selected-wallet scoped, use a five-minute monotonic idle timeout, and are cleared on switch/lock. Authentication cooldown state is persisted per wallet across process restarts.
- The Tauri webview uses a deny-by-default CSP with remote scripts, frames, and object embedding disabled.
- The static browser demo has no wallet backend, signing keys, database, authentication service, or server-side authorization surface. Vercel serves it with CSP, frame denial, content-type/referrer controls, restricted browser capabilities, cross-origin isolation headers, and HSTS. Database RLS becomes mandatory only if a hosted multi-tenant data service is introduced.
- Dependency versions and GitHub Actions are immutable-pinned, lockfile integrity is enforced, and Node dependency lifecycle scripts are disabled. CI advisory scans are release evidence, not authorization to publish an unreviewed artifact.
- Mainnet remains disabled until threat modeling, external review, reproducible builds, physical-device certification, and recovery drills are complete.
- BSMS and UR inputs are public but adversarial: private material, noncanonical descriptors/CBOR, wrong networks/types, invalid first addresses, oversized payloads, too many frames, and malformed PSBT magic fail closed.
- Direct RPC uses a transport constructed separately from the SOCKS-capable transport. An enabled proxy dependency must never silently reroute localhost or direct HTTPS traffic.

## Known release blockers

- Generated mnemonic presentation is native and no longer returns words through Tauri IPC. Native presentation still requires platform accessibility and screenshot-behavior certification.
- Apple Keychain wrapping is implemented. Android Keystore and Windows credential-vault hardening/certification remain before public-network release; their current application-sandbox fallback is regtest-only assurance.
- Physical HWI model/firmware combinations have not run in this workspace. The transport is integration-ready, not certified. Reproducible HWI packaging, version/hash allowlisting, and vendor/firmware evidence remain release blockers.
- Funded delayed-branch selection/signing at every boundary and after reorgs remains a V2 blocker.
- Multiple-wallet routing, switching, isolated creation/deletion, and legacy-directory migration are implemented; schema upgrade fixtures and mobile lifecycle certification remain release gates.
- Bounded `crypto-psbt` UR v2 animation and camera ingestion are implemented. Physical camera permission/denial/interruption tests, vendor vectors, and Android/iOS packaging certification remain release blockers; file/text fallback is mandatory.

## Review checklist

For any wallet-boundary change, identify secret inputs, public outputs, persistence mutations, zeroization point, stable error code, offline behavior, malicious-data limits, and tests for wrong network/wrong credential/mismatched identity. Update an ADR when a trust boundary or settled policy changes.
