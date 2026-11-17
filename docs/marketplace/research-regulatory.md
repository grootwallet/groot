# Marketplace: EU/France regulatory and settlement research

Research date: **7 November 2026**. This is a product and engineering risk assessment from primary sources, not a legal opinion or approval to operate. The analysis assumes a France/EU launch; the company's establishment, customers' locations, provider entity, actual transaction flow and degree of control can change the result. Other jurisdictions require separate assessment.

## Recommendation

Build the optional trading experience and provider boundary now with deterministic demonstration data. Keep live account linking, order submission, payment collection and escrow signing disabled until the launch gates below are met. For a first live version, prefer a clearly identified provider-owned trade and dispute process over Groot operating a new order book or holding an escrow key. A provider integration still needs classification; an API, a separate repository, a small ticket size and a “non-custodial” label do not establish an exemption.

Do not make “no identification,” “anonymous,” “instant settlement,” “guaranteed payment” or “Groot can always recover your bitcoin” product promises. The defensible goal is to disclose and minimise information sharing while accurately explaining what the counterparty, payment provider, marketplace and law require.

## The present EU/France position

France's MiCA transition ended on **1 July 2026**. The AMF states that providers continuing regulated crypto-asset services need MiCA authorisation or an applicable Article 60 financial-entity notification. A new Groot marketplace cannot assume a remaining grandfathering period. [AMF transition reminder, 5 February 2026](https://www.amf-france.org/en/news-publications/news/amf-reminds-digital-asset-service-providers-transitional-period-allowing-them-continue-providing).

