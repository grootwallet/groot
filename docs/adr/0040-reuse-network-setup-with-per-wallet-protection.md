# ADR 0040: reuse network setup with per-wallet protection

Status: accepted

## Context

Every Groot wallet has isolated Bitcoin Core and activity-sync settings. That allows different nodes and privacy routes, but requiring the same person to re-enter an identical local, remote, or Tor-backed Core connection for every software, hardware, and multisig wallet is repetitive and encourages configuration mistakes. A single live global RPC credential would reduce repetition but would couple wallet lock state, deletion, and later node edits.

## Decision

- Network settings remain per-wallet. Reuse creates an independent destination copy; it is not a shared mutable profile or global secret.
- New software, hardware, and multisig wallets offer reuse by default when an eligible unlocked wallet exists. The user may turn it off. Existing wallets expose the same explicit action in Settings.
- An eligible source has a saved Core configuration, an active wallet session, and—when username/password authentication is used—an exact matching decrypted RPC session already held by trusted Rust code.
- Adoption verifies the destination wallet credential, rechecks the source Core connection against the compiled chain and RPC policy, copies the Core configuration plus activity-sync preference, and encrypts the RPC password with the destination credential. No RPC password, cookie, or wallet credential crosses into the webview.
- Compact-filter peer and proxy preferences may be copied. Wallet databases, checkpoints, scripts, matches, labels, notification markers, and scan progress never are.
- Local cookie, direct remote HTTPS, Tor-routed v3 onion, and compact-filter configurations use the same operation and retain their existing validation and no-fallback rules.
- A failed adoption does not remove the newly created wallet. Its network setup remains configurable in Settings.

## Compatibility

This operation writes the existing `node.json`, `node-secret.json`, and `sync-source.json` formats below the destination UUID. It does not change wallet, profile, registry, credential, proposal, or backup schemas. Existing data remains compatible.

## Consequences

The common multi-wallet setup is one checked choice instead of repeated endpoint and credential entry. Wallets can still diverge later. Locking or deleting one wallet removes only its own decrypted session and persisted copy; another wallet does not depend on it after adoption.

## 2026-09-12 clarification: creation publication boundary

Software and multisig creation use the same native pre-commit copy operation. The destination profile is not committed, selected, returned as successful, or exposed to frontend refresh until the copy attempt finishes. If the source becomes invalid, Rust removes any partial destination node files and session before committing the otherwise valid wallet offline. This closes a UI-navigation race without changing any persisted format.
