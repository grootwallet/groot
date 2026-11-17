# Groot marketplace: recommendation and delivery plan

Decision date: 7 November 2026. Research is a point-in-time investigation, not legal advice, audited trading volume or provider approval. Read the [provider investigation](research-hodlhodl.md), [competitor/UI evidence](research-competitors.md) and [regulatory assessment](research-regulatory.md).

The [current provider decision](provider-decision.md) supersedes this plan's handoff-first recommendation and LocalCoinSwap permission assumption. See the [gateway contract](localcoinswap-api.md) for implemented scope and [production readiness](production-readiness.md) for current launch gates.

## Recommendation

Build an optional **Trade bitcoin** add-on. Start with **EUR, onchain bitcoin, SEPA Instant, taking existing offers and one active trade**. Prioritize **LocalCoinSwap as the next provider partnership candidate**, subject to permission, legal, liquidity, security and recovery gates. Keep the wallet fully usable without the add-on. The [provider decision](provider-decision.md) supersedes the initial Hodl Hodl preference after the owner requested alternatives and its API-use restrictions were checked.

The first live candidate is native discovery followed by an explicit external-provider handoff. It is conditional on provider approval, jurisdiction/service classification, consumer disclosures and actual executable liquidity. LocalCoinSwap explicitly documents custom interfaces and a public search API, but those facts do not establish Groot's production authorization or market depth. Its secret-based Bitcoin escrow requires its own native protocol review; it is not a generic 2-of-3 drop-in. Hodl Hodl remains a possible negotiated partner, with written API-use permission required. Do not call a website handoff a fully embedded trade.

Do not start operating Groot escrow. Its ability to co-sign and adjudicate is a separate financial service, security system and staffed business. A polished release button cannot establish fiat finality or remove that responsibility. No KYC-free, anonymous or guaranteed-settlement claim is justified. A counterparty's bank generally sees the user's name and bank details; a provider can require identity verification.

**Implemented scope:** a browser-only synthetic buy/sell design preview plus a separate, explicitly enabled local-development public-listing research flow for LocalCoinSwap. Portable policy and strict provider normalizers remain separate from bounded browser/Node transports. Public discovery requires per-visit consent and never feeds a real advertisement into the synthetic trade state machine. The development flag defaults off, is forced off for native/production builds, and adds no hosted service. No account, bank connection, wallet read, escrow key or live trade mutation is implemented. This is phase 0 plus a discovery proof, not a live marketplace launch.

## The assumptions that did not survive research

| Assumption                               | Observed evidence                                                                                                                                                                                                                                                       | Product consequence                                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Hodl Hodl has the most liquidity         | No comparable executed-volume evidence. In a public onchain EUR/SEPA Instant snapshot, €100 returned four rows from two sellers, starting at +13.99% displayed markup; €500 returned twelve rows from six sellers. These are listings, before full costs or fill proof. | Validate depth by amount, direction and unique trader. A large general offer count is insufficient.                              |
| Peach is closing for lack of volume      | Its founder describes a regulatory reassessment and temporary escrow-free operation, with restricted sellers. This is not proof of a liquidity-driven closure.                                                                                                          | Avoid reproducing its escrow/legal dependency before classification.                                                             |
| RoboSats failed                          | Maintained releases and active coordinators contradict that claim. Its Lightning hold-invoice/bond design also differs from Groot's onchain scope.                                                                                                                      | Learn its guided sequencing and explicit bond risks; avoid adding Lightning solely to reach its market.                          |
| A prior wallet integration proves demand | Trezor's official forum says its Hodl Hodl integration was discontinued in 2024 to focus on more-used services.                                                                                                                                                         | Prove conversion and repeat usage before maintaining expensive embedded execution.                                               |
| Noncustodial multisig solves regulation  | MiCA has distinct platform, order transmission, execution, custody and transfer categories. France's transition has ended; shared books and routing compensation have additional constraints.                                                                           | Obtain a written classification and verify provider entity/permissions before offering real trades.                              |
| Buyer confirmation means fiat settled    | A payment claim or screenshot can be false; a posted instant payment can still involve fraud/recall risk.                                                                                                                                                               | Buyer claim never releases escrow. Seller checks their own bank, amount and payer, then separately authorizes the exact release. |

