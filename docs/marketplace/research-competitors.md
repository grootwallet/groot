# P2P marketplace competitor research

Evidence checked **7 November 2026**. Sources below are the projects' own documentation, code, announcements and public interfaces. No accounts were created, counterparts contacted, credentials entered or trades executed. Public listing observations are snapshots, not proof of executable liquidity, trading volume, safety or legal eligibility.

## Recommendation from the comparison

Use Hodl Hodl as the first **candidate partner**, conditional on an actual EUR/payment-method liquidity study, provider agreement and legal review. Start with opt-in discovery and a clearly identified provider handoff. Its onchain marketplace and API fit Groot better than adding Lightning bonds, a new reputation economy or a new escrow operator. A complete native trading integration is a later decision: the present API leaves onboarding and disputes on the provider website. See [Hodl Hodl integration research](research-hodlhodl.md).

This does **not** establish that Hodl Hodl has the most liquidity. We found no comparable, independently verified current executed-volume dataset covering all five services. The meaningful measure is the user's chance of completing a particular amount, currency, payment method and jurisdiction at an acceptable total price.

## Correct the starting assumptions

**Peach has not announced the alleged liquidity-driven closure in the evidence reviewed.** Its founder's 31 August 2026 letter attributes a paused escrow model to regulatory reassessment. Peach says it is temporarily operating without its escrow signature; new sellers must meet KYC or trading-history conditions, and qualifying sellers without KYC can have only one concurrent trade. The stated fee remains 2%. This is a warning about operator classification and changing controls, not evidence that attractive UX solves compliance. [Official founder letter](https://peachbitcoin.com/blog/peach-at-a-crossroads/).

**RoboSats is not established as a failed platform.** Official releases include September 2026 development. August's release removed three coordinators, which supports concern about individual operator availability and fragmentation, not a claim that the entire market closed. [Official releases](https://github.com/RoboSats/robosats/releases/).

## What the interfaces actually show

### Hodl Hodl: useful liquidity is much narrower than its headline offer count

The public home page displayed **70 EUR buy-side offers** with all methods. The following public filters were then checked in the browser. Selecting **On-chain** retained the same four €100 results.

| User intent                                         | Listed offers | Distinct sellers | Displayed best markup | Concentration                        |
| --------------------------------------------------- | ------------: | ---------------: | --------------------: | ------------------------------------ |
| Buy €100, EUR, SEPA Instant, onchain, all countries |             4 |                2 |               +13.99% | One seller supplied 3 of 4 listings  |
| Buy €500, EUR, SEPA Instant, onchain, all countries |            12 |                6 |                +5.89% | One seller supplied 7 of 12 listings |

These were displayed provider markups against each offer's chosen reference exchange, not calculated all-in costs or a common benchmark. Availability, account restrictions and terms were not tested. Different exchange references also mean the displayed percentage alone is not a reliable comparison. [€100 public filtered market](https://hodlhodl.com/offers/buy?filters%5Bcurrency_code%5D=EUR&filters%5Bvalue%5D=100&filters%5Bpayment_method_name%5D=SEPA%20%28EU%29%20Instant&filters%5Basset_layer%5D=btc), [€500 public filtered market](https://hodlhodl.com/offers/buy?filters%5Bcurrency_code%5D=EUR&filters%5Bvalue%5D=500&filters%5Bpayment_method_name%5D=SEPA%20%28EU%29%20Instant&filters%5Basset_layer%5D=btc).

The table foregrounds seller reputation, price, range, payment methods and arbitrary offer text. Users must scan several technical filters and compare multiple exchange references. Groot should present one amount input, one eligible payment rail and one recommended eligible offer, with transparent alternatives and terms. Do not turn a high-priced but available offer into a claim of a good deal.

Hodl Hodl's March 2026 fee article says onchain users individually pay **0.75% standard / 0.5% referral**, plus network costs and a dynamic minimum. Its final platform-plus-network cost becomes known only after funding. Older summaries quoting 0.6% total should not be reused. Inference: Groot cannot honestly promise an exact final receipt amount from a listing alone; a pre-funding estimate and later final review must be distinguishable. [Current fee explanation](https://hodlhodl.com/blog/en/fees).

### Peach: approachable product, but changing trust and operator model

