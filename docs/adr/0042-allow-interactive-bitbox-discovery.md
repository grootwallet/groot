# ADR 0042: allow interactive BitBox discovery

Status: accepted

## Context

ADR 0041 gave aggregate HWI discovery a 30-second deadline and reserved the
five-minute window for a selected device's exact-path operation. Packaged
Testnet4 testing with an original locked BitBox02 showed that HWI 3.2.0 can
start the device-password interaction inside `enumerate`: its BitBox adapter
opens and initializes each client before it can return the path-only locked
row. Groot therefore timed out and terminated discovery even when the user
successfully unlocked the BitBox. No selectable capability existed yet, so the
separate exact-path deadline could not help.

The corrected packaged build then reached a locked BitBox02 Nova row, but the
first exact-path account-key command still surfaced the sanitized
`hardware_unavailable` result while the same HID path reopened immediately
after the enumeration client closed. The visible evidence cannot distinguish
HWI's raw transient codes, so the correction is deliberately limited to its
documented disconnected, locked, and busy codes. The error action encouraged
another aggregate scan, recreating the same handoff instead of retrying the
selected capability.

## Decision

- Aggregate HWI discovery remains one explicit, single-flight, cancelable
  subprocess, but its absolute deadline is five minutes.
- Discovery remains classified below an admitted interactive action: an
  interactive operation may cancel it and excess discovery still fails busy.
- Only an explicit user scan starts discovery. Groot never retries a timed-out
  scan automatically.
- Initial BitBox account-key import may reopen the same opaque path up to three
  times when HWI returns only code `-3`, `-12`, or `-15`. The retries remain
  inside the existing interactive lease. Cancellation, timeout, malformed
  output, wrong network/path, and incomplete or mismatched identity are never
  retried or accepted.
- An account-key failure keeps a direct retry action for the selected
  capability instead of making another aggregate scan the primary recovery.
- A returned path remains an opaque capability. Initial import, health,
  display, policy, and signing still require their existing fresh full identity
  proof under the action lease.
- The scan UI tells the user to follow any unlock prompt on the signer while
  keeping companion wallet applications closed.

## Compatibility

No wallet, profile, registry, proposal, backup, health-record, or certification
format changes. Existing Testnet4 data remains compatible.

## Consequences

A locked BitBox02 can complete the vendor password interaction before HWI
returns its aggregate discovery record. A genuinely stalled scan remains
bounded and cancelable, but can now occupy the hardware coordinator for up to
five minutes. A transient Nova HID handoff costs at most two short reopen delays
without weakening the atomic fingerprint/account-key proof. Physical retesting
remains required; automated fixtures do not prove vendor timing or USB behavior.
