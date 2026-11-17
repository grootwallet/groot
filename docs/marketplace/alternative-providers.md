# Marketplace alternatives to Hodl Hodl

Research and bounded public observations: **7 November 2026**. This assessment uses current official documentation and provider statements. No account, contract, payment, provider contact or funded trade was created. An advertised listing is not completed volume, legal distribution permission or an executable quote. Bisq and RoboSats are assessed separately.

## Recommendation

**LocalCoinSwap is the strongest next centralized provider candidate to investigate. It is not an approved production provider.** Its publicly documented search API and explicit invitation to build other interfaces make it a better immediate technical lead than assuming Hodl Hodl permits a competing embedded marketplace. Build a replaceable, read-only LocalCoinSwap discovery adapter and keep real execution off. Do not transfer wallet credentials or escrow keys to either provider or a Groot server.

This is a qualified recommendation about the next engineering experiment. It is not a conclusion that LocalCoinSwap has better liquidity, lower costs, a safer dispute process or permission to distribute its services in France/EU. Those questions can independently disqualify it. If they do, preserve the provider-neutral UI rather than building Groot escrow to rescue the integration.

| Option        | Technical and product fit                                                                                                                                    | Decision for this increment                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| LocalCoinSwap | Onchain BTC; current public search specification; provider-owned accounts and disputes; native execution would require distinct escrow secrets and recovery. | Lead read-only adapter candidate; qualify rights, countries, liquidity and full costs before a pilot.                  |
| Peach         | Bitcoin-first mobile UX, public API documentation, but current escrow suspension and EU distribution restrictions undermine the assumed product.             | Do not use as the France/EU MVP execution foundation now.                                                              |
| Vexl          | Private social-network introductions and chat; no transaction or escrow mechanism supplied by the app.                                                       | Useful model for a future local/community product, a different experience from the proposed bank-transfer marketplace. |
| NoOnes        | Extensive API documentation persists, but its own notice announces marketplace closure.                                                                      | Reject as a new integration.                                                                                           |
| Pocket        | Wallet integration precedent and direct-to-wallet bank purchases, with a service provider executing the purchase.                                            | A separate broker/on-ramp option if the product requirement changes; does not fulfil direct peer trading.              |
| BitValve      | Public P2P/escrow product; no supported integration contract or public API specification established here.                                                   | No justified adapter implementation yet.                                                                               |

## LocalCoinSwap: why it leads, and what could disqualify it

