# Marketplace discovery: next development increment

Decision date: **7 November 2026**. This is a local engineering and UX proof, not a trading launch, a legal opinion or provider approval. [ADR 0112](../adr/0112-local-marketplace-discovery-research.md) narrowed the development scope; [ADR 0113](../adr/0113-evaluate-localcoinswap-through-isolated-public-discovery.md) and the [provider decision](provider-decision.md) now select LocalCoinSwap as the next candidate. The [original plan](plan.md) and its production gates remain applicable.

## Recommendation and acceptance criterion

Build the smallest useful step beyond the synthetic trade journey: an optional **public-offer discovery** surface for EUR, SEPA Instant and onchain bitcoin. Keep the existing simulation separate. A discovery result is an advertisement observed at a time, with an indicative amount and incomplete costs; it is never a reserved or executable quote.

The acceptance criterion is that a person can understand the search, privacy boundary, available advertisements and provider transition without supplying wallet or account information. They can stop discovery, correct an amount, retry a visible failure and inspect a source offer without accidentally accepting a trade.

Implement a development-only transport seam and test it against intercepted responses. **LocalCoinSwap is the current candidate.** `GROOT_MARKETPLACE_DISCOVERY=1` enables the local development capability; the normal flag stays off. The Vite-defined `__GROOT_MARKETPLACE_DISCOVERY__` is true only for a non-native development `serve` with that flag; a production build has no enabled relay. A successful fixture test establishes implementation behavior only. The [alternative-provider investigation](alternative-providers.md) records bounded manual public reads for schema verification; no recurring sampling, provider contact or live trading occurs.

## Provider rights are unresolved

LocalCoinSwap's [official protocol repository](https://github.com/LocalCoinSwap/LocalCoinSwap) invites other interfaces on its API, and its [current API specification](https://localcoinswap.com/openapi.json) documents unauthenticated public offer search. Its [current terms](https://localcoinswap.com/terms-of-service) still limit content use to approved purposes and restrict distribution and third-party account operation. **Assessment:** it is a stronger technical candidate, while the exact production integration and distribution rights remain to be confirmed. Neither public data access nor a working adapter grants launch permission.

