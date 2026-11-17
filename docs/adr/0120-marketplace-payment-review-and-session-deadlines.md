# ADR 0120 Marketplace payment review and session deadlines

Status accepted for the private sandbox. Supersedes ADR 0119's example bank details for legacy human trades. System counterparties keep the synthetic example.

Groot groups exact amounts, fees, and quote expiry in review. An active trade shows chat beside the current step on wide screens and offers a focus shortcut on narrow screens. The buyer can copy the exact amount, account holder, IBAN and reference together. Trade activity includes timestamps, and seller receipt review displays the payment reference beside the expected amount.

The browser shows recovery actions for human trades with missing saved payment instructions and withholds the ordinary payment and receipt controls. A previously sent payment can still be reported during a pending refund so it can pause for review. The server-issued session deadline clears the browser view and aborts an active browser request. The service retains authority over session validity and persisted transitions.

Quote and session expiry each schedule a deadline check with a foreground recheck. Once a quote is observed expired, its ID stays expired through backward clock changes. The seller's QR encoder loads when the escrow panel can use it, and the panel reserves its dimensions while it loads.

No BIP impact. The URI, Bitcoin network, key custody, signing, wallet storage and service database format remain as defined in ADR 0119. The change targets the private sandbox.
