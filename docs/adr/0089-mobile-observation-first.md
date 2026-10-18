# ADR 0089: Mobile observation before signing

- Status: accepted for development scope and safety restrictions only
- Date: 2026-10-16
- Extends: ADR 0001, ADR 0035, ADR 0037 and ADR 0088

## Decision

Begin 5.3 from the shipped 5.2.0 source with an isolated Signet iOS development build. Deliver authenticated public watch enrollment, balances/history, atomic permanent receive labels and bounded PSBT transfer/review in separate increments. The existing mobile signer and continuity branches are reference implementations, not approved wholesale merges.

Native code rejects mobile key generation, software creation/recovery, secret backup access, signing and broadcast while the pairing, replay/substitution, revocation, interruption, independent recovery and key-isolation gates remain incomplete. Desktop capability is unchanged. Mobile PDF export also fails explicitly because the desktop print API is unavailable on iOS.

The [implementation plan](../mobile-5.3-plan.md) defines phase acceptance and the next protocol/storage decisions. This ADR does not select a new cryptographic protocol, authorize a phone-held signer, create a relay, certify a platform or authorize Mainnet/mobile/public distribution. The owner requested this development scope and required signing to remain blocked.

## Compatibility and release boundary

No persisted format or BIP behavior changes. No migration or discard is performed. Pairing persistence needs its own versioned design before implementation; phone loss must not disable the desktop wallet. The 5.2.0 release, tag, artifacts, trust keys and reviewed source pins remain intact. Package versions stay at the baseline until a separate development-version decision. Generated iOS output uses a distinct development identifier and is never a release artifact.
