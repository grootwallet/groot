# Hodl Hodl integration research

Accessed **2026-11-07**. This note separates published documentation, read-only live observations, and recommendations. No account was created, trader contacted, contract opened, or funds moved.

## Recommendation

Use Hodl Hodl as the first **candidate** liquidity provider behind a replaceable marketplace interface. Start with optional EUR/SEPA Instant discovery and an explicit provider handoff. Build the complete buy/sell journey with deterministic demonstration trades for UX review. Do not claim live in-app execution until the API inconsistencies below are resolved and the complete recovery/dispute journey is proven. Do not start by operating Groot escrow: that adds security, arbitration, legal, and liquidity responsibilities before demand is established.

This recommendation is an engineering/product judgment, not a claim that Hodl Hodl has the most liquidity. Public listings cannot establish completed trading volume or executable depth.

## Verified API capabilities and blockers

The [official API documentation](https://hodlhodl.com/api/docs) documents:

- Public countries, currencies, payment methods, offer lists/details; authenticated contracts and offer management.
- Bearer API keys lasting one year. Per-contract release-address overrides require a separate HMAC signature key and increasing timestamp nonce.
- Website disputes/feedback and website-created payment passwords. However, newer sections introduce device escrow-key registration/backup confirmation and contract-specific `signer_mode`, contradicting older restrictions. The release-address restriction also conflicts with the signed override endpoint.
- Offer/payment-instruction versions plus `create_request_key` for identical-payload contract retries.
- Polling guidance: 1–3 minutes awaiting escrow, 1–5 minutes awaiting deposit. New sections mention contract WebSocket events, without a complete public subscription contract. No webhook specification was found.

**Unverified:** partner approval, redistribution/commercial rights, approved branding/deep links, production rate limits, OAuth/account creation, device challenge signing specification, and full embedded dispute support. Documentation is not a partner agreement or sandbox certification. Obtain written answers and contract tests before enabling mutations.

## Escrow and Groot's trust boundary

Hodl Hodl describes a unique 2-of-3 escrow per trade, with buyer, seller, and platform keys. The platform alone cannot release funds. Its traditional client creates/encrypts user keys in the browser, while the platform stores the encrypted material. Seller release follows seller confirmation of fiat receipt. See the [official help](https://hodlhodl.com/pages/help) and [FAQ](https://hodlhodl.com/pages/faq).

For Groot, all key generation, decryption, script verification, release/refund transaction inspection, and signing must live in Rust. A JavaScript integration example is not permission to move Groot signing into the webview. Keep marketplace escrow credentials separate from wallet credentials and never send a wallet xpub merely to browse offers. A hosted Groot service must never receive user signing material. A platform co-signature plus a user signature can still authorize a disputed payout: non-custodial does not mean arbitration-free or recovery-guaranteed.

The API's linked [multisig specification](https://gitlab.com/hodlhodl-public/public_docs/blob/master/multisig_spec.md) redirected to GitLab sign-in during research. Recoverability and offline cooperative spending therefore remain explicit integration questions, rather than assumed guarantees.

## Sandbox and price model

The main site links [hhtestnet.com](https://hhtestnet.com/) as its practice environment. [Testnet API documentation](https://hhtestnet.com/api/docs) exists. Its exact Bitcoin network, operational support, feature parity, faucet, and dispute simulation were not verified.

Hodl Hodl supports fixed offer prices or an exchange rate with relative/absolute deviation. In mathematical form, those modes are `P = R × (1 ± d/100)` or `P = R ± d`. The documented helper is `GET /api/v1/offers/exchange_rate_price`; provider availability must be queried rather than copied from examples. Groot should consume the provider's executable offer price and show one total plus explicit fees, rather than expose rate-provider and deviation controls to ordinary takers. A reference rate is contextual, never a substitute for the counterparty's actual quote. [Testnet pricing documentation](https://hhtestnet.com/api/docs#fetching-tied-to-exchange-price-value)

## Terms, fees, and privacy

The [terms effective 4 June 2026](https://accounts.hodlhodl.com/terms-of-service) restrict users under 18 and citizens, permanent/tax residents, or people located in the United States and listed restricted territories; screening must cover more than current IP location. They prohibit facilitating unlicensed exchange services and reserve mandatory verification. Standard trading fee is 0.75%, discounted to 0.5% for qualifying referrals; a dynamic minimum and network fees also apply. Minimum contract size is 25,000 sats. Do not hard-code a final fee from this summary: obtain the contract breakdown. Support says it reviews disputes within 12 hours, which is not a settlement guarantee; in-person disputes are excluded.

The [privacy policy](https://accounts.hodlhodl.com/privacy-policy), also effective 4 June 2026, describes account/transaction/technical information collection, sanctions/fraud processing, and five-year retention after account closure. Bank payments reveal information to banks and counterparties. Groot must avoid an absolute anonymity or permanent no-ID promise. Provider terms do not establish Groot's own regulatory status.

## Read-only live observations

Public unauthenticated requests succeeded on 2026-11-07. [Payment-method metadata](https://hodlhodl.com/api/v1/payment_methods) returned `9081` for SEPA Instant and `4` for ordinary SEPA. A read-only HEAD of a public `/offers/:id` link returned HTTP 200 with `X-Frame-Options: SAMEORIGIN` and `Content-Security-Policy: frame-ancestors 'self'`; embedding the website in a Groot iframe is therefore not a supported shortcut.

The query shape was:

```text
GET https://hodlhodl.com/api/v1/offers
  ?pagination[limit]=100
  &filters[currency_code]=EUR
  &filters[side]=sell
  &filters[payment_method_id]=9081
  &filters[only_working_now]=true
```

Provider `sell` offers serve Groot buyers; provider `buy` offers serve Groot sellers.

| Payment method | Provider side | Returned offers | Onchain BTC offers | Unique traders across returned offers |
| -------------- | ------------- | --------------: | -----------------: | ------------------------------------: |
| SEPA Instant   | sell          |              16 |                 16 |                                     8 |
| SEPA Instant   | buy           |              46 |                 44 |                                    36 |
| SEPA           | sell          |               4 |                  4 |                                     3 |
| SEPA           | buy           |              34 |                 33 |                                    26 |

These are one-time advertised counts, include global listings, and are not guarantees that a particular user/amount can trade. Some results were ARK rather than onchain BTC. The general unfiltered response also contained `searchable:false` offers. A production adapter must enforce `asset_code=BTC`, `asset_layer=BTC`, EUR, `searchable=true`, `working_now=true`, eligible payment method, and amount bounds locally.

Observed values use decimal strings: `price` is EUR per BTC, fiat limits are EUR major units, satoshi limits are integer strings, and fee rates are fractions. Buy offers expose `payment_methods`; sell offers expose `payment_method_instructions`. Trader ratings and timing fields may be null. Public list responses do not establish the current user's final fee or net receipt. Parse money exactly, bound inputs, sanitize trader text, and treat discovery as indicative until an authoritative contract quote is available. [Live offer endpoint](https://hodlhodl.com/api/v1/offers)

## Integration precedent and acceptance gates

Trezor integrated Hodl Hodl previously. Its [official support response in December 2024](https://forum.trezor.io/t/trezor-suite-and-hodlhodl/20374) says P2P trading was discontinued to focus on services users utilized most. This supports technical precedent, not current availability or adoption success; it strengthens the case for measuring completed trades and repeat use before expanding.

Before a live release:

1. Resolve provider permissions, contradictory APIs, network support, and supported account onboarding.
2. Prove fresh receive-address assignment with permanent labels, exact contract-price binding, expired/changed offers, retries without duplicate contracts, and no fee/rate fallback.
3. Rehearse restart, canceled/underfunded escrow, delayed fiat, disputed release/refund, credential recovery, provider outage, and loss of a device.
4. Complete native script/transaction verification, security review, jurisdiction-specific legal review, and provider test-environment end-to-end evidence.
5. Measure amount-specific match rate, net spread/fees, time to match/fund/release, completion rate, disputes, repeat traders, and top-counterparty concentration. Add currencies only when the first corridor meets defined liquidity and operational targets.

**Compatibility/BIP assessment:** this research changes no persisted wallet/profile/backup/proposal/registry format, runtime API, dependency, signing path, or BIP support. Any future escrow implementation requires separate standards analysis; existing Groot multisig support does not certify this provider's nested-SegWit escrow format.
