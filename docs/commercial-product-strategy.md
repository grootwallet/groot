# Groot commercial product strategy

Status: product and licensing proposal. It does not describe implemented paid services or change the current test-network release gate.

## Product promise

Groot may charge for coordination, assurance, support, and organizational workflow. It must not charge for access to keys or funds. The following capabilities remain usable without a paid account or an available Groot service:

- create, import, unlock, sign, review, and broadcast a supported wallet;
- export standard public descriptors, PSBTs, BSMS records, labels, and recovery material supported by the core;
- move all funds and recover with compatible software;
- use local, file, QR, hardware, and self-hosted paths that the core supports;
- inspect the policy and transaction that will actually be signed.

A subscription lapse must degrade a connected workflow to open interchange, not strand a wallet. Groot does not charge by wallet balance or assets under management.

## Plans

| Plan        | Customer                                                                     | Product boundary                                                                                                                                                   | Availability                                                                        |
| ----------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Groot Free  | Individuals and technical families                                           | Sovereign wallet, software and hardware signers, standard multisig, coin control, labels, own-node connectivity, standard backup/export, and local recovery drills | €0; core product; currently test-network only                                       |
| Groot Plus  | Families, geographically distributed signers, and high-net-worth individuals | End-to-end encrypted coordination, signer enrollment and status, recovery/inheritance guidance, scheduled drills, private alerts, and priority support             | Proposed €9/month or €90/year; coming soon; not implemented                         |
| Groot Teams | Companies, funds, nonprofits, and professional operators                     | Organization roles, approval policy, batch payouts, audit evidence, accounting exports, business continuity, service integration, and supported self-hosting       | Proposed €39/month or €390/year including five people; coming soon; not implemented |

Free is a complete product rather than a trial. Plus and Teams must create recurring operational value without weakening a customer's exit.

Paid plans are proposed to include a 30-day trial and may change price before launch. Any additional Teams seat price remains undecided and must not be advertised until the service cost model is validated.

## Service identity and privacy

The local wallet needs no Groot account. A future hosted service should default to a random account number and enrolled device keys rather than an email address or legal name. This follows the privacy benefit of account-number-only services while accounting for the risks:

- the account number is an identifier, not an authentication secret;
- device enrollment uses public-key challenge/response and explicit recovery codes;
- display names and contacts are end-to-end encrypted where possible;
- payment entitlement is separated from wallet identity and wallet contents;
- the service stores no seed, private descriptor, plaintext PSBT, address set, balance, or recovery plan;
- rate limiting does not require invasive identity collection;
- metadata retention is bounded and published;
- Tor and self-hosted relay paths are supported by design, not added after launch.

Teams may require billing or regulated customer information, but those records must remain separated from wallet coordination identities. Insurance and regulated distribution may require identity; that is a distinct, opt-in relationship with explicit disclosures.

## Licensing proposal

Keep the legal architecture legible:

1. License the consumer wallet application and protocol/reference libraries under **Apache-2.0**. It is permissive and supplies an explicit patent grant. A release-owner decision, copyright inventory, dependency review, and legal review are required before adding the license.
2. License a Groot-operated, self-hostable coordination relay under **AGPL-3.0-or-later** so deployed modifications remain available to their users. Keep the relay unable to sign, decrypt proposals, derive addresses, or become a recovery dependency.
3. Keep genuinely enterprise-only administration, compliance integrations, support tooling, and managed-service operations in a separate service or repository under a commercial license. Do not link a closed module into the core wallet or make it necessary for standard wallet operation.
4. Publish protocol specifications and interoperable client behavior even when a hosted implementation is paid.

This is a recommendation, not legal advice or a completed licensing decision. Avoid a custom source-available license for the consumer wallet: it creates ambiguity and makes ecosystem adoption harder. If a commercial source-available license is considered for enterprise code, select a standard form with counsel and clearly state when or whether it converts to an open-source license.

## Revenue model

Revenue should be diversified and should not depend on transaction routing, spreads, or custody:

- recurring Plus and Teams subscriptions;
- supported self-hosted Teams deployments and service-level agreements;
- recovery-plan setup, drills, migration, and incident-response support;
- training and policy-design engagements for organizations;
- optional regulated assurance or insurance distribution, with commissions disclosed;
- enterprise connectors and audit/accounting support.

P2P exchange, lending, swaps, Payjoin, CoinJoin, and CoinSwap may improve utility but should not become the economic foundation. Integrations must be modular, non-exclusive, jurisdiction-aware, and explicit about counterparties, fees, privacy, and legal risk. Groot must never imply that “non-custodial” means unregulated or risk-free.

## Commercial acceptance tests

Every paid feature must answer yes to all of these:

- Can the user still identify and recover the wallet if Groot disappears?
- Can a lapsed subscriber export an open format and complete an in-flight spend through a documented escape path?
- Can the service be unavailable without changing the Bitcoin spending policy?
- Is service metadata minimized, encrypted, and covered by a deletion/retention rule?
- Are approval roles clearly separate from cryptographic signing thresholds?
- Does the interface distinguish implemented capability from a future or regulated service?
