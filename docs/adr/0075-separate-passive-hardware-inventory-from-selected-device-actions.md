# ADR 0075: Separate passive hardware inventory from selected-device actions

- Status: accepted; macOS implementation complete, physical certification remains a release blocker
- Date: 2026-09-30
- Extends: ADR 0041's coordination and identity-binding rules
- Supersedes: ADR 0043's acceptance of interactive aggregate discovery as a product discovery mechanism

## Context

Groot's pinned HWI 3.2.0 executable does not provide passive discovery. Its
aggregate `enumerate` walks vendor backends sequentially and can initialize a
BitBox connection or start a Jade login before the user has selected a signer.
Supplying only `--device-type` or `--fingerprint` does not isolate a later HWI
action: HWI first performs aggregate enumeration and then filters the result.
This can touch unselected devices, hide locked devices behind a prompt, amplify
startup latency, and make two same-family devices unsafe to distinguish.

The reviewed HWI artifact remains the action boundary. Discovery does not need a
second executable: macOS already exposes HID, USB-registry, and serial inventory
through platform APIs that do not require a vendor session. Those APIs still
need exact, reviewed model/path mappings. Guessing a model from shared USB
identifiers would weaken the Mainnet gate, so ambiguous records must be omitted
there even if that means a host-visible device is not offered.

## Decision

1. Hardware discovery is a passive inventory operation. It reports every
   supported candidate that the host exposes while locked, without opening a
   vendor session or requesting unlock, PIN, login, passphrase, account key,
   wallet policy, address display, signature, or approval. A device hidden by
   its own firmware is not detectable: notably, Coldcard exposes its HID
   endpoint only after the user unlocks it and enables USB communication.
2. On macOS, Groot performs inventory in trusted Rust through read-only HID,
   USB-registry, and serial-port enumeration. The boundary returns only an exact
   HWI transport path plus an allowlisted family/model label used to mint a
   short-lived opaque capability. It never receives wallet data, fingerprints,
   descriptors, addresses, PSBTs, PINs, or credentials, and it never opens a
   device handle.
3. The implementation uses exact lockfile-pinned `hidapi` 2.6.7, `nusb` 0.2.7,
   and `serialport` 4.10.1 dependencies. Their licenses, native build/link
   behavior, Cargo lock entries, SBOM inclusion, and supply-chain checks are part
   of the normal release review. Exact allowlist and path-shape tests,
   duplicate-path rejection, bounded record counts, cache invalidation, and
   deterministic sorting are mandatory. Windows, Linux, and mobile remain
   unsupported until their own boundary and evidence exist; macOS transport
   assumptions do not transfer to another platform.
   The macOS HID manager and every refresh using it live on one dedicated,
   process-lifetime inventory thread. They must not be created or destroyed on
   arbitrary async blocking workers: macOS schedules `IOHIDManager` on its
   initializing thread's run loop, and moving successive inventories between
   worker threads can terminate the process inside IOKit/CoreFoundation.
4. Only an explicit user-selected capability may start an interactive HWI
   action. Every HWI account-key, unlock/PIN continuation, policy, address, and
   signing command must contain the selected non-empty exact device path. Empty,
   synthetic saved-device, type-only, and fingerprint-only selectors fail before
   process spawn. An explicit saved-signer action may resolve one passive path,
   but multiple unidentified same-family candidates remain ambiguous.
5. Discovery never implies identity, readiness, policy registration, or signing
   consent. Under one exclusive native lease, the selected action freshly proves
   device type, fingerprint, derivation, and complete account xpub before Groot
   accepts an action result. Discovery never retries an interactive request.
6. Concurrent discovery callers share one native flight and one cache epoch.
   Closing the picker, navigation, wallet replacement, timeout, cancellation, or
   reconnect invalidates its capabilities; a late result cannot repopulate the
   cache. Active selected-device work remains bounded, cancellable where the
   protocol allows it, and guarded against automatic wallet lock.
7. Passive classification is fail-closed. Bitcoin-only BitBox02 and Nova,
   Coldcard, Ledger Nano S Plus, Trezor Model One, model-specific Safe 3 revision
   B, and HWI's documented Jade serial adapters are admitted. Current Model One
   firmware uses the shared WebUSB VID/PID but retains the legacy USB device
   release 1.00; core-family devices use release 2.00. Safe 3 revision A and
   Model T remain passively ambiguous after that distinction. Test networks may
   expose the ambiguous row as a generic Trezor candidate for interoperability
   testing; Mainnet omits it until a selected-device boundary can prove the
   exact approved model. Multi-edition or bootloader BitBox records and
   unapproved Ledger models are omitted.

The macOS inventory, exact-path action, shared-epoch, cancellation-invalidation,
and activity-guard parts of this decision are implemented in the 2026-09-30
pipeline correction. The subsequent crash correction pins the HID manager to
its dedicated process-lifetime worker and a connected Model One survives twenty
consecutive in-process inventories. Stock HWI aggregate `enumerate` is not
production-callable from the picker. Until the packaged seven-device matrix
exists, the result must not be described as physically certified or assigned a
measured p50/p95.

## Compatibility

No wallet, profile, registry, proposal, health, policy-evidence, backup,
descriptor, PSBT, or database format changes. Device paths and capabilities stay
process-local and transient. No migration is required.

## Consequences

Picker discovery no longer launches HWI or touches a vendor backend, and two
connected BitBox models can retain distinct capabilities. Coalesced callers no
longer invalidate each other's cache result, and cancellation closes the
late-write race. The tradeoff is deliberate under-detection where the host or
passive identifiers are insufficient: pre-USB Coldcard and Mainnet's ambiguous
Safe 3 revision-A/Model-T record are omitted. Automated fixtures prove
classification, command selection, and lifecycle invariants only; they are not
physical-device, firmware, latency, trusted-display, or release certification.
