# ADR 0048: bound transaction signing review separately

Status: accepted. This refines ADR 0041's selected-device deadline only for transaction signing; its coordination, cancellation, identity-binding, and subprocess decisions remain in force.

## Context

Hardware transaction review can contain wallet-policy authorization, recipient and change inspection, fees, locktime, and final confirmation. A packaged Trezor Model One Testnet4 rehearsal exceeded the existing five-minute selected-device deadline during a deliberate complete review. Groot timed out while the device was still processing, leaving an unchanged proposal but a confusing recovery path.

Discovery and short identity/display actions should not inherit a substantially longer bound. Conversely, transaction signing should not pressure a user to skip trusted-display review merely to satisfy a host timeout.

## Decision

- Aggregate discovery remains bounded at 90 seconds.
- Selected-device identity, address display, health, PIN, and policy-only interactions remain bounded at five minutes.
- Only the operation lease that culminates in `signtx` receives a ten-minute absolute deadline, including admission, live identity proof, any repeated policy authorization, and transaction signing.
- A Trezor signing timeout explains that the proposal and collected signatures remain unchanged and directs the user to reconnect a device that remains on a loading screen before scanning and retrying.
- Hardware actions still require an unlocked native session when initiated. A `wallet_locked` response closes renderer hardware overlays and routes to unlock; timeout expansion does not extend or silently renew the wallet session.

## Compatibility

No wallet, profile, registry, credential, proposal, policy-verification, backup, or payment-draft schema changes. The deadlines and renderer routing are transient runtime behavior.

## Consequences

Users can complete a careful hardware review without an artificial five-minute signing race, while discovery and non-signing prompts retain tighter bounds. A wedged signing process may occupy the single hardware coordinator for up to ten minutes, but cancellation, navigation, wallet switching, and process exit retain ADR 0041's acknowledged cleanup behavior.
