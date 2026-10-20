# ADR 0099: Remove the Mainnet rollout amount ceiling

- Status: accepted by the release owner for implementation; replacement release evidence pending
- Date: 2026-10-20
- Supersedes: amount-ceiling provisions of ADRs 0026, 0052 and 0053
- Tracking: follow-up release feedback under #116

## Context

The first limited Mainnet rollout retained a 1,000,000-sat ceiling through
v5.2.0 GA. Preparation and final persisted-PSBT authorization both enforce it.
A tester could not prepare a larger payment, and the generic “release policy”
message hid the reason. The release owner explicitly requested removal of the
0.01 BTC cap and clear policy errors.

## Decision

Remove the rollout ceiling on recipient amount and recipient-plus-fee debit
from the shared Rust policy. Standard software, hardware and multisig payments,
including RBF, use the same final PSBT validation. CPFP retains its existing
wallet-owned-output requirement.

Retain positive amounts, Bitcoin's maximum monetary supply, checked arithmetic,
exactly one recipient, the independent 100,000-sat Mainnet fee limit, exact
network/genesis/backend admission, canonical prevouts, frozen-input checks,
change ownership, signature verification and fresh final authorization. This
amendment does not enable a network, wallet policy, platform or signing path.

Replace discarded policy reasons at every preparation/final-PSBT call site with
one exhaustive native error translator. Keep the existing `invalid_amount`
spend-error code and explain the specific reason and remedy. Translate only
allowlisted native policy messages before the broad amount-error category in
French and Spanish; unknown messages retain their category fallback.

## Compatibility and standards

No database, registry, backup, proposal, label or credential format changes.
Existing wallets and saved proposals remain readable without migration. An
older application still applies its old ceiling to larger proposals. No BIP,
PSBT encoding, descriptor, key derivation or dependency change.

## Risk and evidence

The rollout loss limiter is deliberately removed: a valid larger payment can
now be signed and broadcast. Users must review its actual recipient, amount,
fee and change; neither UI checks nor earlier review replace final native PSBT
authorization. The independent fee protection remains effective for larger
payments and acceleration.

Regression tests cover the old boundary, larger payments, fee limits, monetary
bounds, invalid recipients/fee children, native reason mapping and EN/FR/ES
messages. Run the Mainnet-enabled and default Rust suites, native lint/format,
frontend validation and isolated Core integration before handoff. Browser
fixtures and unit tests do not certify live Mainnet or physical devices.

Reviewed-source hashes and public release authorization are not refreshed by
this change. A new reviewed source snapshot and exact-candidate release
procedure are required before distributing a replacement public package.
