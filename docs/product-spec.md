# Satchel product specification

Status: canonical for the current prototype and first live integration build.

## Product

Satchel is an onchain-only Bitcoin wallet and multisig coordinator. It prioritizes the smallest understandable flows for receiving, sending, reviewing activity, inspecting coins, and coordinating descriptor-based hardware signers. There are no cloud backups, Lightning, address books, or editable labels in the first release.

## Settled decisions

- 24-word BIP39 mnemonic.
- BIP84 native SegWit receive/change descriptors.
- Descriptor-first Miniscript multisig using native-SegWit `wsh(sortedmulti())` in coordinator v1.
- Default coordinator policy is 2-of-3 with BIP48 test-network account origins.
- One user credential acts as both BIP39 passphrase and app PIN for unlock/signing.
- Explicit local verifier rejects an incorrect credential before wallet loading.
- Signet is the first remote integration network.
- Regtest creates deterministic high-volume histories in automated tests.
- Testnet4 is used for final public-network rehearsal before any mainnet work.
- Mainnet is not a supported selectable network. It requires ADR 0012, the threat model, physical hardware certification, reproducible release evidence, and the release checklist to be independently approved first.
- Fee estimates and Esplora services are configurable; mempool.space is the default hosted provider.

## Onboarding

### Create

1. Explain self-custody and backup responsibility.
2. Generate 24 words in trusted Rust code and retain them only in a zeroized pending session.
3. Display once in a compact platform-native backup sheet attached to Satchel, require backup acknowledgment, and return no mnemonic through Tauri IPC. The words use a scannable grid rather than alert-body text.
4. User creates and confirms the passphrase/PIN.
5. Derive BIP84 external/change descriptors and a separate credential verifier.
6. Atomically persist device-bound encrypted secret material, public wallet state, and an isolated wallet profile.

## Multiple wallets

Wallets have immutable UUID identities, user-visible names, network and kind metadata, and isolated databases. Creating or recovering a wallet selects it. Switching wallets clears unlocked state and requires that wallet's credential. Deleting one wallet selects another remaining profile or returns to onboarding when none remain. Legacy fixed regtest directories migrate atomically with rollback.

### Recover

1. Accept exactly 24 valid BIP39 words and the original passphrase/PIN.
2. Restore descriptors and verify the expected wallet identity where local metadata exists.
3. Full scan from a configurable birthday; report progress and allow retry.

### Unlock

Incorrect entry shows “Incorrect passphrase / PIN.” It does not reveal whether a guessed credential maps to any other BIP39 wallet. Rate limiting and platform secure storage harden repeated attempts.

The locked screen names the selected wallet, permits switching profiles, and always offers a route back to wallet setup. Existing-wallet setup can be closed from every step without completing or replacing the selected wallet. Every passphrase/PIN field has an explicit show/hide control so the user can verify an entry before submitting it.

Regtest builds expose a locked-screen deletion action for the selected disposable local wallet. It requires typing `RESET REGTEST`, works for single-key and multisig test profiles, and is not available on public networks.

## Overview

Show confirmed, pending, and total balance in satoshis; BTC and fiat are secondary display values only. Show sync recency and the latest three transactions. Receive and Send are the primary actions.

## Receive

1. User requests a new address.
2. A non-empty label of at most 48 characters is mandatory.
3. Address revelation and immutable label persistence are atomic.
4. Multiple addresses may await payment concurrently. The receive view lists every active payment request and lets the user inspect each address independently.
5. Creating a new address never retires another awaiting address.
6. Any awaiting address with no observed transaction may be discarded independently for privacy.
7. A discarded address is retired from presentation but monitored forever.
8. Any address with an observed transaction cannot be discarded.

## Send

1. Enter/scan a network-valid address and integer satoshi amount.
2. Choose economy, standard, priority, or validated custom sat/vB rate.
3. Use automatic coin selection by default, excluding frozen coins. The user may instead select one or more unfrozen UTXOs explicitly.
4. Prepare a real unsigned transaction in Rust and return its authoritative review summary, including the selected inputs.
5. Review recipient, amount, fee rate, fee, total, inputs, and change policy.
6. Enter passphrase/PIN; Rust verifies, signs, broadcasts, persists, and clears secrets.
7. Show a durable success state plus a transaction-broadcast toast with updated balance.

## Activity and transaction details

List received/sent transactions with label, amount, date, and pending/confirmation state. Details show transaction ID, inputs/outputs summary, fee when known, block/confirmations, and a network-correct explorer link.

An empty activity view explicitly says that the wallet has no transactions yet. Filtered empty states distinguish no received transactions from no sent transactions.

## UTXOs

Show amount, outpoint, label, address, confirmations, and frozen state. Users can select UTXOs and begin a manual-input send. Freeze/unfreeze is persisted; frozen coins are excluded from automatic and manual spending until unfrozen.

## Notifications

Exactly-once in-app toasts are produced for:

- local transaction broadcast, with updated balance;
- newly observed incoming transaction, with updated balance;
- first confirmation, with updated balance.

Later confirmations do not create toasts. Persistent transaction state remains the source of truth.

## Delete wallet

Require explicit typed confirmation and a backup warning. Close handles, zeroize/clear in-memory keys, remove encrypted secret material and local wallet database, and return to onboarding. Deletion affects only this device and cannot recall broadcast transactions.

## Multisig coordinator

1. User names the wallet and chooses a recommended 2-of-3 or 3-of-5 recipe, or opens advanced M-of-N controls within the safe v1 envelope of 2–7 signatures and 3–7 cosigners. Satchel does not offer 1-of-N because one stolen key could spend alone; users who want one key should create a single-key wallet.
2. Add each cosigner through a Rust hardware transport or import its master fingerprint and BIP48 account xpub through QR/file/manual entry.
3. Reject duplicate fingerprints, duplicate account xpubs, wrong-network keys, private descriptors, and nonstandard origins.
4. Rust constructs canonical checksummed external/change `wsh(sortedmulti())` descriptors and BDK derives the verification address.
5. User verifies connected devices where supported and confirms an offline descriptor backup before the wallet can receive funds.
   Selecting a cosigner reveals its public fingerprint, BIP48 account path, import source, public account key, connection capability, and last health check for the current app session. A new health check re-enumerates connected hardware and requires an exact fingerprint match. Offline/manual keys receive a public-record integrity check that must not imply physical verification.
6. Send creates and persists an authoritative PSBT. Partial signatures may arrive in any order over hardware, QR, or file.
7. Rust validates and merges matching PSBTs, displays signature progress, and broadcasts only after the descriptor is satisfied and the transaction is finalized.
8. Hardware-only wallets use an app PIN verifier but have no coordinator-held mnemonic or private key.
9. Setup offers visual standard, delayed-recovery, and inheritance templates. Descriptor logic is hidden by default but available before creation. Recovery/inheritance templates compile and persist real Miniscript descriptors in Rust; coordinator-assisted spending through a matured delayed branch remains a V2 release gate.

## Out of scope

Mainnet, Lightning, RBF/CPFP controls, arbitrary custom Miniscript editing, editable labels, contacts, cloud sync, background push while fully terminated, and fiat purchase/sale. Delayed-branch coordinator spending, decaying multisig, and expanding multisig remain V2 work described in `docs/roadmap.md`.