The earlier Hodl Hodl direction was reconsidered because its [terms, section 7.2](https://accounts.hodlhodl.com/terms-of-service) restrict competing-product and data uses. Its public endpoint documentation establishes technical access rather than an exception. Keep the existing strict parser available for research, without treating it as the current launch choice or silently contacting it as a fallback. General user-directed viewing of a public offer page is a separate website action and supplies no API permission.

The data adapter and fixture-backed UX can be built and reviewed now. Keep API-dependent commercial integration, redistribution, periodic liquidity collection and provider endorsement claims gated. This is narrower than treating every read-only investigation as a regulated trading service, and more precise than treating a public endpoint as permission to distribute a marketplace.

## Product scope

- **One corridor:** EUR and SEPA Instant; existing offers only. EUR amounts stay within the current €50–250 research UI range. That range is a product constraint, not an exemption from any rule.
- **Two intentions:** a Groot buyer discovers provider sell offers; a Groot seller discovers provider buy offers. Show euros and indicative gross sats using exact integer arithmetic. Provider and network fees remain explicitly unknown; do not reuse the simulator's fee assumptions.
- **Honest availability:** explain the bounded first-page search, observation time, missing eligibility checks and provider availability. No inventory means no inventory. Unavailable, rate-limited, expired and malformed responses have inline status and deliberate retry.
- **Neutral display:** do not label an advertisement “best,” “safe,” guaranteed or executable. An incomplete price comparison cannot establish a recommendation or net proceeds. Reputation is provider-reported history, not identity or fraud insurance.
- **Source inspection:** “View source offer” first opens an existing Groot confirmation dialog identifying `localcoinswap.com`. The confirmed action opens the exact allowlisted public offer URL in an external browser context with opener/referrer isolation. It does not prefill acceptance, transmit an order, claim provider eligibility or create a Groot trade. The provider can request an account and apply its own terms.
- **Exit:** stopping discovery, switching modes and leaving the route abort pending work, clear transient results and revoke that visit's consent. No timer or background observer refreshes the market.

Do not add account linking, provider credentials, referral tags, affiliate compensation, maker offers, market orders, bank entry, payment confirmation, escrow, release, refund, disputes, notifications, price feeds or wallet balance/address access to this discovery increment.

## Privacy and data flow

Before the first search in each visit, state what an enabled live request would share. Suggested disclosure:

> A live search contacts LocalCoinSwap through this local development server. LocalCoinSwap receives the server's public IP address, EUR, bitcoin, SEPA Instant and your buy or sell choice. The euro amount is filtered locally and is not sent to the provider. Groot sends no wallet balance, address, history, keys or bank details. Opening a source offer connects your browser to LocalCoinSwap under its own terms and privacy policy.

This describes the implementation's intended request contents, not all observations the provider can make. For a local server, the outbound IP is usually the user's network; a remote development host uses its own outbound network. Do not promise that a relay anonymises the user or that stopping requests removes the provider's earlier records. Changing providers requires matching transport, parsing, origin allowlisting and disclosure changes together.

The browser sends a bounded search to the same-origin local development endpoint `/__groot_marketplace/offers`. The relay constructs a fixed HTTPS public-offers request and forwards only the required query and ordinary transport headers. It does not forward cookies, bearer headers, browser identity, referrer, wallet context or arbitrary incoming headers. Incoming credentials are never forwarded. Response and error handling must not echo arbitrary provider content or log search amounts, aliases, identifiers or response bodies. Consent acknowledges this data flow; it grants no provider integration rights.

No consent, search, advertisement or source URL is persisted in wallet files, local storage or a trade ledger. The feature uses no Groot-hosted service. Hosting this relay later is a new service/repository decision, with its own data roles and operational review.

## Boundaries and failure handling

```text
Browser discovery UI, explicit visit consent and current search
  → discovery client: cancellation, freshness, sanitized errors
  → local Vite development endpoint, available only when explicitly enabled
  → fixed https://api.localcoinswap.com/api/v2/offers/search/
  → bounded JSON validation and portable public-offer normalizer
  → indicative advertisements

WalletPort → Rust → wallet/signing authority (no discovery dependency)
```

Keep portable arithmetic/normalization policy dependency-free. `packages/marketplace/discovery.ts` owns the browser discovery boundary; `discovery-server.mjs` is Node-only bounded relay code and `scripts/dev/marketplace-discovery.ts` installs it only in the explicitly enabled development server. These local transport modules narrow ADR 0111's earlier directory-wide no-network rule; `core.ts`, `hodlhodl.ts` and `localcoinswap.ts` remain pure. Keep HTTP orchestration outside route markup. No provider SDK, HTML rendering, third-party script, native command, production CSP origin or new dependency is required.

The relay accepts only its documented same-origin GET search with validated intent and integer cents. It has no caller-selected upstream host, path, headers or pagination. Bound response bytes, page size, timeout and concurrent requests; reject redirects and non-JSON success bodies. It must not become an open proxy when a development server is reachable from another origin. Treat cancellation and rate limiting explicitly, without automatic retries or fallback providers. A superseded response must not replace the current search, and leaving the route must cancel both browser and upstream work where possible.

The browser client must also send the fixed non-simple `X-Groot-Marketplace-Request: 1` marker. Reject missing, malformed or duplicate markers before any provider fetch, including simple image/form requests without Fetch Metadata. Cross-origin preflight is denied and the marker is not forwarded. This is CSRF defense, not authentication or cryptographic proof of consent. The safe `dev:marketplace` rehearsal launcher forces the whole relay off and hides its navigation path; public research remains separately enabled.

The LocalCoinSwap normalizer independently enforces native BTC currency/token metadata, EUR, the exact payment method, provider-side inversion, active/recent trader state and exact fiat bounds. It rejects unsafe numbers and unsupported fixed-size restrictions, and preserves phone and minimum-feedback requirements. Exact advertised price units/scale own sorting and gross-satoshi arithmetic; rounded cents are display-only. No API account context exists to establish eligibility. Search does not supply authoritative terms, confirmations or a fiat payment window; leave them unknown. Filter invalid or ambiguous offer identities. Build external URLs solely from validated offer UUIDs/slugs and the fixed provider origin, never from remote HTML or caller-selected URLs.

## Feedback loop and verification

1. Unit-test decimal parsing, gross-satoshi rounding, side inversion, first-trade/experience restrictions, stale observations, invalid identities and URL allowlisting.
2. Test the relay with an injected upstream: disabled feature, malformed/duplicate parameters, wrong method/origin, credentials not forwarded, redirect, timeout, disconnect, non-JSON, oversized body, rate limit and concurrency. Assert that no actual provider HTTP request is needed.
3. Test the browser with intercepted local responses: no request before consent; both search directions; changed amount; empty/malformed/unavailable/rate-limited result; stale response suppression; cancellation/stop/navigation; explicit source confirmation; and no provider request after withdrawal. Verify that discovery never enters the synthetic payment/release reducer.
4. Inspect desktop **1180×780** and mobile **390×844**, light/dark and EN/FR/ES, using existing reusable components and keyboard-safe bottom spacing. Capture consent, result, empty/failure and source-confirmation screens. Mark screenshots as fixture-backed discovery, not live liquidity evidence.
5. Run formatting, focused checks and mandatory `pnpm validate`. Retain existing reviewed-source and release guards and report unrelated failures accurately.

Review actual local fixtures and screenshots before widening the scope. A liquidity experiment is still useful after rights are resolved: amount-specific depth, unique counterparties, restrictions, advertised versus actual costs and completed-trade conversion. The existing fourteen-day sampling proposal is a later gated activity, not work silently introduced by this increment.

## Provider permission request draft — not sent

> We are evaluating an optional EUR/SEPA Instant discovery feature inside Groot, an onchain wallet. We propose displaying only your public native bitcoin offer advertisements, attributed to LocalCoinSwap, and opening an exact public offer page after user confirmation. We would not create orders, hold accounts or credentials, co-sign escrow, collect payment details, combine competing books or claim a partnership. Your public developer documentation invites other interfaces; please confirm written integration, approved content/data use, redistribution, rate-limit, branding, country-eligibility and data-role requirements for this exact product. Please identify the contracting entity and appropriate permission process. Any future sampled-liquidity study or execution integration would be agreed separately.

No provider message has been sent, and this draft grants no rights. The owner can use it when ready; provider communication needs explicit authorization.

## Compatibility and production gates

No persisted wallet, profile, backup, proposal or registry format changes; no migration or discard plan is needed. Search and consent state are transient. BIP impact: **none**; no derivation, descriptor, PSBT, signing, chain monitoring or protocol dependency changes. Mainnet wallet permissions, native release authorization and recovery behavior remain unchanged.

Production provider-backed discovery still requires the exact service/country classification, provider entity/permission evidence, privacy/security and supported native transport reviews in the original plan. A real provider-owned trade requires its additional account, contract, fees, recovery and support evidence. Groot-operated escrow remains a separate deferred business and security decision. No approval or certification is inferred from this local proof.