## The product experience

Entry is optional. Opening a wallet, Overview or Settings must not contact a price or trading service. A live add-on first explains the provider, eligible locations, data exposure and account requirement. Users explicitly enable discovery. They can stop future discovery without interrupting an active contract or losing recovery/support access.

1. **Choose buy or sell; enter euros.** One payment method and currency. The preview uses €50–250; live limits must be the intersection of provider limits, the pilot risk budget and Groot's native transaction limits, including fees. The range is not a regulatory exemption.
2. **See one understandable recommendation.** For buying, show euros paid and net sats received; for selling, euros received and total wallet debit, including both funding and release costs. Rank comparable, executable quotes by the actual user total. Put alternatives and fee details behind disclosure. Do not default to a sponsored offer or imply reputation is identity proof.
3. **Review before commitment.** Show counterparty, amount, provider, expiry, payment terms, known costs, unknown estimates, escrow trust and delay/cancellation rules. Before a provider contract binds a wallet payout destination, allocate a fresh permanently labelled receive address through `WalletPort` in one atomic native operation. Verify that destination in the contract, then freeze the exact contract/version and price on acceptance. Changing price or destination requires a new review. Discovery is never a reservation.
4. **Secure bitcoin before paying.** For sellers, ordinary native coin selection and authoritative PSBT review precede escrow funding. For buyers, independently validate the provider's escrow script, deposit, network and confirmation requirement before revealing actionable bank instructions. A server status alone cannot prove funding.
5. **Guide one next action.** Buyer sends one exact transfer from their own account and marks it sent. Seller checks their bank and separately acknowledges receipt before authenticated release. No blanket permission to co-sign, release on timeout, or release from a chat message. Delayed money keeps the trade open with an inline status and help action.
6. **Finish from evidence.** A signed or submitted release is not confirmed bitcoin. Record accepted broadcast even if local persistence fails, then reconcile actual chain state against the contract's reviewed payout destination. Never reuse one global payout address for convenience.
7. **Make problems usable.** Before funding, cancellation is simple. Once funded, a refund request is pending until native/provider verification proves the actual return. After payment, do not offer unilateral cancellation or duplicate payment. Disputes retain evidence and pause voluntary release; they do not erase chain events or promise an outcome.

The preview implements these screen transitions as simulation. It deliberately uses no bank-account entry, real identifiers, chat, credential entry, signing or authoritative transaction review. It does not imply provider support has been contacted.

## Pricing without a trading terminal

Use **one all-in quote**, not a feed selector plus markup editor. For a taker, the provider's exact contract controls the price. The public offers API does not expose the acceptor's exact fee/net receipt, so public discovery must say **indicative** until contract creation returns sufficient cost data. Network costs that remain unknown stay visibly estimated. Never fill them with a silent fallback or call an indicative number guaranteed.

For price fairness, use at most one independently selected BTC/EUR reference, with explicit opt-in, timestamp and stale bounds. Candidate: Kraken's direct BTC/EUR market, subject to separate availability/licensing/privacy review. It is a guardrail and comparison, not a source of transaction facts. No reference HTTP client is introduced here. The pilot must test reference outage, provider price change and implausible quotes. A significant all-in deviation requires explicit review or rejection under a documented policy; never quietly increase the customer's spend.

Do not build a maker premium screen into the first release. Maker tools can remain on the provider site during the pilot. Future makers can enter the euros they want or sats they sell and see a single expiry-bound total; routing/price/fee assumptions still need disclosure. Do not pretend hiding a premium makes it disappear.

## Architecture and repository split

Current source boundary:

```text
Groot route + existing shared UI
  → route-local preview service (src/lib/marketplace)
  → portable policy (packages/marketplace/core.ts)

Current opted-in public-discovery research
  → bounded local development relay (explicitly enabled only)
  → strict LocalCoinSwap public response normalization

Existing WalletPort → Rust remains the only wallet/signing authority
```

