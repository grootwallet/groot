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

Physical v0.4.29 follow-up then proved that retries could not correct the
owning regression. Groot's earlier certified BitBox import used HWI's direct
`getxpub` command. Later live-identity hardening replaced it with HWI's compound
`getkeypool` command so fingerprint and account key came from one client. Nova
continued to unlock but consistently rejected that compound operation, even as
the only connected device.

The next packaged candidate replaced the custom path with HWI's canonical
BIP84 keypool arguments but still reopened Groot's cached HID path directly.
Physical Testnet4 testing disproved that correction on both an original
BitBox02 and a Nova, while Trezor and Ledger imports passed in the same package.
The common failure boundary is therefore BitBox's post-enumeration direct-path
reopen, not the test-chain derivation or aggregate multi-device filtering.

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
- Initial BitBox account-key import lets HWI rediscover and open the signer
  inside the selected account-key subprocess instead of reopening Groot's
  cached low-level path. When discovery returned a fingerprint, Groot supplies
  it as the exact selector. A fingerprint-less selection is allowed only when
  the cached scan contains exactly one BitBox family row; otherwise it fails
  ambiguous before starting the command. The account-key operation may retry
  up to three times when HWI returns only code `-3`, `-9`, `-12`, or `-15`. Code `-9` is
  retryable only in this BitBox initial-import boundary, where Groot supplies a
  fixed valid BIP84 or BIP48 path; it does not make an unsupported operation
  acceptable. The retries remain inside the existing interactive lease. Cancellation, timeout, malformed
  output, wrong network/path, and incomplete or mismatched identity are never
  retried or accepted.
- A packaged Nova retest disproved the direct-`getxpub` re-attestation
  candidate: HWI enumeration remained fingerprint-less after unlock, so it
  could not provide the required master fingerprint. BitBox single-key import
  instead uses HWI's canonical BIP84 keypool form (`wit`, account zero, first
  receive range) without a custom path. HWI returns the fingerprint, exact
  `m/84'/1'/0'` origin, and account key from one open client. Groot parses and
  validates all three fields from that single response. Missing identity,
  wrong origin or network, malformed output, and ambiguity still fail closed.
  Multisig import retains the exact BIP48 keypool operation.
- An account-key failure keeps a direct retry action for the selected
  capability instead of making another aggregate scan the primary recovery.
- A returned path remains an opaque capability. BitBox initial single-key
  import redeems that capability into an HWI-owned fingerprint or unique-family
  selection rather than forwarding its stale HID path. Health,
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
review. HWI now owns BitBox rediscovery and account-key extraction within that
one bounded process, without weakening the atomic fingerprint/account-key
proof or placing device metadata in process arguments. Physical retesting
remains required; automated fixtures do not prove vendor timing or USB behavior.