The public EUR orderbook was accessible and displayed sell offers. It repeats seller/amount combinations across payment-method rows, so row counts must be deduplicated before treating them as liquidity. The top banner explicitly announces changed escrow conditions. The web app requested pairing with a Peach mobile app; it explains that keys stay on the phone. No pairing occurred. [Public orderbook](https://peachbitcoin.com/p2p-orderbook/), [Web app](https://web.peachbitcoin.com/).

Peach's published API covers searching offers, matching, contracts and PSBT-related refund operations. Search includes currency/payment rail, premium and reputation. Buyer creation documents address-control message signing. These interfaces demonstrate real integration material, but documentation containing historical escrow paths cannot establish that those paths remain authorized under today's operator model. Inference: require current written integration scope, protocol/version evidence and legal availability before selecting it. [API reference](https://docs.peachbitcoin.com/).

### RoboSats: privacy-oriented, with substantial Lightning prerequisites

The public mirror exposes a dense offer table including expiry, payment timer, bond and premium. Its own access guide labels clearnet access unsuitable for private trading. Only the public mirror was inspected; no robot token was generated or recovered. [Access documentation](https://learn.robosats.org/docs/access/).

Its documented journey is: generate and save a robot token, lock a maker or taker bond, seller locks the trade amount, buyer supplies a payout invoice, exchange fiat instructions in private chat, confirm fiat, settle payout, return compliant parties' bonds. This eliminates conventional account reputation but creates a Lightning liquidity and recovery burden before trading. Groot currently has no Lightning implementation. [Trade pipeline](https://learn.robosats.org/docs/trade-pipeline/), [Groot implementation status](../implementation-status.md).

The published total platform fee is **0.2%**, split **0.025% maker / 0.175% taker**; Lightning routing and optional onchain payout/swap charges are additional. Its dispute guide directs support to a public SimpleX group. Inference: the strong lesson is short-lived identities and explicit commitment, while Groot should improve discoverability of authenticated dispute support and avoid sending sensitive evidence to public support channels. [Fees](https://learn.robosats.org/docs/fees/), [Disputes](https://learn.robosats.org/docs/disputes/).

A documented API includes orderbook, historical contracts/volume, current coordinator information and ticks. That makes a future adapter plausible, but coordinator-specific data is not automatically a whole-network or audited-volume measure. During public UI inspection the mirror's loading/results state changed, so no current volume number is asserted here. [API](https://learn.robosats.org/docs/api/).

### Bisq Easy: remove buyer deposits by explicitly changing the trust model

Bisq Easy uses seller reputation rather than an escrow deposit. Buyers can begin without existing bitcoin. Its guide offers a wizard for amount/payment methods, ranked offers, a review and a chat-based trade. It documents roughly **$6–$600 equivalent** trades, zero platform trade fees and seller-paid delivery network fees; a seller's reputation can impose a lower cap. Mediation helps but does not provide an escrow guarantee. Inference: a simple first purchase is achievable, but the trade-off must remain visible rather than presenting reputation as insured settlement. [Bisq Easy guide](https://bisq.wiki/Bisq_Easy), [Reputation](https://bisq.wiki/Reputation).

Bisq 2 publishes a local application REST API, with Swagger and profile, quote, settings and payment-account endpoints. This is not evidence of a hosted white-label marketplace API. A Groot adapter would need a maintained Bisq application/node relationship, authentication and tested trade coverage. The repository is AGPL-3.0, so code reuse needs a license assessment. [API usage](https://github.com/bisq-network/bisq2/blob/main/api/usage.md), [Repository](https://github.com/bisq-network/bisq2).

### Bisq 1: learn from security boundaries as well as marketplace UX

Bisq 1's security protocol and fee/deposit lifecycle differ from Bisq Easy. Do not combine their claims into a single product description. Its trading-cost documentation identifies multiple onchain transactions, explaining why small onchain trades can be disproportionately expensive. [Trading costs](https://bisq.wiki/Trading_costs).

The official May 2026 incident report attributes an attack to insufficient validation by honest peers of messages from a modified client; it affected active altcoin trades, not Bisq Easy or passively stored wallet funds. The later official update reports reimbursement. Inference for Groot: the marketplace and every remote counterparty are hostile inputs; the trusted wallet must independently check transaction amounts, outputs, script policy, fees and authorization. Do not optimize away a review or spend boundary simply to remove a screen. [Post-mortem](https://bisq.network/blog/security-incident-post-mortem/), [June update](https://bisq.network/blog/where-bisq-stands-after-security-incident/).

### Vexl: matching people rather than operating escrow

Vexl's journey starts with contacts, discovers friends/friends-of-friends offers, opens anonymous chat, then lets users agree and trade. Its terms expressly say it does not facilitate or observe Bitcoin settlement. Phone verification and the social-graph requirement are substantial onboarding/privacy choices, even without conventional identity-document verification. Global executed-volume claims are especially inappropriate for an operator that does not observe trades. [Product walkthrough](https://vexl.it/), [Terms and privacy](https://vexl.it/terms-privacy).

The reviewed first-party material did not establish a supported public integration API or an escrow service. Open source is available, but that alone does not authorize access to a user's social offers or imply an integration agreement. Inference: learn its human trust cues and optional identity revelation; do not make a user's contact upload a prerequisite for Groot's first trading experiment. [Source repository](https://github.com/vexl-it/vexl).

## Decisions this evidence supports

1. **Launch one corridor, not a global exchange.** EUR plus one eligible instant bank-transfer rail is a reasonable research hypothesis, contingent on target jurisdictions and the provider's actual available counterparties. Currency is not jurisdiction, and an instant rail is not proof that fiat cannot be recalled.
2. **A single quote means one all-in offer, not one forced market price.** Let sellers compete economically; hide feed/premium configuration from ordinary takers. Show the fiat paid and net sats received, quoted fees, price age, funding estimate and exact point at which terms bind. A mandatory uniform price risks losing makers or creating an implicit Groot subsidy/dealer role.
3. **Do not begin with a new Groot escrow.** It adds protocol, recovery, dispute operations and potential regulatory obligations before demonstrating that sufficient makers exist. It does not create liquidity.
4. **Measure availability and concentration.** Sample both buy/sell sides at €100/€250/€500 over time; deduplicate sellers and overlapping offers. Track qualifying offers, total cost, acceptance, completion, cancellation, time-to-funding/payment/release and disputes. Public counts cannot replace a consented, legally cleared real pilot.
5. **Make no-match useful.** Explain that the chosen amount/payment rail currently has no suitable offer; allow amount adjustment or explicit return to the provider. Never silently widen countries/payment methods, fabricate a rate or imply guaranteed execution.
6. **Keep core-wallet privacy intact.** [ADR 0038](../adr/0038-remove-market-data-for-network-privacy.md) requires a new decision and explicit user-controlled privacy model before reintroducing market-data requests. Marketplace opt-in must not cause startup, unlock or Overview price requests, nor transmit wallet balances, descriptors or labels.
7. **Treat payment confirmation as a consequential act.** Buyers report sending fiat; sellers confirm receipt from their own bank. Screenshots, chat statements and buyer buttons are not bank settlement proofs. Preserve in-app help and an active-trade resume path, including pending, delayed, disputed and provider-unavailable states.

## Screenshot evidence

These relative links resolve to untracked local review artifacts under `outputs/marketplace/`; binaries will not render on GitHub. They show real public competitor surfaces, not authenticated trading or Groot implementation. No QR pairing token, credential or payment evidence was captured.

- [Hodl Hodl broad EUR buy listing](../../outputs/marketplace/groot-marketplace-hodlhodl-offers.png)
- [Hodl Hodl €100, SEPA Instant, onchain](../../outputs/marketplace/groot-marketplace-hodlhodl-eur100-sepa-onchain.png)
- [Hodl Hodl €500, SEPA Instant, onchain](../../outputs/marketplace/groot-marketplace-hodlhodl-eur500-sepa-onchain.png)
- [Peach public EUR orderbook](../../outputs/marketplace/groot-marketplace-peach-orderbook.png)
- [RoboSats public mirror offer table](../../outputs/marketplace/groot-marketplace-robosats-offers.png)

## Evidence limits and compatibility

No production integration, account eligibility, jurisdictional permission, contract creation, escrow recovery, counterparty funding or dispute outcome was tested. Some Bisq wiki pages intermittently timed out; no unverified fee percentages were supplied for Bisq 1. Provider statements are attributed claims, not independent certifications. Recheck live terms and current API behavior before implementation or launch.

This research note changes no runtime, wallet/profile/backup/proposal/registry format, dependency or BIP support. Existing data remains compatible. **BIP impact: none.** Formatting/reference verification and the parent change's mandatory `pnpm validate` remain handoff requirements; this note provides no new wallet or release-certification evidence.
