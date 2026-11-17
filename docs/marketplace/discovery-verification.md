# Public discovery verification

Date: 7 November 2026. Checkout based on `733bc513d5fe570a1ceb27d8815ed00a4b2a0459`, preserving substantial pre-existing uncommitted 5.3 changes. This record extends the historical [synthetic preview verification](verification.md) and implements [ADR 0113](../adr/0113-evaluate-localcoinswap-through-isolated-public-discovery.md).

## Evidence boundary

LocalCoinSwap is a qualified next provider candidate, not an approved trading integration. The [decision](provider-decision.md) and [alternative investigation](alternative-providers.md) distinguish official documentation and bounded manual public schema reads from executable liquidity, permission and recovery evidence. No account, agreement, provider outreach, order or fiat/bitcoin transaction was created. Browser acceptance uses synthetic intercepted responses and blocks direct provider traffic; screenshot offers are fixtures.

The implementation is read-only local research. Default development, native, production and static preview builds cannot activate the relay. A deliberately enabled non-native development server still requires per-visit user consent before a search. The provider receives its server's public IP, pair, method and direction; the euro amount stays local. No wallet/account/bank data, secret, address or persisted format is involved. No dependencies, lockfiles, native commands or release-source authorizations changed. BIP impact: none.

## Verification

Use pinned Node 24.19.0 and pnpm 11.13.1. This checkout requires `pnpm_config_verify_deps_before_run=false` to prevent pnpm's automatic online dependency refresh; the installed and committed lockfiles match byte-for-byte. Run source edits, SvelteKit sync/build and browser acceptance sequentially: regeneration during a browser run can reset transient state.