The [official protocol repository](https://github.com/LocalCoinSwap/LocalCoinSwap) describes separate blockchain, API and application layers and explicitly encourages other interfaces on its API. That is positive integration evidence, with stronger relevance than a third-party exchange directory. It does not replace current contractual permission for Groot's precise distribution and business model.

The current [Exchange API v2 specification](https://localcoinswap.com/openapi.json) documents public `GET /api/v2/offers/search/`, BTC/EUR and buy/sell/payment filters, optional authentication, bounded pagination and key scopes. `last_seen=30mins` is documented. Search has no documented amount filter. Its list uses `results`, UUIDs, nested currencies/method/trader records, decimal fiat limits and a computed `price_formula_value`; exact price precision exceeds cents. The same schema identifies trader feedback as stars out of five and `minimum_feedback` as a percentage requirement. `automatic_cancel_time` is a response deadline, not a confirmed fiat payment window. Trading and wallet operations require additional authority. **Implementation consequence:** retain exact price arithmetic, filter amounts locally and leave unavailable fees, terms, payment windows and confirmations unknown.

The [current terms](https://localcoinswap.com/terms-of-service) identify TechHouse Ltd and Saint Kitts and Nevis law. They reserve identity-document requests, including during disputes, and the ability to apply or withhold escrow signatures. Accounts are for their owner's use; acting for third parties and facilitating unlicensed services are restricted. Content access is limited to approved purposes, and other distribution/derivative uses are restricted. **Assessment:** get written partner/distribution and data-use confirmation; the developer invitation is insufficient to resolve every production use. This research has not established MiCA authorization or France/EU distribution eligibility. Provider self-description as software or non-custodial infrastructure does not determine Groot's classification.

The [official Bitcoin escrow reference](https://github.com/LocalCoinSwap/bitcoin-trading-scripts) describes buyer/seller secrets and hashed script branches, including dispute release/return secrets. It is not interchangeable with Groot's existing standard multisig account. **Implementation consequence:** do not re-use a generic 2-of-3 release workflow, accept server-built scripts blindly or import provider account mnemonics into the webview. Embedded execution requires a separate native protocol/recovery design and independent verification against the current production contract. Public discovery needs none of those secrets.

### Bounded public observations

One initial metadata page was capped by the server at 100 methods; one bounded S-section page then established the exact pair:

- **SEPA Instant:** `sepa-instant`.
- **Ordinary SEPA transfer:** `sepa-transfer`.

The [public metadata endpoint](https://api.localcoinswap.com/api/v2/offers/payment-methods/?limit=100&offset=200) is evidence of those identifiers at the observation time. Do not treat them as a permanent enum without tests and future revalidation.

Two five-result public reads were made: a broad BTC/EUR sell search to verify the current shape, then a [BTC/EUR/SEPA Instant search restricted to recently seen traders](https://api.localcoinswap.com/api/v2/offers/search/?coin_currency=BTC&fiat_currency=EUR&trading_type=sell&payment_method=sepa-instant&last_seen=30mins&limit=5&offset=0). The latter returned five records and a provider-wide count of 299. Those five included a €50 minimum and several €100 minima. Some maximum limits were implausibly large and exceeded safe integer cents. No buyer-side depth, eligibility, acceptance, final fees or fills were measured. The advertised count therefore supplies **no verified executable-liquidity target**. Reject unsafe numerical rows rather than copying them into a trusted quote.

The live price field contained values such as `74934.91572087927` EUR/BTC. Preserve that rational value for comparisons and indicative gross sats; a rounded cent display cannot own accounting. The live feedback field contained `5.00000`, reinforcing the five-star schema rather than the misleading percentage-looking example elsewhere in the same specification. Do not display it as a completion percentage.

Provider pagination emitted an `http://` next-page URL despite the HTTPS request. The adapter does not follow or return such links. All queries use a fixed HTTPS origin and validated local pagination. The public website's current route manifest identifies offer review as `/trade/[slug]/[uuid]`; source links are built from validated fields and confirmed externally. Merely opening that review page must not become a Groot order-acceptance operation.

These are point-in-time interface observations. Raw trader identifiers and aliases are intentionally omitted from committed fixtures and this report. Tests use invented records.

## Peach: appealing UX, unresolved current trading model

Peach's [31 August 2026 founder announcement](https://peachbitcoin.com/blog/peach-at-a-crossroads/) says it paused its escrow role during regulatory reassessment. Seller access is restricted to verified or sufficiently experienced users; dispute help remains, but Peach no longer supplies its escrow signature. That changes the actual protection offered to a new buyer. A polished wallet integration cannot silently restore it.

The [current terms page](https://peachbitcoin.com/terms-and-conditions/) says Peach is not actively offered or marketed in the EU/EEA and describes access restrictions; the website also frames EU/EEA access as the user's exclusive initiative. **Assessment:** a Groot France/EU integration cannot assume that distributing the marketplace inside the wallet respects that boundary. Its older escrow explanations conflict with the later suspension announcement; resolve the current contract and distribution model before selecting it.

[Public API documentation](https://docs.peachbitcoin.com/) exists and separates public data from authenticated user operations. Its escrow examples are technical documentation, not proof that the earlier trading model remains supported or that a third party may distribute it. Peach is worth learning from for guided trade steps, payment method setup and obvious next actions; it is presently a weak default execution dependency for this launch assumption.

## Vexl: a different answer to trust and liquidity

[Vexl's official product flow](https://vexl.it/) connects friends and friends of friends, supports offer discovery and private chat, then leaves users to arrange the exchange. Its [terms](https://vexl.it/terms-privacy) explicitly say it provides no Bitcoin transaction instruments or trade confirmation. They describe phone verification and contact onboarding, including device-held account keys and loss/recovery limitations. **Assessment:** do not call it a drop-in global offer book or remove those privacy/recovery costs from the user journey. A SEPA payment still exposes account information to banks and counterparties.

The [current source repository](https://github.com/vexl-it/vexl) is GPL-3.0 and contains the app/platform implementation. Open source does not establish permission to use its hosted service as an embedded Groot marketplace, and code reuse needs a license assessment against Groot's Apache-2.0 scope. No public partner integration contract or comparable EUR/SEPA executable-depth evidence was established here.

A Groot community-meetup product could borrow the product idea of trading within a trust network, while remaining a separately scoped project with new contact, messaging, abuse and dispute decisions. It would start with a liquidity cold start and cannot supply the currently desired simple remote bank-transfer flow by itself.

## Other options checked

**NoOnes:** its [official wind-down notice](https://help.noones.com/portal/en/kb/articles/an-important-update-noones-is-winding-down) says the marketplace closed on 21 August 2026 and the platform moved to withdrawals only. Its still-accessible [developer documentation](https://dev.noones.com/documentation/noones-api) and status page do not override that operational announcement. Reject it as a new integration instead of mistaking a working documentation site for a working marketplace.

**Pocket:** the [official terms](https://pocketbitcoin.com/legal/terms-of-service) describe executing purchases after bank funds arrive, with the rate determined at that point through a partner exchange. The [official integration history](https://pocketbitcoin.com/blog) includes BitBox and Coldcard support. **Assessment:** this is a credible example of streamlined direct-to-wallet acquisition, but changes the counterparty and product model. It does not satisfy direct user-to-user trading or establish anonymous bank payments. No comparable sell-side peer book is supplied by this evidence.

**BitValve:** the [official product site](https://www.bitvalve.com/) advertises P2P offers, chat and escrow. This investigation did not establish a current supported third-party API, API redistribution rights, Bitcoin key-control/recovery specification or amount-specific EUR/SEPA Instant evidence. Keep it outside implementation until those gaps are closed; do not manufacture an adapter from an undocumented private endpoint.

## What to build and measure next

The read-only experiment needs only an exact-money parser, a fixed-origin search URL builder, explicit provider selection in the development configuration, bounded transport and the existing consent/discovery UI. Keep one provider visible per search. Do not merge providers into a Groot matching book or imply a best all-in price when fees and eligibility are unknown. No production-native network origin is added by this research.

Before choosing a live partner, obtain the exact entity/permission and country evidence, the permitted data-use/integration model, current account onboarding, complete fee and price semantics, and proof that €50/€100/€250 newcomer trades can actually complete with sufficient independent counterparties. Set accepted price/concentration and operational targets before measuring; listing counts alone do not pass them. Any funded test needs an eligible account, explicit funds budget and native security/recovery review. No such test is authorized by a parser test or performed here.

Keep the three decisions separate: selecting a provider to investigate, authorizing its production distribution, and authorizing real wallet/escrow operations. Choosing LocalCoinSwap for the first decision does not grant the latter two. A provider-neutral adapter seam gives Groot an exit when rights, economics, service continuity or recovery fail.

**Compatibility/BIP assessment:** this investigation and the read-only parser/URL builder change no persisted wallet/profile/backup/proposal/registry format, derivation, descriptor, PSBT, signing or protocol dependency. BIP impact is **none**. Real LocalCoinSwap escrow integration would need a new interoperability and compatibility assessment; it is not established by Groot's existing Bitcoin standards support.
