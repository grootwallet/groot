# ADR 0113: evaluate LocalCoinSwap through isolated public discovery

Status: accepted for local development/research; production discovery and trading remain gated.

Date: 2026-11-07.

[ADR 0121](0121-isolate-the-localcoinswap-account-gateway.md) adds a separate development account gateway. The [current provider decision](../marketplace/provider-decision.md) supersedes the blanket written-permission assumption for LocalCoinSwap. This ADR continues to govern the research route.

## Context

The owner explicitly asked to consider alternatives to Hodl Hodl before committing the product. Rechecking current terms revealed API-use restrictions relevant to a competing marketplace. The alternatives review found public API/custom-interface documentation and nonempty onchain BTC/EUR/SEPA Instant advertisements at LocalCoinSwap. Bisq Easy has no escrow; RoboSats/Mostro require Lightning infrastructure. None establishes an immediately authorized, liquid, frictionless live marketplace.

## Decision

- Make LocalCoinSwap the next partnership candidate, as detailed in the [provider decision](../marketplace/provider-decision.md). This supersedes ADR 0111's initial provider preference and ADR 0112's Hodl Hodl-specific development direction, not their privacy, wallet or production gates. Historical decisions remain intact.
- Keep the synthetic full trade demonstration at `/marketplace`; add separate read-only research at `/marketplace/discover`. Real advertisements cannot enter the simulator's trade reducer. No real order, wallet address, payment instruction or release approval is sent.
- Local research requires a non-native development server explicitly started with `GROOT_MARKETPLACE_DISCOVERY=1`, followed by per-visit user consent. Default development, native builds, production builds and static preview hosting do not activate the relay. Entering any route or editing an amount performs no provider read.
- Use one internally configured provider and a fixed loopback endpoint. Reject caller-selected hosts/providers, redirects, credentials, malformed/oversized bodies, cross-origin/nonlocal requests and excessive concurrency. Explicit refresh only; cancellation and teardown abort in-flight work. Respect rate-limit cooldowns without retries or alternate-provider fallback.
- LocalCoinSwap search omits the user's euro amount; compare it locally against public limits. Its public IP, pair, method and direction disclosure is explicit. No wallet/account/bank data is accessed or persisted.
- Preserve exact advertised prices with bounded decimal integers/ratios. Display cents are presentation only. Unknown fees and eligibility remain visible. Counterparty history is provider-reported data, not verified identity or fraud insurance.
- The portable policy and normalizers remain independent of Svelte, Tauri, wallet state and network I/O. Browser and Node research transports are explicitly separate files; no hosted service, dependency or production network allowlist is introduced. This narrows ADR 0111's directory-wide no-network wording only for local research transport.
- A source link requires a separate confirmed, allowlisted external public-page opening with opener/referrer isolation. It is not contract acceptance or order routing.

## Production and compatibility boundary

Provider permission, jurisdiction/service classification, executable liquidity, current escrow/key/recovery proof, native transport, authoritative transaction review, durable reconciliation, support operations and independent release review remain prerequisites. LocalCoinSwap's secret-based escrow is not an interchangeable standard 2-of-3 wallet policy. No signing/escrow protocol implementation is authorized by this ADR.

No wallet/profile/backup/proposal/registry format or BIP implementation changes. All research state is transient; native wallet behavior, recovery, Mainnet limits and exact-source release authorization remain unchanged.
