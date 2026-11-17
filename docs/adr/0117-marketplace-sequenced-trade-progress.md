# ADR 0117 Marketplace trade progress and roles

Status accepted for the private sandbox.

Supersedes the normal UI's combined simulator actions in [ADR 0116](0116-guided-marketplace-sandbox.md). Amount shortcuts, server-selected test offers, exact review and actor-relative counterparty metadata still apply.

## Decision

Use the existing setup progress component for four ordered stages after quote review. Show Escrow, Payment, Receipt and Release. A seller explicitly locks test bitcoin, a buyer explicitly marks payment sent, a seller reviews and acknowledges receipt, and a separate simulator action confirms release. Each action records one existing transition. An actual human test participant acts for their own role. The buyer may simulate the escrow lock only for a system seller. The existing simulator route remains the authority for that check.

Cancellation, refund and dispute get their own state and next action. Hide the normal tracker on exception paths, including a dispute-approved release that skipped seller receipt. Keep trade chat available beside the active trade. Trade activity maps each saved event kind to fixed localized text in journal order. Unknown kinds get a neutral label. No event identifier or revision appears in that list.

## Compatibility and scope

Previously saved v1 trades, messages, event records and idempotency receipts keep their format. The aggregate sandbox endpoints remain for existing clients. Saved trades display the next applicable stage and earlier milestones. The sandbox exercises escrow and settlement with synthetic data. There is no impact on BIP support or wallet data formats.