| Check                                       | Result                                                                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format`; closing `pnpm format:check`  | Passed                                                                                                                        |
| `pnpm check`                                | Zero errors and warnings                                                                                                      |
| `pnpm test`                                 | 107 files, 1,203 tests passed                                                                                                 |
| Marketplace units, included above           | 100 synthetic policy/adapter, 58 Hodl Hodl parser, 63 LocalCoinSwap parser, 89 discovery/client and 27 development-gate cases |
| `pnpm test:marketplace-transport`           | 24 bounded relay fixture tests passed; also passed inside mandatory validation                                                |
| Discovery browser acceptance                | 34 enabled cases plus two separate default-disabled cases passed, desktop/mobile; no retries                                  |
| Existing synthetic trade browser acceptance | All 42 cases passed, including both themes and FR/ES reviews                                                                  |
| `pnpm build`                                | Static browser build passed after the final mobile spacing correction                                                         |
| Local document links and lockfiles          | Marketplace links resolve; installed/committed Node lockfiles match; no dependency/lockfile change                            |
| `pnpm validate`                             | Attempted after final application changes; stops at the pre-existing reviewed-Mainnet-source mismatch below; **not green**    |

Browser commands used the pinned runtime and isolated `E2E_PORT=5199`. Enabled discovery ran `GROOT_MARKETPLACE_DISCOVERY=1 pnpm test:acceptance e2e/marketplace-discovery.spec.ts`; its two default-mode cases were run separately with discovery off. The synthetic regression ran `pnpm test:acceptance e2e/marketplace.spec.ts` against the default-off server. Browser failures are not hidden by retries. Additional focused runs refreshed screenshot evidence after waiting for exiting dialogs to detach and centering the durable empty/error state; they are not added to the 78 distinct browser cases above.

Mandatory validation passed formatting, scaffolding, architecture/boundaries, relay fixtures, secret surfaces, supply chain, brand, version surfaces, localization and hardware-preflight fixtures. Its release-source guard then reported:

> src-tauri/src/session.rs changed after the mainnet-candidate policy snapshot was reviewed

That Rust file was already modified before this task. This work does not edit it or refresh the reviewed hashes. The guard remains intact. Types, units and build were run independently because validation stops there. No native wallet code changed, and no new hardware or live escrow certification is claimed. Historical host Xcode-license/release-probe limitations remain in the [phase-zero record](verification.md).

## Feedback incorporated

- **Provider choice:** replaced the initial Hodl Hodl preference after checking API-use restrictions. LocalCoinSwap is internally configured; no aggregation or automatic fallback disguises a different provider/trust model.
- **Escrow boundary:** LocalCoinSwap's secret/preimage protocol needs a separate native security and recovery design. Public advertisements never enter the synthetic trade reducer.
- **Exact values:** preserve provider decimal prices as bounded integer ratios; rounded euro cents are display-only. Buy indications round down and sell indications round up. Exclude zero/unsafe satoshi estimates rather than displaying a meaningless amount.
- **Asset and newcomer restrictions:** require exact BTC symbol/slug and token metadata, EUR, SEPA Instant, opposite offer side and recent trader activity. Exclude unsupported fixed-size, phone-verification and prior-feedback restrictions. This does not independently prove chain identity, account or country eligibility.
- **Freshness and cancellation:** editing amount/direction, cancelling, stopping or leaving invalidates pending responses. Source actions recheck expiry at click time, including the final external confirmation; timer refresh alone is insufficient.
- **Bounded transport:** fixed HTTPS origin, no redirects/credential forwarding, same-origin loopback checks, no CORS, 512 KiB response bound, two in-flight requests, eight-second upstream timeout through body completion, and late-response cancellation. No polling or automatic retries.
- **Rate limits:** respect numeric and HTTP-date `Retry-After` values with a bounded 24-hour ceiling, a 60-second relay fallback and the longest concurrent provider deadline. A 600-second response cannot cause another upstream request after only 60 seconds.
- **Truthful display:** provider-reported trade count is not identity or fraud insurance; unknown fees, payment windows, confirmations and terms remain unknown. Rank advertised gross prices without a best-total or net-receipt promise. Deduplicate by provider trader identity.
- **Layout:** inspect 1180×780 and 390×844, both themes, long aliases, source/consent dialogs and French/Spanish flows. First-view captures exposed redundant mobile shell header spacing that partly hid the search button behind navigation; a discovery-only prototype spacing override fixes it. Browser assertions now prove full initial action visibility, navigation clearance and center-point clickability in both layouts/themes and FR/ES. Reuse existing components; no new reusable component was created.
- **Accurate evidence:** discovery's banner says wallet demo rather than claiming public advertisements are dummy data. Fixture screenshots wait for exiting consent dialogs to detach and center durable empty/error states so transient overlays do not obscure the result.

## Review artifacts

Screenshots live outside Git in `outputs/marketplace-discovery/`. These are fixture-backed UX evidence, not live listings or public URLs.

- [Desktop listing, full page](../../outputs/marketplace-discovery/marketplace-discovery-desktop-light-listings-full.png)
- [Desktop first view](../../outputs/marketplace-discovery/marketplace-discovery-desktop-light-first-view.png)
- [Mobile first view](../../outputs/marketplace-discovery/marketplace-discovery-mobile-light-first-view.png)
- [Mobile listings, dark](../../outputs/marketplace-discovery/marketplace-discovery-mobile-dark-listings.png)
- [Mobile privacy confirmation, dark](../../outputs/marketplace-discovery/marketplace-discovery-mobile-dark-privacy-consent.png)
- [Mobile source confirmation](../../outputs/marketplace-discovery/marketplace-discovery-mobile-light-source-confirmation.png)
- [Expired listing](../../outputs/marketplace-discovery/marketplace-discovery-desktop-light-stale-listings.png)
- [Long trader name](../../outputs/marketplace-discovery/marketplace-discovery-mobile-light-long-trader-name.png)
- [Empty result](../../outputs/marketplace-discovery/marketplace-discovery-mobile-light-empty-book.png)
- [Unavailable provider](../../outputs/marketplace-discovery/marketplace-discovery-mobile-light-offline-failure.png)
- [Unverified provider response](../../outputs/marketplace-discovery/marketplace-discovery-mobile-light-malformed-failure.png)
- [French source confirmation](../../outputs/marketplace-discovery/marketplace-discovery-mobile-light-localized-source-fr.png)
- [Spanish source confirmation](../../outputs/marketplace-discovery/marketplace-discovery-mobile-light-localized-source-es.png)

## Running the local research surface

With the repository's pinned runtime and installed dependencies, explicitly start `GROOT_MARKETPLACE_DISCOVERY=1 pnpm exec vite --mode regtest --host 127.0.0.1 --port 5196` and visit `/marketplace/discover`. No search occurs until the user confirms a lookup. Without the flag, the same route explains that access is disabled. Production/native enablement is intentionally unavailable.

## Remaining gates

The [current production gates](production-readiness.md) cover jurisdiction and service scope, executable liquidity and costs, protocol and recovery proof, native transaction review, support and dispute operations, and exact-candidate release evidence. The [account gateway](localcoinswap-api.md) is a separate development feature from this discovery verification.