MiCA recital 83 distinguishes non-custodial wallet hardware/software providers. Recital 22 limits the fully decentralised exclusion to services without an intermediary. **Inference:** a Groot-hosted matching, escrow or arbitration service needs its own assessment; the wallet's existing key isolation does not settle that service's status. [MiCA recitals 22 and 83](https://eur-lex.europa.eu/eli/reg/2023/1114/oj/eng).

The relevant classifications come from what each entity actually does. The following is a review map, not a determination that a particular implementation is regulated. [MiCA Article 3 definitions](https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook/mica/article-3-definitions).

| Proposed capability                                                        | Classification question for counsel                        | Product implication                                                              |
| -------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Wallet signs a user's ordinary onchain transaction locally                 | Is Groot solely supplying non-custodial wallet software?   | Preserve Rust secret isolation and actual transaction review.                    |
| Groot manages offers, matching rules or acceptance that results in a trade | Operation of a multilateral trading platform?              | Do not presume that bilateral settlement removes platform obligations.           |
| Groot receives and forwards a buy/sell instruction to an API               | Reception/transmission or execution of client orders?      | White-label presentation does not answer who provides the service.               |
| Groot buys/sells using its own treasury at a quoted price                  | Exchange of crypto-assets for funds?                       | A guaranteed quote creates a different role from displaying peer offers.         |
| Groot holds a key and can co-sign an escrow outcome                        | Custody/control or transfer services on behalf of clients? | Assess practical control, collusion and recovery, including 2-of-3 arrangements. |

Article 59 requires an applicable authorisation route for in-scope services, and authorisations identify the permitted services. **Gate:** verify the exact provider legal entity and scope, rather than a group name or old French DASP registration. [MiCA Article 59](https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook/mica/article-59-authorisation). Use the [ESMA MiCA register](https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica) and the relevant national authority; record the entity, permissions, countries, date and source. This research has **not established Hodl Hodl's current authorisation or suitability for EU distribution**.

Two integration assumptions need particular care:

- ESMA says an EU-authorised platform cannot combine its order book with non-EU platforms operated by unauthorised entities in the shared-book model described in its Q&A. **Inference:** importing liquidity into a Groot-managed matching book is not an automatic compliance shortcut. This Q&A does not decide every referral or display-only model. [ESMA Q&A 2579, 20 June 2025](https://www.esma.europa.eu/publications-data/questions-answers/2579).
- Article 80(2) prohibits benefits for routing client orders to a particular platform/provider where the reception/transmission service applies. ESMA also addresses execution in its Q&A. **Gate:** assess affiliate fees and rebates before adopting them as the business model. [MiCA Article 80](https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook/mica/article-80-reception-and-transmission-orders), [ESMA Q&A 2087](https://www.esma.europa.eu/publications-data/questions-answers/2087).

## Privacy without a false no-KYC promise

The EU Transfer of Funds Regulation excludes crypto-asset transfers between persons without a CASP's involvement; it also establishes originator/beneficiary information requirements when applicable CASPs participate. Transfers to/from self-hosted addresses have specific provisions. The **EUR 1,000 ownership/control assessment threshold is not a general anonymous-trading allowance**. [Regulation (EU) 2023/1113, Articles 2, 14 and 16](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32023R1113).

The EBA's final Travel Rule Guidelines describe implementation, including self-hosted-address ownership/control methods and risk mitigation. Do not implement a blanket requirement to sign arbitrary messages: Groot currently lists BIP322 as a candidate, and any new proof needs its own explicit review and hardware support. [EBA/GL/2024/11, sections 4.8.4–4.8.5](https://www.eba.europa.eu/sites/default/files/2024-07/6de6e9b9-0ed9-49cd-985d-c0834b5b4356/Travel%20Rule%20Guidelines.pdf), [Groot BIP support](../bip-support.md).

French law includes relevant authorised crypto-asset providers among AML/CFT obliged entities. Counsel must allocate customer due diligence, sanctions, suspicious-activity reporting and retention duties between the actual operators. User-to-user trading does not establish that an intermediary can omit these duties. [French Monetary and Financial Code, Article L561-2](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044564139).

Tax transparency is a separate gate. The European Commission describes DAC8 as applying from **1 January 2026**, with due diligence and transaction reporting by Reporting Crypto-Asset Service Providers. **Gate:** obtain a DAC8/CARF scope assessment, including any Groot crypto-asset-operator role and French implementation; MiCA status alone is insufficient. Do not infer a French filing deadline from another Member State's process. [European Commission DAC8 overview](https://taxation-customs.ec.europa.eu/taxation/tax-transparency-cooperation/administrative-co-operation-and-mutual-assistance/directive-administrative-cooperation-dac/dac8_en).

Plan for the next legal boundary as well: the AML Regulation generally applies from **10 July 2027**. This is a forward compatibility review, not a reason to defer existing duties. [Regulation (EU) 2024/1624, Article 90](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX%3A32024R1624).

Even a trade without an identity-document upload may reveal a bank-account name, IBAN, payment reference, messages and Bitcoin address. This is a product/data-flow observation; exact disclosure depends on the chosen rail and bank. Explain it before commitment. Prefer copy such as “Your payment details are shared with this trading partner” with a precise data list, provider identity and link to applicable terms. Never imply a bank transfer is anonymous.

GDPR requires a lawful basis, transparency, minimisation, appropriate retention/security and protection by design; high-risk processing may require a DPIA. **Proposed design:** keep identity/payment evidence offchain, define separate wallet/trading identities, restrict evidence access, document controller/processor roles and international transfers, and avoid attaching wallet balance/history to requests. A global permanent reputation record needs its own necessity, accuracy and rights analysis. [GDPR Articles 5, 6, 13, 25, 28, 32, 35 and Chapter V](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng).

CNIL recommends considering whether blockchain is necessary and keeping supplementary personal data offchain where possible. **Proposed design:** no public bank details, identity evidence, dispute documents or identifying reputation comments on Bitcoin or another immutable ledger. [CNIL blockchain guidance](https://www.cnil.fr/sites/default/files/2025-08/la_blockchain_chaine_blocs.pdf).

## Fiat confirmation is not an atomic swap

The EPC describes SEPA Instant as making funds available in less than ten seconds, subject to scheme operation and participating providers. Its current 2025 rulebook version 1.2 took effect on 30 September 2026. That speed describes the payment rail, not completion of a peer trade or removal of fraud risk. [EPC SCT Inst overview](https://www.europeanpaymentscouncil.eu/what-we-do/epc-payment-schemes/sepa-instant-credit-transfer-sct-inst/sepa-instant-credit-transfer).

The rulebook contains recall procedures, including a **13-month** initiation period for fraudulently originated transfers and shorter periods for duplicate/technical cases. A recall request is not an automatic right to recover the funds. **Inference:** do not describe a visible incoming transfer as mathematically irreversible or guarantee that a bank cannot later investigate/freeze an account. [EPC 2025 SCT Inst rulebook v1.2, section 4.3.2](https://www.europeanpaymentscouncil.eu/sites/default/files/kb/file/2026-09/EPC004-16%202025%20SCT%20Instant%20Rulebook%20v1.2.pdf).

The following are proposed operational controls, not claims that they eliminate fraud:

| Failure or abuse                                                  | Required response in the product                                                                                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buyer selects “I paid” or uploads a receipt                       | Treat it as an assertion. Never release bitcoin from this event alone.                                                                                              |
| Seller sees incoming fiat                                         | Require explicit confirmation in the seller's own banking app, correct amount/reference and expected payer details before reviewing release. Explain residual risk. |
| Payment pending, delayed or provider unavailable                  | Keep a durable “Awaiting payment confirmation” state. Reconcile authoritative state after reconnect; do not infer success from a timer.                             |
| Buyer paid before expiry but settlement arrives later             | Preserve the claim and payment evidence; require dispute/reconciliation. Do not silently refund escrow to the seller on expiry.                                     |
| Third-party payer, mismatched name, overpayment or refund request | Pause and use the provider's dispute process. Do not tell users to forward excess money to a new account.                                                           |
| Seller refuses to release, claims missing payment or loses a key  | Surface the dispute/recovery path, evidence requirements and actual response expectations before deposit.                                                           |
| Bank fraud allegation follows bitcoin release                     | State the liability and escalation process in advance; neither reputation nor multisig reverses an already broadcast spend.                                         |

“Groot unlocks bitcoin after user confirmation” is therefore underspecified. Which user, which evidence, which key, which contract and which appeal matter. If Groot holds the arbitration key, it needs a signed dispute policy, secure key operations, conflicts controls, staffing, evidence access and a credible outage/exit recovery plan. A 2-of-3 escrow cannot always resolve a lost key or unresponsive party; prove every recovery path for the exact script before collecting funds.

Initially exclude cards, payment-service friends/family workarounds, cash meetups, third-party payments and direct debit. Candidate first scope is **EUR with one bank-transfer rail** and provider-supported country eligibility. A proposed small trade cap should be a fraud/operational control supported by pilot evidence, never advertised as a regulatory exemption.

Keep fiat outside Groot accounts. A future “Pay from your bank” integration needs a separate payment-services assessment: PSD2's technical-service exclusion expressly does not cover payment initiation/account information services merely because the provider does not possess funds. [PSD2 Article 3(j) and Annex I](https://eur-lex.europa.eu/eli/dir/2015/2366/oj/eng).

## Concrete launch gates

These are proposed acceptance criteria. They do not claim that approval or evidence already exists.

1. **Service and country classification.** Counsel reviews a sequence diagram and terms for the exact Groot entity, provider entity, user locations, order flow, fees, key control, disputes and bank rail. Record the result and approved countries; default other locations to unavailable. Assess MiCA, AML/TFR, sanctions, tax reporting, consumer terms and any payment-services role.
2. **Provider and integration permission.** Verify current authorisation/service scope where required, distribution eligibility, API commercial rights, account requirements, data roles and allowed embedding. Confirm sandbox support, signed request/authentication method, idempotency, quote/contract semantics, cancellation, outage and dispute/recovery ownership. Public docs alone are insufficient evidence of permission.
3. **Security and recoverability.** Threat model the adapter, external links, credentials, escrow keys and payment instructions. Independently review script construction, amounts/fees, counterparty substitution, recovery material, signing and every fund-locking path before a funded pilot. Preserve Groot's Rust secret and reviewed-transaction boundaries.
4. **Operational readiness.** Assign actual support/dispute owners, escalation contacts, staffed hours, loss allocation, banking restrictions, response targets, incident communications and service wind-down. Test delayed fiat, disputed receipt, missing bank data, provider downtime and abandoned trades. Display realistic expectations before commitment.
5. **Privacy and recordkeeping.** Approve the data inventory, lawful bases, any required DPIA, access controls, retention/deletion schedule, legal holds, data-subject rights and provider contracts. Wallet address-label permanence does not justify permanent public marketplace identity or dispute evidence.
6. **Truthful UX acceptance.** Clearly identify the counterparty/provider, who arbitrates, what is shared, exact all-in quote, fees, price expiry and release consequence. Test users' understanding of “payment sent” versus “payment received.” Do not substitute a toast for durable trade state. Test recovery after restart and wallet/account switches.
7. **Controlled live pilot.** Only after the preceding gates, use an authorised country/rail scope and an owner-approved exposure cap. Measure completed trades, time to first fill, payment/release time, cancellation, dispute and loss rates, plus support workload. Set stop conditions and expansion thresholds before inviting users. Screenshots and mocked tests are UX evidence, not legal, liquidity or escrow certification.

Repository separation is useful for ownership and deployment, but legal classification follows activities and entities. This research changes no wallet/profile format, derivation, descriptor, transaction encoding or BIP support.
