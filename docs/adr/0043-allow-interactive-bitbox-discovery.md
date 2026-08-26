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

Physical testing then disproved HWI-owned type/fingerprint rediscovery as well:
both BitBox models still failed while Trezor and Ledger succeeded. Reviewing
HWI 3.2.0's CLI and BitBox adapter showed why that candidate did not change the
relevant lifecycle: `find_device` enumerates, closes that client, and opens a
new BitBox client before the command. Groot's last physically successful Nova
integration already used the same HWI release, cleared environment, and
process-per-command isolation; the later global conversion from documented
CLI argv to HWI's `--stdin` parser is the remaining shared regression boundary.

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
- Initial BitBox single-key import requires exactly one BitBox family row in
  the cached scan, regardless of whether discovery supplied a fingerprint;
  otherwise it fails ambiguous before starting the command. It invokes HWI's
  canonical BIP84 keypool request through ordinary CLI argv, matching HWI's
  documented external integration and Groot's last physically certified Nova
  invocation boundary. The argv is a fixed non-sensitive command containing
  only chain, `bitbox02`, address type, account, and range. It never contains a
  device path, fingerprint, address, descriptor, account key, PSBT, password,
  or other device identifier. Every other HWI operation retains the private
  stdin protocol. The account-key operation may retry
  up to three times when HWI returns only code `-3`, `-9`, `-12`, or `-15`. Code `-9` is
  retryable only in this BitBox initial-import boundary, where Groot supplies a
  fixed valid BIP84 request; it does not make an unsupported operation
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
review. HWI owns BitBox rediscovery and account-key extraction within that one
bounded process. The narrow documented-argv exception exposes no device
metadata and does not weaken the atomic fingerprint/account-key proof.
Physical retesting
remains required; automated fixtures do not prove vendor timing or USB behavior.

A subsequent packaged retest failed for both BitBox models. Sanitized host
inspection found that HWI's documented BitBoxApp cache contained an app Noise
key but no paired-device public-key list. HWI 3.2.0 can still identify USB
devices in that state, but its external-GUI mode deliberately refuses first
pairing because it cannot safely present and confirm the pairing code. Groot
therefore recognizes only HWI's fixed unpaired-device message, returns a stable
`hardware_pairing_required` error without forwarding raw HWI text, and skips
futile transient retries. The user must pair and open the exact device in
BitBoxApp, fully quit BitBoxApp, and scan again in Groot.

Physical packaged v0.4.29 follow-up then passed initial BIP84 account-key
import independently on an original BitBox02 and a Nova after the pairing state
was repaired in BitBoxApp. This confirms the pairing diagnosis and the import
path; it does not certify receive display, health, multisig registration, or
signing on either model.

The next receive-address check separated the models again. Nova completed the
trusted BIP84 display, but the original BitBox02 was enumerated as ready and
then returned an unlock-required result when `displayaddress` reopened the
cached HID path. Groot correctly persisted no verification, but the dialog
offered only another aggregate scan. For saved BitBox address display, Groot
now keeps the preceding full account-identity proof and exclusive lease, then
asks HWI to reopen the display connection by that freshly proven fingerprint.
HWI 3.2.0 verifies the fingerprint before executing `displayaddress`; the
fingerprint and descriptor remain in the private stdin command and no device
path or wallet identifier enters process argv. A failed display retains the
same address and selected signer behind an explicit interactive retry action.
This is a candidate correction pending a separate packaged retest on the
original BitBox02 and Nova; Nova's earlier pass is not inherited by the new
invocation boundary.
