# Recovery, inheritance, and assurance roadmap

Status: planned product direction. Guided descriptors exist on test networks; delayed-branch funded spending, family workflows, cosigner services, and insurance are not production capabilities.

BIP329 JSONL is an optional, separate portability artifact for representable public labels and coin spendability. It is not a wallet backup: it contains no descriptors, keys, seed, credential, proposal, or complete Groot-only history, and cannot recover funds. Recovery drills first restore the canonical wallet/profile or public descriptor backup and prove exact wallet identity; only then may they import a trusted label file through its atomic exact-wallet boundary.

## Product outcome

Help a user choose, verify, rehearse, and maintain a recovery or inheritance plan that the intended people can actually execute. The product must work for a technical owner helping parents, a less-technical spouse or beneficiary, geographically distributed co-signers, and a company surviving staff or signer loss.

## Recommended planning flow

1. **Inventory the situation:** owner capability, likely helpers, device locations, loss events, urgency, privacy needs, and jurisdiction.
2. **Choose a reviewed template:** single-key recovery, 2-of-3 family multisig, independent recovery keys after delay, decaying threshold, or business-continuity policy. Do not expose an arbitrary script editor.
3. **Explain powers and failure tolerance:** who can spend now, who can spend later, which losses are survivable, and which collusions can steal.
4. **Verify every signer and backup:** device-displayed address or policy, descriptor checksum, physical storage separation, and recovery contact acknowledgement.
5. **Run a test:** reconstruct the first address and complete a disposable or test-network spend through every advertised path.
6. **Maintain the plan:** reminders for drills, signer health, firmware, contact changes, backup age, timelock maturity, and succession events.
7. **Provide an emergency packet:** plain-language instructions, policy map, device list, descriptor location, escalation order, and open-tool recovery path without secrets in the packet itself.

## Experience principles

- Recommend the smallest policy that survives the named loss events.
- Speak separately to the owner, helper, spouse/beneficiary, executor, and business administrator.
- Never claim inheritance is complete because a descriptor compiles.
- Show exact spending paths and their powers; display approximate time only as secondary to block or timestamp semantics.
- Require rehearsal before marking a plan ready and retain evidence of what was tested, when, and with which non-secret policy version.
- A helper relationship is revocable and replaceable without hidden dependence on Groot.
- Notifications reveal no wallet facts before local decryption.

## Provider-neutral cosigning

A professional cosigner can improve availability and enforce process, but it introduces censorship, collusion, continuity, legal, and metadata risk. Any Groot-compatible service must therefore:

- be one replaceable signer in a policy whose other paths are independently recoverable;
- have no unilateral spending path and no secret role in transaction construction;
- publish availability, jurisdiction, key ceremony, access control, incident, succession, and shutdown procedures;
- support at least one time-delayed sovereign escape path that does not require the provider;
- avoid sharing one correlated cloud, identity provider, jurisdiction, or operator across nominally independent signers;
- export complete policy and service evidence before funding.

Groot should support a provider-neutral protocol and multiple providers before operating a cosigner itself. Encrypted coordination alone must remain distinct from cosigning.

## Insurance direction

AnchorWatch demonstrates a useful model: insurance is bound to a self-custody policy and operating process rather than replacing self-custody with full custody. A European offering could be valuable, but software cannot promise coverage. Research must precede product claims:

- insurable events, exclusions, valuation, limits, deductibles, proof of loss, and claims authority;
- EU and country-specific insurance distribution, custody, AML, sanctions, consumer, and data-protection obligations;
- underwriting evidence from policy construction, signer separation, recovery drills, transaction approvals, and incident reporting;
- independence between insurer, broker, cosigner, relay, wallet publisher, and key infrastructure;
- insurer/cosigner failure, insolvency, non-renewal, dispute, and emergency escape;
- consent and minimization for any evidence shared with an underwriter.

Start with an insurer-agnostic evidence pack and readiness assessment. Add a regulated distribution partner only after counsel and underwriting validation. Insurance never substitutes for tested recovery.

## Phased roadmap

1. Finish funded Miniscript path selection, signing, reorg, and recovery evidence on regtest and Testnet4.
2. Build a Recovery & Inheritance Center with recommendation inputs, path visualization, role-specific checklists, plan versioning, and drills.
3. Add encrypted helper enrollment, acknowledgements, reminders, and emergency-packet export through Groot Plus.
4. Add business-continuity roles, quorum changes, offboarding, and auditable drills through Groot Teams.
5. Publish provider-neutral cosigner interoperability and sovereign-exit requirements.
6. Research EU assurance/insurance feasibility and pilot only with licensed partners and independently reviewed policies.
