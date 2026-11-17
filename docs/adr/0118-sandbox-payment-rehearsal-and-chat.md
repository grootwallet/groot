# ADR 0118 Sandbox payment rehearsal and chat

Status superseded by [ADR 0119](0119-live-sandbox-trade-and-payment-handoff.md).

## Decision

Show a deposit QR on the seller's Escrow step. The QR contains plain rehearsal text and a short test reference. On the buyer's Payment step, show an example account holder, an intentionally invalid IBAN and the same reference. Use the existing QR encoder and sandbox quote. The fixtures carry no Bitcoin destination or payment credentials.

Keep the selected trade's chat open and group secondary actions under compact trade tools. A same-origin event stream sends only a generic update after a message commits. The receiving browser reads the bounded message list using its current account, session and trade. On reconnect it reads the list again to catch up. The stream cannot change trade state, close receipt review or publish another account's messages. Payment and release retain their existing explicit actor steps.

The service authorizes the stream with the same session and trade-membership checks as ordinary reads. It closes streams on logout, expiry, disconnect and shutdown, and bounds their number and lifetime. The exact event format and limits belong to the service contract.

## Scope

The change is private sandbox UX and transport. There is no impact on BIP support, wallet signing, or persisted wallet and service formats.
