# ADR 0116: guided marketplace sandbox

Status: accepted for the private simulated-money test surface.

The normal UI's combined simulator actions were superseded by [ADR 0117](0117-marketplace-sequenced-trade-progress.md).

Date: 2026-11-09.

## Decision

Use an amount-first flow with native numeric entry and four shortcuts. A shortcut requests a quote and opens review; it never starts a trade. Show exact pay and receive totals, the bank rail, and the fee sum before the explicit Start trade action. Keep the amount and direction when editing; discard the old quote. Price expiry requires an explicit new quote and a new review. Focus moves to the new stage heading and returns to the amount field when editing.

The server selects the best eligible seeded system offer and saves the quote in one idempotent transaction. Guided start consumes that quote, creates the trade, and records simulated escrow in one transaction. A buyer's explicit Simulate payment action records the payment action and both simulated counterparty/settlement confirmations atomically. A seller first simulates the buyer's claim, then reviews the exact expected receipt and principal and acknowledges the amount and sender before release. Guided seller release records receipt and simulated release together. Each transition still passes the original role, state and revision rules and gets its own ordered journal entry. This consolidates the simulator actions described in ADR 0114 for the guided path; manual steps remain available under Test controls.

The workspace includes the actual other participant's alias and system classification in the same authorized read transaction. The UI never offers to act for a human counterparty. The guided write endpoints independently reject human counterparties. A seller's acknowledgement is cleared on close, revision change, account change and reload. There is no timer-driven quote, payment, receipt or release.

## Compatibility and release boundary

The service and browser retain the existing v1 trade records and event meanings. No database schema or wallet/profile/backup/proposal/registry format changes. Retain the exact old source bundle for backups taken with it; restore using its source-bound tool before opening the restored v1 database with the newer candidate. Older manual endpoints remain supported. No new dependencies, provider transport, bank connection, native authority, Bitcoin transaction or Mainnet enablement. BIP impact: **none**.

The only executable path is an explicitly labelled private sandbox. Funded operation needs the provider, legal, liquidity, escrow/recovery, native and settlement gates in the [production-readiness record](../marketplace/production-readiness.md). The wallet Mainnet release authorization is independent.
