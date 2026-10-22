# ADR 0101: Internal Testnet4 HWI operation session

- Status: accepted for owner-requested internal RC11 performance rehearsal; physical acceptance pending
- Date: 2026-10-20
- Extends: ADRs 0041, 0075 and 0098

## Evidence and scope

The owner measured RC10 Mk4 identity at 6.22 seconds and transaction presentation
at 9.5 seconds; Ledger Nano S Plus identity at 5.59 seconds and address/policy
presentation at 16.45 seconds; original BitBox02 identity at 8.97 seconds and
transaction presentation at 13.27 seconds. These are single owner samples,
not certification or controlled medians. Approval time is a separate interval.

The sealed extracted runtime previously applied only to Coldcard. A device-free
RC10 stock HWI version launch took 6.060 seconds, versus 75 ms with that runtime.
Identity followed by display/sign also reopened a client for each command. Both
costs can dominate the requested action. Host timing cannot predict USB speed.

## Decision

Extend the sealed runtime to selected Coldcard, Ledger and BitBox02 families on
Testnet4, only in ad-hoc `REHEARSAL_ONLY` multi-network internal builds. Production
and other networks retain the existing path. No dependency changes or external
Python installation are introduced. Extract the fixed original importer modules
and PYZ from the same digest-pinned HWI 3.2.0 executable. Vendor device code and
the original executable remain unchanged. A first-party C launcher embeds that
bundled Python 3.9 in isolated/no-environment/no-site mode, with a fixed module
search path. First-party bootstrap/worker source and the signed launcher are
part of the full immutable runtime manifest and outer app signature seal.

Each request starts a new bounded isolated process, opens the exact selected
device once, reads its fresh master fingerprint and requested full account xpub,
and compares both against native saved candidates before at most one action.
Only public account material read on that same connection is reused, and all
state dies when the process closes. No live state, unlocked state, identity or
policy cache survives an operation. `identity` performs no action; `display`
and `sign` use the unchanged vendor command functions and device approval.

Native code derives per-candidate action eligibility from existing policy
records. The child must withhold the action if the matched candidate lacks
required policy evidence. Rust independently checks the returned full identity,
policy gates, actual displayed address, unchanged reviewed PSBT, signature-only
merge, wallet selection/session/proposal context and current input availability.
A Coldcard external policy-file acknowledgement stays an acknowledgement.

The protocol accepts only fixed action, chain, family and account-path values,
a bounded private JSON stdin line, and bounded private output. It rejects duplicate
JSON keys, malformed scope and ambiguous identities. Arbitrary vendor exception
text is discarded; stable numeric errors and fixed known policy phrases remain.
No request enters argv/environment or logs. Existing exclusive operation leases,
process groups, cancellation/revocation, timeout, kill/reap, output limits and
full app/HWI/runtime verification on every invocation remain in force.
An enabled runtime/protocol failure fails closed; an action is never replayed.

## Acceptance, limits and rollback

Run protocol boundary/no-action/cleanup tests, extraction/tamper fixtures, native
format/lint/tests, applicable Core and browser regressions, and mandatory validation.
Record the existing reviewed-source gate failure without updating its pins.
Verify and benchmark the exact packaged runtime with a `probe` that exits before
opening any client. Record cold and warm samples separately. The native production
request enum exposes only identity/display/sign; probe is for device-free tests.

Physical acceptance must measure each exact device/firmware/build: health,
identification, address/policy presentation, signing prompt, final signature,
rejection, missing policy, locked/disconnected/reconnected and cancellation.
Target a reduction of at least 50% in the slow host-dominated waits; no numerical
physical claim is made until owner retesting. BitBox02 Nova and every other model
require distinct evidence; shared family transport is not inherited certification.

No persisted format, migration, backup, wallet, credential, registry, policy record,
PSBT encoding, derivation or BIP support changes. RC10 remains compatible rollback.
Main stays untouched; public release requires independent exact-source review and
certification. This internal experiment grants no production authorization.
