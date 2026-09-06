# ADR 0057: Approve the mainnet mempool.space transaction explorer

- Status: accepted for the isolated certification candidate
- Date: 2026-09-06
- Supersedes: ADR 0049 only for the approved Mainnet explorer route
- Extends: ADR 0055 and ADR 0056

## Context

Transaction details already offer an optional mempool.space action on Signet and
Testnet4, but the isolated Mainnet candidate omitted it. That made the same
transaction-inspection flow inconsistent precisely where a reviewer needs to
compare a real broadcast with an independent public view. Opening any public
explorer discloses the queried transaction ID and request metadata, so it must
remain an explicit user action with a visible privacy warning.

## Decision

The dedicated Mainnet candidate may offer **View on mempool.space** for a valid
transaction ID. The renderer uses the URL only to decide whether to present the
action. Packaged Groot still sends only the transaction ID across IPC; Rust parses
it and constructs exactly `https://mempool.space/tx/<txid>` from the compile-time
Mainnet identity before asking the operating system to open it.

Signet and Testnet4 retain their exact allowlisted paths. Regtest has no explorer
action. Unknown networks, malformed transaction IDs, and renderer-supplied URLs
remain rejected. The existing disclosure that opening the action shares the
transaction lookup with mempool.space remains adjacent to the control.

## Consequences

Mainnet transaction details and post-broadcast confirmations regain the same
optional-insight flow as public rehearsal networks. This adds no wallet backend,
automatic request, webview navigation, transaction mutation, or secret access.
It does disclose a user-selected transaction lookup to mempool.space and the
user's network path when opened. Distribution of the Mainnet candidate remains
blocked by ADR 0055 and the mainnet release checklist.