`core.ts`, `public-offer.ts` and provider normalizers in `packages/marketplace/` have no Svelte, Tauri, wallet, storage or network imports. `discovery.ts` adds a bounded same-origin client; `discovery-server.mjs` is a Node-only loopback research relay, installed by `scripts/dev/marketplace-discovery.ts` only in an explicitly enabled development server. The directory is an extraction boundary, not a package-manager workspace. No dependency or lockfile is added. Tests run in the existing Vitest harness plus Node's built-in test runner. Exact sub-cent provider prices use integer ratios for comparison/indications; display rounding never determines the amount. Normalization and known newcomer restriction filters do not establish country/account eligibility or independently verify the Bitcoin network.

Create a separate `groot-marketplace` repository before a hosted or production network service is implemented. Recommended contents: provider contracts/adapters, service-specific authorization, ordered event journal, maker operations, support tooling, monitoring and integration fixtures. Define ownership/license and API versions there explicitly; do not assume the wallet's Apache-2.0 decision licenses a hosted service. A remote repository is unnecessary for reviewing this prototype and none was created or pushed.

The wallet keeps a narrow integration UI and native `WalletPort` operations. No remote website receives a Tauri bridge. Do not embed arbitrary provider HTML, import a web SDK with signing access, share wallet seeds or use wallet keys as exchange login. Provider credentials and future escrow-specific keys stay in Rust/platform-protected storage, scoped separately from wallet credentials. Do not pass a provider payment seed through the webview.

Real contracts require durable records, recovery exports and restart reconciliation. That format does not exist in this preview. Before adding it, write an ADR with versioning, retention, provider IDs, wallet binding, crash recovery, evidence access and migration-versus-discard decisions; obtain approval for any breaking wallet/profile format change. UI state cannot become a settlement ledger. The preview reducer is a testable UX policy and cannot authenticate live events, authorize release or resolve an arbitration race.

## Delivery phases and acceptance gates

The [production-readiness checklist](production-readiness.md) separates repeatable local acceptance from the evidence required for a real-user handoff or embedded execution. It does not convert fixture success into live-trading authorization.

### Phase 0 — reviewable product, implemented here

- Synthetic buy/sell happy paths, fee breakdown, alternative offer selection, stale estimates, delayed transfer, seller receipt guard, disputes, cancel/refund and unavailable/empty states.
- Existing Groot components; 1180×780 desktop and 390×844 mobile; light/dark; EN/FR/ES; keyboard-safe scrolling.
- Pure integer policy/state tests, strict provider parser tests, browser acceptance and required repository validation.
- No persisted formats or BIP changes, public release, provider account or real-fund transaction.

### Phase 1 — discovery + explicit provider handoff

Implementation order and exit criteria:

1. **Service/legal decision.** Identify operating entity, launch countries and target users; obtain advice on each exact activity. Verify provider contracting entity and authorization/service scope with current AMF/ESMA evidence. Assess MiCA, TFR/AML, DAC8, GDPR and payment-method terms independently. No API or marketing statement substitutes for this.
2. **Provider agreement and proof.** Obtain supported integration/branding terms, fee treatment, regional eligibility, testnet identity and account/key lifecycle. Resolve contradictory API paragraphs through provider confirmation and actual tests. Do not send user API/signature keys to a Groot server.
3. **Depth experiment.** Sample actual EUR/SEPA Instant offers at €50, €100 and €250 in each direction for at least 14 days. Deduplicate by trader; exclude inactive/ineligible/ARK/stale/first-trade-ineligible offers. Track quoted net amounts, terms, provider errors and trader concentration without collecting bank details. Conduct any actual fill tests only with an approved account, legal eligibility and explicit test-fund budget.
4. **Transport.** Add a dedicated bounded native transport after privacy/CSP/security review: fixed HTTPS origin, no redirects, size/time/page limits, cancellation, backoff, freshness and no logging of query amounts/identifiers. Current HTTP transport is confined to the explicitly enabled loopback development relay; it is not a native or hosted production service. No background fetch after leaving discovery.
5. **Honest handoff.** User confirms opening the exact provider origin; disclose IP/account/payment data and state that availability/prices may change. Handoff creates no completed Groot trade. Do not claim one-address-per-contract privacy until the provider supports and has tested it. Provider account onboarding and dispute access must work on desktop and mobile browsers.
6. **Small monitored cohort.** Prospectively target at least three eligible distinct counterparties at supported amounts during advertised hours, p90 acceptable-offer discovery under 60 seconds, at least 80% eligible-search coverage and at least 90% completion for committed cohort trades. Set explicit acceptable price-deviation and concentration ceilings before measurement. These are proposed pilot targets, not current achievements. Reject or narrow the corridor if results miss them; do not populate a fake book.

