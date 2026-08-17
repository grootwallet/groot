# ADR 0036: display-only market-data boundary

Status: accepted.

## Context

Overview benefits from an optional fiat estimate, and the user approved adapting the existing Sats Signal price-history experience into a native Groot destination. Market prices are external, unauthenticated information. They must not become wallet truth or create a side channel for wallet identity, holdings, labels, activity, addresses, or node credentials.

## Decision

- Groot supports USD, EUR, and GBP as a global display preference. Bitcoin accounting and IPC remain integer satoshis.
- Market data stays outside `WalletPort`. Native Rust calls only the fixed `https://sats-signal.vercel.app` origin through exact ticker, history, and statistics commands with currency/range allowlists, redirects disabled, an eight-second timeout, bounded headers/status/body, and structural response validation.
- Requests contain only public currency, range, and resolution values. The webview computes Overview's fiat estimate locally and never sends a wallet balance or wallet context.
- Ticker and history results use short-lived process-memory caches. A refresh failure may return the prior cache entry only when the UI explicitly marks it as saved/stale. Market data is not persisted in a wallet database or used for transaction decisions.
- The browser prototype uses deterministic local fixtures and an explicit offline fixture. Native errors are stable and do not expose provider response bodies.
- Chart geometry, semantic red/green range direction, axes, current-price marker, statistics hierarchy, and crosshair interaction are adapted from the user-authorized Sats Signal implementation. Groot owns the wallet-native theme, typography, spacing, and presentation; the standalone logo, deployment, marketing, analytics, and unrelated application code are not imported.

## Consequences

Provider availability can remove the fiat estimate without impairing receiving, sending, signing, sync, or wallet recovery. Supporting another provider, origin, currency, or persisted market cache requires a new boundary review. A future configurable or privacy-routed market transport must preserve the no-wallet-context property.
