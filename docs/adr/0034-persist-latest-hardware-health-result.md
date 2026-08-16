# ADR 0034: persist the latest hardware health result

Status: accepted.

## Context

ADR 0022 classified hardware health observations as session-only presentation state. Physical certification showed that this made a successful saved-identity check disappear after restart and caused Overview, Settings, and multisig signer details to disagree unless they shared route lifetime. A complete recent-check log adds little user value and would create another certification-like record without the stronger semantics of address or policy verification.

## Decision

Each external-signer or multisig wallet database stores one latest hardware-health result per normalized signer fingerprint: status, checked-at time, and bounded actionable summary. A new result atomically replaces the prior result for that signer. `WalletPort` exposes wallet-scoped read and record operations; no route writes this durable metadata directly.

The frontend may keep a replace-on-wallet-load cache of those DTOs so separate mounted entry points show the same current value. That cache is never authoritative, is cleared or replaced when wallet context changes, and retains no history. The shared device-details modal shows only the latest result and formats its time through the standard local timestamp component.

## Consequences

The last healthy or attention result survives restart for both BIP84 external signers and BIP48 multisig cosigners. The UI avoids duplicate session-history rows and cannot leak a prior wallet's result into the selected wallet. This record remains evidence of one saved-identity comparison, not firmware attestation, policy registration, address verification, or transaction-signing certification.