A handoff pilot tests demand and liquidity at substantially lower integration risk, but will have more friction than the preview. If that friction prevents conversion, solve it with the provider before scaling rather than quietly claiming an embedded launch.

### Phase 2 — fully embedded provider contracts

Only after phase 1 clears its gates: native provider authentication/payment-key onboarding; independently verified escrow/address derivation; exact contract receipt and fee review; local permanent receive labels; native funding/signing/release; idempotent mutation keys; provider-bound ordered events with durable deduplication; refresh/backoff; notification and restart recovery; secure evidence/support handoff.

Test provider outage after acceptance, API-key expiry, wallet switch/lock, duplicate commands, ambiguous timeout after mutation, changed contract/version, funded expired contract, buyer late payment, seller disappearance, dispute/chain races, lost device, corrupted journal and operator outage. A disputed contract must still reconcile a real broadcast/confirmation. No blind retry of contract creation or release after an ambiguous response.

Have an independent Bitcoin/security review and counsel approve the exact release candidate. Prove both parties' recovery path without Groot being online. Use the provider's actual test chain; Groot's existing Signet/Testnet4/Regtest capabilities do not imply compatibility with the provider's testnet. Real Mainnet trading requires its own ADR/release/threat-model evidence and native limits remain enforced.

### Phase 3 — decide whether to operate a marketplace

Reconsider only if repeat demand, spread, completion, support cost and provider concentration justify a staffed service. Compare: negotiated provider product, multiple explicitly separated provider destinations, a licensed operating partner, or a standalone Groot operator. A shared international order book or affiliate rebate is not a presumed legal shortcut.

For Groot escrow, require defined signer ownership/control, independently verified 2-of-3 scripts and destinations, distinct per-trade key material, co-sign policy, bank-fraud response, evidence access/retention, appeal process, staff coverage, conflicts policy, operator-compromise recovery and an orderly shutdown plan. Avoid one online hot co-signing key. Refund timelocks cannot safely infer that fiat was never sent. Specify collusion and unilateral-signature risks and audit every key and payout branch.

## Liquidity and economics before feature expansion

Concentrate one corridor and scheduled trading hours. Recruit several independent recurring liquidity providers with transparent obligations instead of buying vanity listing counts. Measure unique executable inventory, amount-weighted depth, effective spread including all fees, fill/reject rate, response time, settlement time and volume concentration. Small trades are especially sensitive to two onchain transactions and minimum platform fees.

Do not promise zero fees or assume routing rebates fund the product. Counsel must classify any order-routing remuneration before a commercial agreement. Model revenue less support time, disputes/fraud losses, bank interruptions, provider costs, legal operations and security. Expand one payment method/currency only after the existing corridor meets its targets. An empty state is an honest product result; a notification/waitlist service requires explicit consent and separate delivery work.

## Feedback loop and stop conditions

Every iteration: reproduce a finding with evidence → change the owning rule/UI → test the failure path → inspect both sizes/themes → record the remaining limitation. Review funnel drop-off at amount, quote, account handoff, escrow funding, payment and completion. Live telemetry is not implemented: introducing it requires minimization, consent/legal basis and retention design; never record bank details, addresses, chat, keys or credentials in analytics.

Pause expansion when acceptable quotes are unavailable, one trader dominates executable inventory, support capacity cannot meet published coverage, provider eligibility changes, price data is stale, reconciliation is ambiguous, or fraud/complaints exceed the pre-agreed risk budget. Keep active-trade recovery/support available when new trades are disabled. Do not use a feature flag to strand funded escrow.

## Validation record

See the historical [preview verification](verification.md) and current [discovery verification](discovery-verification.md) for commands, screenshots, findings and remaining live gates. Existing wallet/profile/backup/proposal/registry formats remain unchanged. BIP impact: **none**; no new transaction, derivation, descriptor or protocol support is claimed.
