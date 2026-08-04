# Security model

## Assets

- Single-key mnemonic, seed, BIP39 passphrase, xprvs, and decrypted signing material.
- Hardware-device secrets, which Satchel must never request or receive.
- Coordinator PIN, unsigned/partially signed PSBTs, public descriptors, address labels, transaction metadata, and wallet identity.

## Trust boundaries

Rust/Tauri is trusted for key derivation, credential verification, descriptor parsing, BDK persistence, PSBT construction/validation/finalization, sync, and broadcast. Svelte is trusted only for presentation, public data entry, and orchestration through `WalletPort`. Bitcoin Core/mempool services provide adversarial network data and must not define wallet policy. HWI and connected hardware are external signers whose identity and returned data are verified.

## Required controls

- No generated mnemonic, seed, xprv, private descriptor, or decrypted signing material crosses into the webview. Deterministic browser fixtures contain no production secret.
- Secret envelopes require both the credential-derived key and a device wrapping key. A copied wallet directory must not be sufficient to decrypt the wallet elsewhere.
- Credentials are never logged, included in analytics, persisted in plaintext, or retained after use.
- Descriptor imports parse in Rust, require checksums on export, preserve origins, reject secret keys, and use a configured network.
- Every transaction summary comes from the actual PSBT. Imported partial PSBTs must match the stored proposal before merging.
- Address reveal and immutable label persistence are atomic. Discard retires presentation only.
- SQLite state and notification/proposal markers use atomic persistence and restrictive filesystem permissions. Accepted broadcast status and its notification are committed together; notifications remain pending until explicit acknowledgement.
- Private JSON and registry files are bounded on read, atomically replaced, fsynced, and owner-only on Unix. Wallet deletion rejects symlinks/non-directories. Filesystem deletion is not claimed to securely erase flash storage.
- HWI runs only from an absolute configured/known installation path, never from `PATH`, and uses fixed arguments, null stdin, bounded output, a timeout/kill path, exact connected-fingerprint checks, and stable errors that discard raw device stderr.
- Unlock sessions are selected-wallet scoped, use a five-minute monotonic idle timeout, and are cleared on switch/lock. Authentication cooldown state is persisted per wallet across process restarts.
- The Tauri webview uses a deny-by-default CSP with remote scripts, frames, and object embedding disabled.
- Mainnet remains disabled until threat modeling, external review, reproducible builds, physical-device certification, and recovery drills are complete.

## Known release blockers

- Generated mnemonic presentation is native and no longer returns words through Tauri IPC. Native presentation still requires platform accessibility and screenshot-behavior certification.
- Apple Keychain wrapping is implemented. Android Keystore and Windows credential-vault hardening/certification remain before public-network release; their current application-sandbox fallback is regtest-only assurance.
- Physical HWI model/firmware combinations have not run in this workspace. The transport is integration-ready, not certified. Reproducible HWI packaging, version/hash allowlisting, and vendor/firmware evidence remain release blockers.
- Funded delayed-branch selection/signing at every boundary and after reorgs remains a V2 blocker.
- Multiple-wallet routing, switching, isolated creation/deletion, and legacy-directory migration are implemented; schema upgrade fixtures and mobile lifecycle certification remain release gates.
- Standards-compliant UR animation/camera scanning is not released. Bounded file transfer works; the multipart decoder is not represented as UR compatibility.

## Review checklist

For any wallet-boundary change, identify secret inputs, public outputs, persistence mutations, zeroization point, stable error code, offline behavior, malicious-data limits, and tests for wrong network/wrong credential/mismatched identity. Update an ADR when a trust boundary or settled policy changes.
