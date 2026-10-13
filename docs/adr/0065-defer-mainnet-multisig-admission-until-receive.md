# ADR 0065: Separate Mainnet watch-only multisig creation from receive readiness

- Status: accepted for the isolated certification candidate; distribution remains blocked
- Date: 2026-09-13
- Supersedes: ADR 0052's short-lived live-HWI admission at standard multisig **creation** only
- Extends: ADR 0064's offline profile creation; does not change external-signer or recovery import

## Context

The initial BIP48 USB import proves a public signer identity, but its admission
was stored only in process memory for 15 minutes. A valid saved multisig draft
outlives that admission. Restarting Groot and finishing at the coordinator PIN
therefore failed with `hardware_not_approved`, even when its public policy,
descriptor backup, and device-verification evidence remained valid. Requiring
new live checks at the PIN step would turn asynchronous watch-only coordinator
creation into a device-dependent ceremony and was rejected.

## Decision

Standard Mainnet multisig creation validates the public policy and creates an
empty, credential-protected **watch-only** coordinator without reusing the
short-lived initial-import admission. No mnemonic or signing key is created in
that coordinator. The admission gate remains unchanged for external-signer
single-key creation and Mainnet recovery import.

Before Groot can issue a **new labeled Mainnet multisig receive address**, Rust
requires durable, descriptor-matching policy-and-first-address evidence from at
least the spending threshold of distinct interactive hardware signers. Every
Coldcard in the policy also requires its separate saved policy-file import
acknowledgement. File acknowledgement alone never counts as a device-displayed
first-address proof. Missing, wrong-device, wrong-address, or insufficient
evidence fails closed with a Policy-page recovery action. Regtest, Signet, and
Testnet4 behavior is unchanged. The existing per-signer signing gates remain.

This candidate deliberately does **not** count Trezor or Coldcard as an
interactive policy-verification quorum member because the pinned HWI path has
no durable policy-and-first-address record for them. A Mainnet configuration
whose threshold cannot be met by Ledger, BitBox02, or Jade verification cannot
issue a new receive address in this candidate. That is an explicit incomplete
certification path, not an invitation to weaken the gate.

## Limits and compatibility

The BIP48 policy, descriptors, wallet database schema, version-1 draft,
backup, registry, and proposal formats are unchanged; saved drafts resume
without migration. Existing recorded addresses and externally exported public
descriptors remain accessible: a public descriptor can derive addresses outside
Groot, so the in-app receive gate cannot prevent an external deposit. Users
must still independently compare their descriptor and receive address on
trusted devices before sharing or funding. This is not a claim of Mainnet GA
or physical-device certification. The exact revised candidate needs packaged
restart/resume, device-policy, receive-gate, funding, signing, and recovery
testing before release.
