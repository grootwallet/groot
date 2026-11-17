# RoboSats and Mostro alternatives

Research checked **2026-11-07**, using official project documentation, source and release pages. This is a provider comparison, not certification of a live integration. No account, order, payment, bond, escrow or private key was created; no counterparties were contacted. No live liquidity sampling was performed.

## Recommendation for Groot

Keep both projects in the comparison, but **do not choose either as the first two-way onchain EUR/SEPA Instant integration**. Both settle their core fiat trade through Lightning. RoboSats adds an optional onchain buyer payout, while still requiring Lightning bonds and seller escrow. Mostro's newer onchain asset support describes a Lightning-to-onchain swap market, rather than a direct fiat-to-onchain escrow. The mismatch adds wallet setup, swaps, fees and recovery work to Groot's deliberately onchain product. This is a product/engineering judgment based on the mechanisms below, not a claim that either project failed or has no liquidity.

Mostro is the more interesting future protocol experiment if Groot separately decides to support Lightning or an explicitly external Lightning wallet. Its open client protocol and operator choice deserve a sandbox proof. Neither removes operator trust, legal analysis or the need to measure executable EUR inventory.

| Question                                      | RoboSats                                                                                                              | Mostro                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Discovery/integration                         | Public REST order book and coordinator information; authenticated order lifecycle                                     | Signed Nostr order events plus encrypted client/node messages                                          |
| Buy directly into Groot onchain               | Optional buyer onchain payout, subject to coordinator availability and additional fees; Lightning bond still required | Core fiat buy pays a Lightning invoice; direct fiat-to-onchain payout not established by reviewed docs |
| Sell Groot onchain bitcoin directly           | Core seller escrow requires paying a Lightning hold invoice                                                           | Core seller escrow requires paying a Lightning hold invoice                                            |
| Initial bitcoin requirement                   | Both parties need a Lightning bond                                                                                    | Buyer bond depends on node policy; seller needs Lightning trade funds                                  |
| Dispute authority                             | Selected coordinator; documentation includes custody during disputes                                                  | Selected node administrator or designated solver                                                       |
| Source license inspected                      | AGPL version 3                                                                                                        | GPL version 3                                                                                          |
| Current executable EUR/SEPA Instant liquidity | Not established                                                                                                       | Not established                                                                                        |

## RoboSats: capabilities and friction

