# ADR 0111: optional marketplace preview and provider-first pilot

Status: accepted for a local design preview and investigation; live integration and service operation remain gated.

Partially superseded: [ADR 0112](0112-local-marketplace-discovery-research.md) narrows the development transport boundary, and [ADR 0113](0113-evaluate-localcoinswap-through-isolated-public-discovery.md) replaces the initial provider preference with LocalCoinSwap diligence. [ADR 0114](0114-durable-marketplace-sandbox-service.md) adds a separate durable sandbox service without activating live trading. The historical decision below remains intact; its wallet, escrow and production gates still apply.

Date: 2026-11-07.

## Context

The owner requested an optional fiat/bitcoin peer marketplace, competitor/API research, a challenged implementation plan and reviewable flows. ADR 0038 removed automatic third-party market requests for privacy. ADR 0080 leaves optional hosted-service ownership and licensing to a separate decision. Neither a wallet's existing multisig support nor a provider's public API authorizes operating escrow.

## Decision

- Add a browser-prototype-only Trade bitcoin experience composed from existing components. Synthetic quotes, counterparties, reputation and settlement remain conspicuously labelled. Native execution is unavailable.
- Isolate dependency-free marketplace policy/public provider normalization in `packages/marketplace/`, with no wallet, network, persistence, Svelte or Tauri dependency. Extract service code to a separate repository before implementing a hosted system.
- Recommend conditional EUR/SEPA Instant/onchain Hodl Hodl discovery and explicit provider-owned handoff as the first live candidate. No assumption of liquidity leadership, anonymous trading, guaranteed costs or legal exemption is accepted.
- Defer Groot-operated escrow, maker pricing, multiple currencies/methods, aggregation and provider-key onboarding. The full embedded preview is a target experience, not evidence that the provider API supports every screen.
- Preserve ADR 0038's no-incidental-request rule. This change sends no provider or pricing requests. Any future live discovery needs explicit per-feature privacy consent and bounded native transport. Startup/unlock/Overview/Settings never trigger market requests.
- Never treat a buyer payment claim, screenshot, deadline or support message as bank receipt or release authorization. Live escrow funding/release must preserve native exact-transaction review and verification. Refund requests remain pending until their outcome is proven.

The [plan](../marketplace/plan.md) defines the required legal/provider/liquidity/security/recovery gates. Provider API availability and a successful browser test are not production readiness.

## Compatibility and BIP impact

No wallet/profile/backup/proposal/registry format changes, migrations, dependencies, network allowlists or native commands. The prototype is transient and resets when its route is destroyed; users are told this. It does not touch wallet state. BIP impact: **none**. A future durable trading format needs a separate compatibility decision before implementation, and any breaking wallet change requires explicit migration-versus-discard approval.

## Consequences

The owner can review complete flows and failure states now without accounts or real funds. A live handoff has additional friction and remains unbuilt pending its gates. Full embedded execution requires provider proof and native key/recovery work. Existing public-release authorizations and Mainnet limits are not extended.
