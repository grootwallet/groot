# Bisq integration assessment

Checked 7 November 2026 against official documentation and Bisq 2 release-tag `v2.1.15` source. This is a read-only feasibility assessment: no node was installed, account paired, offer accepted, or payment sent. Current EUR liquidity was not measured.

## Recommendation

**Reject Bisq as the primary integration for Groot's proposed symmetric, escrow-backed €50–250 buy/sell MVP.** Keep Bisq Easy as a credible later **buy-first, reputation-backed** option if the user explicitly accepts its different risk model. Keep Bisq 1 as a separate expert integration. Neither is a drop-in hosted orderbook API with Groot's proposed escrow UX.

This is a product-fit decision, not a claim that Bisq has failed. Its current development is active: Bisq 2.1.15 was published on 5 November and adds mobile API improvements; Android Bisq Easy 0.17.0 followed on 6 November. The former also announces a network update deadline of 25 November. Production adapters would need capability/version checks and an update procedure. [Bisq 2 release](https://github.com/bisq-network/bisq2/releases/tag/v2.1.15), [Android release](https://github.com/bisq-network/bisq-mobile/releases/tag/anode_0.17.0).

## The three products are different

| Surface            | Security and settlement                                                                                                                           | Groot fit                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Bisq 1             | Buyer and seller fund deposits; bitcoin settles through multisignature escrow. Its local daemon exposes gRPC trading and wallet operations.       | Supports onchain buy/sell but introduces a second wallet/runtime, funding requirements and recovery work. Weak first-bitcoin onboarding. |
| Bisq 2 / Bisq Easy | Buyer pays fiat first; seller subsequently sends bitcoin. Seller reputation substitutes for trade deposits; there is no bitcoin escrow to unlock. | Straightforward first purchase is possible. A new user cannot immediately become an eligible seller without sufficient reputation.       |
| Bisq Connect       | A thin mobile client controlling a user's own or trusted Bisq 2 node.                                                                             | Evidence that an embedded client is feasible. It supplies neither a new liquidity pool nor an escrow protocol.                           |

Bisq 1's official site describes the 2-of-2 model; its gRPC reference covers offer taking, bank-payment confirmations and withdrawal, and warns about sharing default data/ports between GUI and daemon. They must never be launched casually against an existing user profile. [Bisq 1](https://bisq.network/), [daemon reference](https://bisq-network.github.io/slate/).

Bisq Easy has no trade fees or security deposits. Sellers still pay the cost of sending bitcoin; absence of protocol trade fees does not mean a zero-premium or zero-cost purchase. Its wiki explicitly describes novice buyers and experienced sellers, and offers mediation rather than a funded escrow guarantee. [Bisq Easy protocol](https://bisq.wiki/Bisq_Easy).

## Bisq Easy's decisive tradeoff

The released specification requires seller reputation proportional to trade value: 200 points per USD, with defined conversion/rounding and tolerance rules. Creating a sell offer needs at least 1,200 points; supported trade sizes are bounded by the equivalent of USD 6–600 and the seller's reputation. EUR values are converted through BTC/USD, so a hard-coded euro reputation threshold is incorrect. The buyer node rechecks the seller on taking an offer; a buyer who created an offer also checks a seller taking it. Zero reputation does not cover a positive required score. [Released reputation rule](https://github.com/bisq-network/bisq2/blob/v2.1.15/docs/specifications/trade/bisq-easy-seller-reputation-limit.md).

Consequently, Groot could simplify buying from established Bisq sellers, but must not promise instant selling for every new Groot user. A reputation badge is a risk signal, not deposit insurance. A fiat-payment acknowledgement cannot authorize an escrow release because Easy has no such escrow.

## Exact integration surface

Bisq 2 has a real local node API, rather than a public exchange account API. Released source exposes the following resources under `/api/v1`:

| Operation                                      | Resource                            |
| ---------------------------------------------- | ----------------------------------- |
| Discover EUR offers                            | `GET /offerbook/markets/EUR/offers` |
| Read supported node capabilities/version       | `GET /info`                         |
| Read version-specific reputation/amount policy | `GET /config/trade-amount-limits`   |
| Take an offer                                  | `POST /trades`                      |
| Advance a specific trade                       | `PATCH /trades/{tradeId}/event`     |
| Request mediation                              | `POST /trades/{tradeId}/mediation`  |

The orderbook returns raw offer specifications plus presentation metadata and an advisory `hasSellerSufficientReputation`; the node checks again during acceptance. Offer acceptance is a state-changing commitment and belongs after review, never in discovery. [Orderbook resource](https://github.com/bisq-network/bisq2/blob/v2.1.15/api/src/main/java/bisq/api/rest_api/endpoints/offers/OfferbookRestApi.java), [configuration resource](https://github.com/bisq-network/bisq2/blob/v2.1.15/api/src/main/java/bisq/api/rest_api/endpoints/config/ConfigRestApi.java).

The acceptance request carries the offer ID, integer base/quote amounts and selected bitcoin/fiat payment methods. **Fiat integers use four decimal places in Bisq's monetary model, not Groot's cents.** Explicit checked conversion is required. The selected bitcoin rail must be `MAIN_CHAIN`; Lightning support is unnecessary for this candidate. [Acceptance DTO](https://github.com/bisq-network/bisq2/blob/v2.1.15/api/src/main/java/bisq/api/rest_api/endpoints/trades/TakeOfferRequest.java), [Fiat representation](https://github.com/bisq-network/bisq2/blob/v2.1.15/common/src/main/java/bisq/common/monetary/Fiat.java), [bitcoin rails](https://github.com/bisq-network/bisq2/blob/v2.1.15/account/src/main/java/bisq/account/payment_method/BitcoinPaymentRail.java).

Easy uses an external bitcoin wallet: the buyer supplies an address and the seller pays it. Groot could allocate a permanently labelled receive address through `WalletPort`; a seller would review and sign the exact payment in Groot after personally verifying bank receipt. The API's onchain seller-sent event requires a transaction ID. Groot would independently verify transaction amount, destination and confirmations; a supplied ID or chat claim is insufficient. [Payment-data specification](https://github.com/bisq-network/bisq2/blob/v2.1.15/docs/specifications/trade/bisq-easy-bitcoin-payment-data.md), [trade events](https://github.com/bisq-network/bisq2/blob/v2.1.15/api/src/main/java/bisq/api/rest_api/endpoints/trades/TradeRestApi.java).

## Hosting, mobile and privacy

The headless node is available as a Docker deployment with persistent identity/trade state. Its shipped configuration uses Tor and WebSocket-only API transport by default; REST can be configured, and the API supports REST-over-WebSocket. This is an operational service with backups and supervision, not a stateless HTTP proxy. [Released deployment guide](https://github.com/bisq-network/bisq2/blob/v2.1.15/apps/api-app/docker/README.md), [API configuration](https://github.com/bisq-network/bisq2/blob/v2.1.15/apps/api-app/src/main/resources/api_app.conf).

Official mobile architecture offers a complete Android node and thin clients for Android/iOS. A trusted-node operator holds the trading data, identity and reputation. iOS distribution through TestFlight also deserves a separate distribution review before treating this as proof of App Store acceptance for Groot. [Official mobile architecture](https://bisq.network/blog/mobile-apps-completed/).

For Groot, prefer a user-owned node if this option proceeds. A Groot-operated node would make Groot a trusted holder of trading metadata and require demonstrated per-user isolation. The Connect guide explicitly says there is no independent administrator profile and cautions shared operators against using their own trading profile. Pairing grants trade control, so credentials must stay in the native boundary, with certificate pinning or explicit Tor routing and no telemetry. [Connect pairing and limitations](https://github.com/bisq-network/bisq-mobile/wiki/How-to-use-Bisq-Connect).

The released API architecture documents separate session authentication and permissions. Its WebSocket authorization caveat must be reconciled with actual released behavior before relying on read-only or per-user permission scopes. This is a required integration review, not a validated vulnerability claim. [Released API architecture](https://github.com/bisq-network/bisq2/blob/v2.1.15/api/architecture.md).

## Liquidity evidence and unresolved rights

No current, independently verifiable count of eligible Bisq Easy EUR/SEPA Instant offers at €50, €100 or €250 was obtained. The public Bisq Markets project describes data exported by the Bisq stats node; it is not proof of Easy's available counterparties or small-ticket fill times. Browser access to its live API was unavailable during this assessment. Do not convert that missing observation into either “no liquidity” or “enough liquidity.” [Markets implementation](https://github.com/bisq-network/bisq-markets).

A qualifying study would run an isolated, read-only Bisq 2 observer, record seven days of EUR/mainchain/SEPA Instant availability, deduplicate seller identities and apply actual amount/reputation limits. Measure availability, prices, seller concentration and outages; no accounts, trades, or personal payment data are needed for that observation. Actual acceptance/fill time still needs a separately authorized pilot.

Bisq 2 and Bisq Mobile are AGPL-3.0 projects. Reusing or modifying their code requires an explicit license-compliance plan; Groot's Apache-2.0 repository must not absorb copied implementation under an assumed permissive grant. A separate protocol client communicating with an independently deployed node is an architecture option for legal review, not an automatic exemption. No white-label brand grant, hosted API SLA or Groot-specific integration agreement was established. Name/logo use and operating-law obligations remain separate from source availability. [Bisq 2 license notice](https://github.com/bisq-network/bisq2#license), [Bisq Mobile license](https://github.com/bisq-network/bisq-mobile).

Bisq 1's May 2026 exploit is relevant due diligence: the official post-mortem says altcoin trades were affected, fiat trades had account-signing protection, and Bisq 2/Easy were unaffected. It does not justify attributing that exploit to Easy or claiming that fiat risk is zero. [Official post-mortem](https://bisq.network/blog/security-incident-post-mortem/).

MuSig source exists, but that does not establish a released, supported mobile/API integration or current liquidity. The project's 2026 update describes it as upcoming; this assessment makes no MVP commitment to it. [Official transition update](https://bisq.network/blog/where-bisq-stands-after-security-incident/).

## Decision gate

Proceed with Bisq only if the product intentionally changes to a buy-first reputation model, user-owned/trusted-node setup is acceptable, observed EUR depth passes, and license/security/distribution review is complete. Otherwise select an onchain escrow provider that explicitly supports third-party interfaces and symmetric buyer/seller onboarding.

No wallet/profile/backup/proposal/registry format is changed by this assessment. BIP impact: **none**. Future live receive/send integration would require the normal native transaction, permanent-label, privacy and release gates.