The official [REST API documentation](https://learn.robosats.org/docs/api/) identifies API v0 as beta and warns integrators to budget ongoing maintenance. It describes public `GET /api/book/` and `GET /api/info/`, order state/actions, token authentication, PGP-signed payout instructions and dispute actions. The [current source routes](https://github.com/RoboSats/robosats/blob/main/api/urls.py) confirm the book, info, order, schema and federation endpoints. The API documentation's illustrated limits and fees must not be substituted for the chosen coordinator's current values.

Both maker and taker lock [Lightning fidelity bonds](https://learn.robosats.org/docs/bonds/): the documented default is 3%, with maker-selectable 2–15%. The guide explicitly says the bondless-taker option is unavailable. For a buyer with no bitcoin, this creates a bootstrap problem before the first purchase; funding that bond on the user's behalf would be a separate commercial and abuse-control design.

The [onchain payout flow](https://learn.robosats.org/docs/on-chain-payouts/) becomes available after the taker bond is locked. Buyers supply a Bitcoin address and mining fee rate; the payout adds a swap fee to trading/mining fees. Its documented indicative swap-fee range is 1–10%, not a current quote or guarantee. The [fee guide](https://learn.robosats.org/docs/fees/) documents a 0.2% total platform fee split between maker and taker and explains when relative pricing becomes fixed. A Groot taker screen could hide maker pricing controls, but it cannot hide the actual bond, payout costs or quote-binding step.

[Seller escrow](https://learn.robosats.org/docs/escrow/) uses a Lightning hold invoice. The coordinator can settle or cancel the held payment; after seller confirmation it collects funds and attempts buyer payout. This is a coordinator-controlled settlement window, not an onchain 2-of-3 script independently verified by Groot. The API's dispute description states that opening a dispute settles bonds and escrow into coordinator custody. Seller confirmation must still mean actual bank receipt.

[Robot identities](https://learn.robosats.org/docs/robots/) are token-based and the project recommends a fresh identity per trade. That favors unlinkability but weakens a product built around persistent counterparty reputation; Groot would need to explain the chosen assurance model. The [dispute guide](https://learn.robosats.org/docs/disputes/) also directs users to external support and warns against impersonators. Seamless integrated support cannot be assumed from the order API.

The [source license](https://github.com/RoboSats/robosats/blob/main/LICENSE) is AGPL v3. Reusing or hosting modified project code requires a specific license review; publishing an independent API client and operating a coordinator are different decisions. A public endpoint and a source license do not establish branding, service-level, commercial redistribution or operator-support rights. Those remain unverified for Groot.

The [release page](https://github.com/RoboSats/robosats/releases/) currently shows `v0.8.7-alpha` (`017de9a`), new coordinators and ongoing security/maintenance work. This contradicts treating RoboSats as an abandoned platform. Coordinator additions/removals also mean discovery and recovery must bind to a specific operator, rather than a generic federation name.

## Mostro: stronger protocol openness, different wallet model

Mostro publishes a [client protocol](https://mostro.network/protocol/). The current specification uses Nostr order events (`38383`), instance information, ratings and health events. It documents the incompatible v1/v2 transport migration; from node v0.19.0, v2 NIP-44 direct messages are the only supported transport. A client must discover node capabilities, verify event signatures, handle replay/order freshness and avoid sending private trade messages to an incompatible node. The [release page](https://github.com/MostroP2P/mostro/releases) currently shows `v0.20.1`.

In the [documented fiat flow](https://mostro.network/docs-english/how-it-works.html), the buyer provides a Lightning invoice and the seller pays the node's hold invoice. The [hold-invoice explanation](https://mostro.network/docs-english/hold-invoice.html) explicitly describes custody between collection from the seller and payment to the buyer, including a replacement-invoice path if payout fails. Nostr removes a single messaging intermediary; it does not eliminate the selected node's settlement authority or failure risk.

[Anti-abuse bonds](https://mostro.network/docs-english/anti-abuse-bond.html) are optional per node. Operators choose whether makers, takers or both must post one and set the amount. This can reduce a new buyer's bootstrap friction compared with RoboSats, but the client must surface the actual node policy before taking an order. A no-bond node does not solve Groot's onchain seller-funding mismatch.

The newer [Bitcoin-on-other-networks specification](https://mostro.network/protocol/bitcoin_networks.html) includes `BTC` for onchain Bitcoin alongside Liquid and Rootstock assets. These are traded **against Lightning sats**. Treating this as native EUR-to-onchain settlement would be incorrect. Combining a fiat trade and a swap would introduce two separately priced/settled operations and additional counterparties; it requires its own failure and recovery design.

The [reputation model](https://mostro.network/docs-english/reputation.html) combines completed trades and ratings. Newer [reputation transfer](https://mostro.network/protocol/reputation_transfer.html) allows attestations from supported Mostro nodes or lnp2pBot, subject to issuer trust, identity proof and advertised capabilities. Import is not universal, and full-privacy identities cannot use identity-bound reputation. This tradeoff should be a deliberate product choice.

[Dispute resolution](https://mostro.network/docs-english/disputes.html) belongs to the selected administrator or solver. The project explicitly says there is no standard procedure across nodes; evidence requirements differ. A Groot-operated node would therefore bring operating, evidence-handling, payout and arbitration responsibilities. The [daemon source](https://github.com/MostroP2P/mostro/blob/main/LICENSE) is GPL v3; each proposed client/library must have its own license checked before reuse. Protocol documentation does not establish a hosted node's commercial integration agreement or regulatory status.

## Liquidity evidence and what remains unproven

The official [RoboSats statistics page](https://robosats.org/stats/) was reachable, but the fetched document exposed no current totals. Its API documents coordinator-reported public-book and historical-volume fields; these require a timestamped, operator-aware observation, not copying sample values. No claim about current EUR depth or completed volume can be made from this review.

Mostro links [bestiario](https://mostro.world/), whose published methodology says browsers verify publisher-signed statistics received from Nostr. It distinguishes absent, inferred and failed-proof values. The fetched document requires JavaScript for actual figures, so no current numeric result was verified here. Signatures establish who published data, not independent proof of completed fiat settlement. The separate [network status page](https://status.mostro.network/) verifies health events; availability is not trading liquidity.

Before ranking either candidate, run the same consented EUR/SEPA Instant experiment at €50, €100 and €250 in both directions: eligible distinct counterparties, amount coverage, binding net receipt, bond/bootstrap cost, concentration, response time, completed settlement and support recovery. Keep coordinator/node identity in the measurement. Do not aggregate unavailable operators or Lightning-only offers into Groot's onchain inventory.

## Compatibility and scope

This research adds no adapter, network request, dependency, native command, account or persisted format. Wallet/profile/backup/proposal/registry compatibility is unchanged. **BIP impact: none.** Lightning support, provider signing and onchain swaps remain unimplemented and require separate architecture/security decisions before any product promise.
