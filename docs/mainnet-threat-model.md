# Mainnet threat model

Status: pre-release review; unresolved items are release blockers.

## Assets

- Mnemonic, BIP39 passphrase/app PIN, decrypted signing keys, and device wrapping key.
- Hardware-wallet authorization and registered multisig policy.
- Descriptor backup, xpub/fingerprint privacy, address labels, UTXO graph, PSBTs, and transaction intent.
- Correct network identity, backend chain data, fee data, transaction finality, and recoverability.

## Adversaries and failures

- Compromised webview, renderer dependency, clipboard, QR/file payload, or malicious website.
- Malicious or compromised Bitcoin Core/Esplora endpoint returning stale, censored, fee-manipulated, or false chain data.
- HWI binary replacement, hostile USB device, wrong hardware wallet, changed firmware, policy-registration mismatch, or user-approved wrong address.
- Stolen device, brute-force unlock, filesystem rollback/corruption, interrupted atomic write, backup loss, or passphrase transcription error.
- Supply-chain compromise in npm, Cargo, GitHub Actions, release signing, or update distribution.
- Cross-network address, descriptor origin, xpub version, PSBT, explorer, or HWI-chain mismatch.

## Required controls

- Rust owns secrets, descriptors, PSBT validation, signing, persistence, network checks, and broadcast.
- HWI uses an absolute executable path, fixed argument arrays, null stdin, bounded concurrent output, timeout/kill, discarded stderr, exact fingerprint matching, and explicit chain selection. Mainnet packaging must additionally pin and verify the HWI artifact/version.
- Mainnet requires a user-controlled Core backend initially, verified genesis hash, encrypted/authenticated RPC configuration, no credentials in URLs, and no silent backend fallback.
- Review is derived from the persisted PSBT. Recipient, amount, fee, fee rate, inputs, change, network, policy, and signing path are verified before every signature.
- Imported PSBTs must preserve the unsigned transaction, descriptor identity, known origins, allowed sighash, and absence of hostile finalization data.
- Secrets are device-bound and credential-wrapped; wallet-scoped authentication throttling survives restarts; unlock sessions are wallet-bound and idle-expiring; deletion requires fresh credential verification and multisig recoverability is proven independently.
- Reproducible locked builds, least-privilege CI, artifact hashes/signatures, dependency review, SBOM, and external security review are required.

## Residual risks requiring explicit acceptance

- Users can still approve an incorrect address or malicious hardware screen.
- A compromised host can deny service, observe public wallet metadata, or replace clipboard contents.
- Full-node operators learn the client's network identity and timing; public indexers additionally learn queried wallet data.
- Filesystem deletion cannot promise physical flash erasure.
- Multisig availability depends on independent device backups, compatible policy support, and correct descriptor recovery.

## Current decision

Mainnet release is blocked. The canonical evidence and sign-off gates are in `docs/mainnet-release-checklist.md`.
