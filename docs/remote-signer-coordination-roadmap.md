# Encrypted remote signer coordination roadmap

Status: proposed first post-release paid add-on. No hosted relay or remote coordination capability is implemented today.

## Outcome

Let independently controlled Groot devices coordinate a multisig proposal across distance without giving Groot or a relay custody, signing authority, readable wallet data, or a privileged recovery role. Standard PSBT file/QR exchange remains the universal fallback.

## Security invariants

- Private keys and decrypted signing material never leave their signer boundary.
- The coordinator derives review data from the exact persisted PSBT; remote messages cannot replace transaction truth.
- Every invitation binds the wallet policy checksum, network, participant device key, protocol version, and expiry.
- Every proposal binds an immutable proposal ID and PSBT identity. Replay, rollback, substitution, cross-wallet, and cross-network messages fail closed.
- Message content is end-to-end encrypted and authenticated. The relay sees only bounded routing metadata and ciphertext.
- Relay compromise, censorship, deletion, or permanent disappearance cannot authorize a spend or prevent descriptor/PSBT recovery.
- Enrollment and key changes require explicit verification on an already trusted device or an offline recovery ceremony.
- Self-hosted and Tor-compatible transports use the same protocol and client security properties as the hosted service.
- Notification text contains no address, amount, balance, label, PSBT, or wallet name unless the recipient device decrypts it locally.

## Architecture boundary

The core wallet owns proposals, policy validation, signing, and merge validation. A coordination client packages authenticated encrypted envelopes through a narrow Rust interface. A stateless or bounded-retention relay stores opaque envelopes by random routing identifiers. Entitlement and billing are separate from message keys and wallet identity.

The relay must not prepare PSBTs, choose inputs, compute review data, hold a policy-signing key, reconstruct a participant graph, or become a Miniscript branch. Provider cosigning, recovery cosigning, and insurance are separate products with separate threat models.

## Delivery phases

### Phase 0 — protocol and threat model

- Specify identities, enrollment, revocation, forward secrecy, recovery, message types, state machines, size/rate bounds, retention, and metadata.
- Produce vectors for invitation, proposal, signature, cancellation, expiry, replay, key rotation, relay loss, and offline fallback.
- Commission independent cryptographic and protocol review before public-network use.

### Phase 1 — local multi-device prototype

- Exchange encrypted envelopes through a local untrusted mailbox fixture.
- Reuse existing proposal persistence and exact-PSBT merge validation.
- Prove interruption, duplicate delivery, reordering, stale devices, wrong wallet, wrong network, and rollback handling.
- Keep the interface behind a test-network feature gate.

### Phase 2 — self-hostable relay

- Release the minimal relay with bounded storage, deletion, abuse controls, metrics that exclude wallet data, and reproducible deployment.
- Support direct HTTPS and onion service endpoints without a silent fallback.
- Publish backup, upgrade, incident, and relay-migration procedures.

### Phase 3 — Groot Plus experience

- Add account-number identity, device enrollment, verified signer invitations, per-signer status, encrypted notifications, expiry, and subscription entitlement.
- Design desktop and mobile flows for a nontechnical remote signer who sees the actual destination, amount, fee, inputs, change, and policy before signing.
- Allow every proposal to switch to standard PSBT file/QR exchange at any time.

### Phase 4 — Teams controls

- Add organization membership and human approval workflows without confusing approval with a Bitcoin signature.
- Add escalation, delegation, scheduled windows, and auditable policy changes.
- Support managed or self-hosted relay operation under the same wire protocol.

## Exit evidence

Before a mainnet launch: protocol specification and vectors, independent review, metadata analysis, two independent client implementations or one external interoperability review, relay-loss recovery, self-hosted/Tor rehearsal, mobile lifecycle evidence, abuse testing, and a documented subscription-expiry escape test.
