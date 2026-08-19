# ADR 0038: remove market data for network privacy

Status: accepted.

## Context

ADR 0036 introduced display-only fiat estimates and a dedicated Market page backed by a fixed third-party HTTPS service. Even without sending wallet identifiers or balances, automatic price requests reveal that a Groot instance is active and expose timing, IP address, and selected currency to infrastructure outside the user's chosen Bitcoin setup. The product now prioritizes avoiding that third-party observation boundary.

## Decision

- Remove the Market route, chart, navigation, settings, fiat preferences, display estimates, caches, fixtures, tests, and translations from the main branch.
- Remove the native ticker, history, and statistics commands and their fixed provider origin so Groot cannot issue price-provider requests at runtime.
- Display wallet amounts only as SATS or BTC derived from integer satoshis.
- Preserve the former implementation on the local `codex/market-reference` branch for historical evaluation only. That branch is not a release source and makes no commitment to restore the feature.
- Any future market-data feature requires a new ADR and an explicit, user-controlled privacy model. It must not silently add a third-party request to startup, wallet unlock, Overview, or Settings.

## Consequences

Groot no longer provides fiat estimates, exchange-rate history, or price statistics. Normal wallet use does not contact a market-data provider. Users who need exchange-rate information obtain it independently, while Groot remains focused on wallet state and the Bitcoin infrastructure the user explicitly configures.
