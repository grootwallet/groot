# ADR 0121 Isolate the LocalCoinSwap account gateway

Accepted for the optional browser development preview. [ADR 0113](0113-evaluate-localcoinswap-through-isolated-public-discovery.md) continues to govern the separate discovery research tool. [ADR 0114](0114-durable-marketplace-sandbox-service.md) continues to govern the private simulated marketplace.

## Context

The selected marketplace product uses a provider's liquidity and supports execution inside Groot. LocalCoinSwap publishes offer, account, chat and dispute APIs. Its BTC escrow paths require provider-associated wallet keys and trade secrets. We have yet to verify the complete funding, release, refund, payout and lost-device recovery contract for a native Groot integration.

## Decision

Provide a same-origin, versioned gateway in a dedicated loopback Vite launcher. Default to a deterministic fixture transport. An operator can choose public offer access or connect one LocalCoinSwap account for existing trades. Account writes require a separate token, opt-in configuration and a private durable journal. Public and account calls use a fixed upstream HTTPS origin. Keep this gateway unavailable in native builds, production assets and Vite preview.

Keep SvelteKit presentation, the typed browser client, gateway policy, receipt persistence and provider normalization separate. The browser sends the local gateway token only. The provider key remains in server configuration. Minimize provider responses to amounts, participants, status, listing terms and text chat. Offer prices remain indicative and the fiat amount stays local for searches. LocalCoinSwap owns account scope, trade authorization and dispute decisions. See the [API contract](../marketplace/localcoinswap-api.md).

The gateway records chat, payment claims and dispute open/withdraw requests before submission. Trade actions check the current provider state. Identical keys and bodies replay the same local receipt. Uncertain outcomes stay unresolved, including across restart, and block matching writes. The client uses receipts and provider reads to reconcile. This avoids assuming provider idempotency or treating a timeout as a rejection.

Keep bitcoin execution unavailable until the current key, signing, address ownership and recovery protocol is independently verified. Treat the current account gateway as a single-account development boundary. A native or hosted production integration requires its own reviewed authorization, credential isolation, transaction review and recovery design. Provider documentation invites third-party integration. Commercial agreements, intended jurisdictions and service coverage require review for the actual rollout scope.

## Compatibility and evidence

The gateway creates a separate SQLite receipt schema v1 for enabled account writes. It rejects foreign or unsupported files. It needs no migration for this new feature and owns no records in the wallet or private simulated marketplace databases. Fixture receipts and fixture provider data are in memory. No BIP impact. The gateway handles off-chain metadata and integer amounts. It has no key derivation, payment requests, Bitcoin transactions, PSBTs, signing, broadcast or wallet storage authority.

The fixture API and browser checks exercise the same gateway and response validators as account mode. Live unauthenticated reads verify the public wire contract. Authenticated account behavior and BTC escrow require separate evidence before a production claim. [Production readiness](../marketplace/production-readiness.md)
