# ADR 0043: allow interactive BitBox discovery

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

The corrected packaged build then reached a fingerprint-less BitBox02 Nova row, but the
first exact-path account-key command still surfaced the sanitized
`hardware_unavailable` result while the same HID path reopened immediately
after the enumeration client closed. The visible evidence cannot distinguish
HWI's raw transient codes, so the initial correction was deliberately limited
to its documented disconnected, locked, and busy codes. Packaged v0.4.29 Nova
testing proved that allowlist incomplete: HWI's BitBox adapter deliberately
maps the vendor's non-granular generic failure to its otherwise unsupported
"unavailable action" code during the same reopen boundary. The error action encouraged
another aggregate scan, recreating the same handoff instead of retrying the
selected capability.

A subsequent packaged Nova test showed two further UX problems. HWI closes the
enumeration client before Groot opens the exact-path account-key client, and
BitBox can request its password again for that new secure connection. Groot
incorrectly described the fingerprint-less enumeration row as locked and then
gave no BitBox-specific instruction during the second connection. The same test
also showed that a five-minute aggregate deadline looks indistinguishable from
an endless scan when one backend stalls.

## Decision

- Aggregate HWI discovery remains one explicit, single-flight, cancelable
  subprocess, with a 90-second absolute deadline. Selected-device interaction
  retains its five-minute deadline.
- Discovery remains classified below an admitted interactive action: an
  interactive operation may cancel it and excess discovery still fails busy.
- Only an explicit user scan starts discovery. Groot never retries a timed-out
  scan automatically.
- Initial BitBox account-key import may reopen the same opaque path up to three
  times when HWI returns only code `-3`, `-9`, `-12`, or `-15`. Code `-9` is
  retryable only in this BitBox initial-import boundary, where Groot supplies a
  fixed valid BIP84 or BIP48 path; it does not make an unsupported operation
  acceptable. The retries remain inside the existing interactive lease. Cancellation, timeout, malformed
  output, wrong network/path, and incomplete or mismatched identity are never
  retried or accepted.
- An account-key failure keeps a direct retry action for the selected
  capability instead of making another aggregate scan the primary recovery.
- A returned path remains an opaque capability. Initial import, health,
  display, policy, and signing still require their existing fresh full identity
  proof under the action lease.
- The scan UI tells the user to follow any unlock prompt on the signer while
  keeping companion wallet applications closed.
- A fingerprint-less BitBox row is described as detected, not proven locked.
  Selecting it tells the user that the isolated account-key connection may ask
  for the password again. The password remains vendor-controlled and never
  crosses the Rust/webview boundary.

## Compatibility

No wallet, profile, registry, proposal, backup, health-record, or certification
format changes. Existing Testnet4 data remains compatible.

## Consequences

A locked BitBox02 has 90 seconds to complete the vendor password interaction
before HWI returns its aggregate discovery record. A genuinely stalled scan is
therefore bounded and cancelable without appearing to hang for five minutes.
The selected-device connection still has five minutes for password entry and
review. A transient Nova HID handoff costs at most two short reopen delays
without weakening the atomic fingerprint/account-key proof. Physical retesting
remains required; automated fixtures do not prove vendor timing or USB behavior.
