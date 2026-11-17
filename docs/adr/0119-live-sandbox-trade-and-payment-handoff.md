# ADR 0119 Live sandbox trade and payment handoff

Status accepted for the private sandbox. Supersedes [ADR 0118](0118-sandbox-payment-rehearsal-and-chat.md).

## Decision

Use the selected trade's authenticated stream for both chat and status. An empty hint follows a committed peer update. The client re-reads bounded messages or the canonical workspace, binds the result to its current session and selection, and catches up on reconnect. A pending mutation or failed read after a known save keeps the explicit recovery controls. Reading status never executes a trade action.

The human seller saves synthetic account details for this trade before the lock step. The service validates a practice-only account holder and IBAN, keeps the existing SQLite v1 layout, and makes the details visible to the buyer only after escrow locks. System and legacy trades can use the existing invalid example details. No profile stores payment credentials.

The escrow panel uses a fixed Regtest fixture address and a BIP21-shaped URI carrying the exact integer-derived bitcoin principal and a trade label. The same URI drives the QR and copy action. No wallet derives an address, observes a deposit, signs or broadcasts. Reusing this address is limited to the private rehearsal. Trade actions, receipt confirmation and dispute handling remain simulated.

The screen uses Groot's denomination toggle, review rows and error notice. Toasts render below the trade action in normal layout flow.

## Scope

The sandbox uses a Regtest payment URI fixture with no change to wallet BIP support or persisted wallet formats. Provider execution and Mainnet remain separate release decisions.
