# Portable marketplace boundary

This directory is ready to extract into a separately owned marketplace repository once live integration is authorized. It is not a package-manager workspace or a hosted service. Pure policy/normalizers are separate from optional local-development transports; no dependencies were added.

- `core.ts`: integer fiat/satoshi arithmetic and bounded **preview-only** lifecycle policy. It has no event authentication, persistence or signing authority; do not use it as a live escrow engine.
- `hodlhodl.ts`: strict read-only public-response normalization and fixed-origin URL building. It does not fetch, authenticate, create contracts or promise executable prices/net receipts.
- `public-offer.ts`, `localcoinswap.ts`: provider-neutral DTO and strict LocalCoinSwap public advertisements, with exact decimal price ratios and bounded identifiers. Neither fetches or signs.
- `discovery.ts`: bounded same-origin browser client and comparison policy. LocalCoinSwap is the explicit product default; no polling, provider aggregation or fallback occurs.
- `discovery-server.mjs`: Node-only loopback research relay, installed by `scripts/dev/marketplace-discovery.ts` only in an explicitly enabled non-native development server. It never ships as a hosted or native API. Requests, body size, timeout, concurrency, redirects, origins and cancellation are bounded; credentials are never forwarded.
- Tests: `src/lib/marketplace/*.test.ts` in the existing Vitest harness.
- UI composition: `src/routes/marketplace/+page.svelte`, using existing Groot components and a route-scoped synthetic adapter.
- Safe rehearsal: `src/lib/marketplace/rehearsal.ts` prepares six owned-fixture exercises through the existing adapter/reducer, with an explicit clock and fresh frozen state. `pnpm dev:marketplace` forces public discovery off for manual testing; the [testing guide](../../docs/marketplace/testing-guide.md) covers complete journeys and resets.
- Separate public research: `src/routes/marketplace/discover/+page.svelte`, with per-visit privacy confirmation and unknown-fee/eligibility disclosures. Advertisements never enter the simulator.
- Relay fixtures: `pnpm test:marketplace-transport`; development gating and comparison/client tests run in the existing Vitest harness.

The optional browser relay requires `X-Groot-Marketplace-Request: 1` in addition to its loopback/origin checks. This non-simple marker prevents unconsented simple image/form requests and is never forwarded upstream; it is not authentication or proof of a human consent action. Cross-origin preflights remain denied.

See [the provider decision](../../docs/marketplace/provider-decision.md), [delivery plan](../../docs/marketplace/plan.md) and ADRs 0111–0113. Research transport defaults off; native/production/static preview builds cannot activate it. No bank/account/trade integration, wallet access, new persisted format or remote repository is introduced. The base wallet retains sole authority over keys and transactions behind `WalletPort`/Rust.
