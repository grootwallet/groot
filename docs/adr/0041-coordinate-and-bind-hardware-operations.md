# ADR 0041: coordinate and bind hardware operations

Status: accepted

## Context

HWI 3.2.0 accepts a device-type option for `enumerate` but still walks every backend. Groot previously repeated that aggregate work once per eligible saved family, serialized it behind an unbounded raw mutex, and allowed closing the renderer modal to invalidate only UI state. Cached enumeration identity was also reused for later actions, dynamic descriptors and PSBTs appeared in subprocess argv, duplicate paths overwrote one another, and the renderer could submit a durable health record separately from the native proof.

## Decision

- One explicit discovery request invokes one aggregate HWI enumeration. Rust validates and bounds the complete response, rejects duplicate/conflicting non-empty paths, caches every valid device behind an opaque short-lived capability, and filters eligible families or saved identities afterward.
- Concurrent discovery callers share one process-wide native single flight independent of their requested type sets. Only an explicit **Scan again** starts a new discovery flight. A uniquely path-addressable locked BitBox02, Jade, or Ledger row may instead redeem its existing opaque capability into one interactive operation; that operation must freshly bind the complete saved identity before any health, display, policy, or signing result is accepted. Multiple unresolved paths for the same family fail as `hardware_ambiguous`. Trezor keeps its bounded PIN flow, while Coldcard remains prepare-then-rescan.
- A bounded native coordinator permits one active operation and one coalesced discovery. Interactive work has priority, discovery cannot start while a prompt is active, absolute deadlines include admission time, and excess work fails with `hardware_busy`.
- Modal close, navigation, and wallet switch cancel native queued/running work. Unix process groups and Windows process-tree termination are used before bounded pipe cleanup and lease reuse.
- Discovery paths are hints, never identity. Health, address display, policy verification, and signing open the selected path and freshly compare device type, fingerprint, requested derivation, and complete saved account xpub under the same exclusive lease as the action. Wallet, proposal, policy, or address context is revalidated before persistence.
- Dynamic HWI values use HWI's quoted stdin command protocol. Process argv is fixed to `--stdin`; direct no-shell execution, executable authentication, cleared environment, bounded I/O, redacted errors, and PIN zeroization remain mandatory.
- A saved-signer health operation combines authoritative wallet lookup, live proof, context revalidation, and result persistence in Rust. No renderer command can author a durable healthy record.
- Subprocess isolation remains the integration boundary. Moving to an in-process hardware library requires a separate ADR and certification campaign.

## Compatibility

No wallet, profile, registry, credential, proposal, address-verification, health-record, backup, or network-settings schema changes. Existing paths were transient and remain unpersisted. Existing saved public signer identities and durable health rows remain compatible.

## Consequences

Wallets with multiple signer families no longer repeat the same all-backend scan, stale renderer work cannot prompt later, and a cached path cannot substitute for live account identity. Cancellation and complete process-tree cleanup add a small coordination boundary, while exact-path live proof adds one bounded keypool read before sensitive actions. Physical vendor certification remains required because automated fixtures cannot reproduce device firmware, USB ownership, or on-device prompts.
