# ADR 0041: coordinate and bind hardware operations

Status: accepted. ADR 0042 supersedes only the 30-second aggregate-discovery
deadline; the coordination, capability, and identity-binding decisions remain
in force.

## Context

HWI 3.2.0 accepts a device-type option for `enumerate` but still walks every backend. Groot previously repeated that aggregate work once per eligible saved family, serialized it behind an unbounded raw mutex, and allowed closing the renderer modal to invalidate only UI state. Cached enumeration identity was also reused for later actions, dynamic descriptors and PSBTs appeared in subprocess argv, duplicate paths overwrote one another, and the renderer could submit a durable health record separately from the native proof.

## Decision

- One explicit discovery request invokes one aggregate HWI enumeration. Rust validates and bounds the complete response, rejects duplicate/conflicting non-empty paths, caches every valid device behind an opaque short-lived capability, and filters eligible families or saved identities afterward.
- Concurrent discovery callers share one process-wide native single flight independent of their requested type sets. Only an explicit **Scan again** starts a new discovery flight, and that action remains available after partial results. A uniquely path-addressable locked BitBox02, Jade, or Ledger row may instead redeem its existing opaque capability into one interactive operation. The exact-path account-key import receives the five-minute interactive review deadline rather than the 30-second discovery deadline. The command must not require an enumeration fingerprint before starting the account-key request that unlocks the device, and the operation must freshly bind the complete saved identity before any health, display, policy, or signing result is accepted. Multiple unresolved paths for the same family fail as `hardware_ambiguous`. Trezor keeps its bounded PIN flow, while Coldcard remains prepare-then-rescan.
- A bounded native coordinator permits one active operation and one coalesced discovery. Interactive work has priority, discovery cannot start while a prompt is active, absolute deadlines include admission time, and excess work fails with `hardware_busy`.
- Modal close, navigation, and wallet switch cancel native queued/running work. Cancellation completes only after the targeted native operation has terminated and released its lease; a reopened flow waits for that acknowledgement before discovery. A trusted-display request that the vendor protocol cannot dismiss remotely remains visible in Groot and asks the user to reject it on-device, allowing the same process to receive and drain the reply before closing. In particular, HWI 3.2.0 disconnects Jade's serial transport but cannot dismiss an active `get_receive_address` screen. Unix process groups and Windows process-tree termination remain the bounded fallback for navigation, process exit, and operations without an active trusted-display decision.
- Discovery paths are hints, never identity. Health, address display, policy verification, and signing open the selected path and freshly compare device type, requested derivation, and complete saved account xpub under the same exclusive lease as the action. When discovery returned a fingerprint, the fresh keypool proof must also match it. When an interactive signer is still locked and discovery returned no fingerprint, an exact-path `getxpub` request initiates its vendor login and must select exactly one saved full identity; the associated saved fingerprint is never supplied by or trusted from the renderer. Wallet, proposal, policy, or address context is revalidated before persistence.
- Dynamic HWI values use HWI's quoted stdin command protocol. Process argv is fixed to `--stdin`; direct no-shell execution, executable authentication, cleared environment, bounded I/O, redacted errors, and PIN zeroization remain mandatory.
- HWI 3.2.0's Jade adapter does not map its global `testnet4` chain enum and fails before `auth_user`. Exact-device Jade operations for a Testnet4 wallet therefore use HWI's `test` selector, which the adapter maps to Jade's shared test-network family. Aggregate discovery and every other device retain the explicit `testnet4` selector; Rust still validates Testnet4 derivation paths, keys, descriptors, addresses, and saved identity.
- A saved-signer health operation combines authoritative wallet lookup, live proof, context revalidation, and result persistence in Rust. No renderer command can author a durable healthy record.
- Subprocess isolation remains the integration boundary. Moving to an in-process hardware library requires a separate ADR and certification campaign.

## Compatibility

No wallet, profile, registry, credential, proposal, address-verification, health-record, backup, or network-settings schema changes. Existing paths were transient and remain unpersisted. Existing saved public signer identities and durable health rows remain compatible.

## Consequences

Wallets with multiple signer families no longer repeat the same all-backend scan, stale renderer work cannot prompt later, and a cached path cannot substitute for live account identity. Cancellation and complete process-tree cleanup add a small coordination boundary, while exact-path live proof adds one bounded keypool read before sensitive actions. Physical vendor certification remains required because automated fixtures cannot reproduce device firmware, USB ownership, or on-device prompts.
