# ADR 0112: local marketplace discovery research

Status: accepted for local development and fixture-backed verification only; live provider integration and production operation remain gated.

Provider choice and the Hodl Hodl-specific discovery direction are superseded by [ADR 0113](0113-evaluate-localcoinswap-through-isolated-public-discovery.md). The historical body below is retained.

Date: 2026-11-07.

Supersedes ADR 0111 only where its future-discovery transport and directory-wide no-network requirements would prevent a browser-only local development proof. ADR 0111 remains unchanged as historical evidence; its production, wallet, provider and escrow boundaries remain applicable.

## Context

The owner requested continued autonomous development after reviewing the marketplace design preview. The next useful question is whether real public-offer discovery can have an understandable experience without inheriting account, escrow and settlement responsibilities. That can be tested with a bounded development transport and intercepted provider-shaped responses.

ADR 0038 prohibits incidental market requests and requires an explicit privacy decision. ADR 0111 recommends a provider-owned pilot but adds no provider permission or production authorization. The official API documents unauthenticated public offer reads; provider API terms separately restrict competing-product and data use. No research exemption, partnership or right to distribute a competing marketplace has been established. The [discovery plan](../marketplace/discovery-plan.md) records the primary sources, unresolved permission question and an unsent request draft.

## Decision

- Build a separate browser discovery mode for EUR, SEPA Instant and onchain BTC advertisements. Keep the synthetic trade journey explicitly separate. Public discovery has no order acceptance, execution, payment or escrow state.
- Add a local Vite development relay at `/__groot_marketplace/offers`, behind `GROOT_MARKETPLACE_DISCOVERY=1`, off by default. `__GROOT_MARKETPLACE_DISCOVERY__` is true only for non-native development `serve` with that flag. Its upstream is a fixed public offers endpoint with bounded GET queries, no authentication, no forwarded browser credentials, no redirects, finite response/time/page/concurrency limits and deliberate retry only. It is not included as an enabled production or native service.
- Verify the transport/UI with injected or intercepted fixtures. This increment needs no new live API call, automated liquidity collection or provider contact. Resolving API permission is required before activating provider-backed product discovery; technical endpoint access does not settle that question.
- Require explicit consent for each discovery visit before a search could leave the browser. Disclose the development server's public IP exposure and EUR, method, intention and amount query. Consent grants no provider rights. Send no wallet state, bank information or credentials. No discovery request occurs at startup, unlock, Overview, Settings or merely opening the marketplace route. The default disabled control explains that provider permission remains unresolved.
- Cancel pending work and discard transient results/consent when discovery stops, modes change or the route is destroyed. Do not poll, persist search history or silently call another provider. Keep stale, unavailable, empty and rate-limited outcomes visible.
- Label advertisements and gross amounts as indicative. Exact fees, net receipt, counterparty eligibility and executable availability remain unverified. Neither price sorting nor reputation establishes a suitable or safe counterparty.
- Permit a user-confirmed **View source offer** action to the exact validated `https://hodlhodl.com/offers/:id` public page in an external browser context. Isolate opener/referrer and explain that provider terms and data handling then apply. This action supplies information; it does not route an order, reserve an offer, prefill acceptance, create a Groot trade or establish API permission.
- Keep pure provider normalization and arithmetic portable, HTTP outside the route, and all discovery behavior independent from `WalletPort`, Tauri, Rust signing, wallet storage and the synthetic settlement reducer. `packages/marketplace/discovery-server.mjs` and `scripts/dev/marketplace-discovery.ts` are development-only transport modules; `core.ts` and `hodlhodl.ts` remain pure. Compose existing reusable UI components.

This narrowly changes the development architecture recommended in ADR 0111. A local loopback relay is not the proposed production native transport, a Groot-hosted service or evidence of jurisdictional eligibility. Native command/CSP/release changes, provider credentials, reference feeds, affiliate routing, funding and escrow remain outside this decision.

## Compatibility and BIP impact

No wallet/profile/backup/proposal/registry format change, migration, dependency update, native capability, production network allowlist or wallet operation. Consent/search/results are transient. Existing data remains compatible. BIP impact: **none**. No new escrow format, transaction or interoperability claim is made; existing Mainnet release and source-review authorizations are unchanged.

## Consequences

The owner can review privacy consent, provider-shaped advertisements, failure states and source inspection with deterministic evidence. Screenshots and tests must say fixture-backed development discovery. They do not prove executable liquidity or live provider behavior.

Production provider-backed discovery retains the original plan's provider permission, service/country classification, privacy/security and native transport gates. Real trade, durability, recovery, signing and operations need separate decisions and evidence. A future hosted service belongs in a separately scoped repository under ADR 0080. The base wallet remains usable and recoverable without this add-on.
