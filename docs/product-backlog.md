# Groot commercial product backlog

Status: issue-level roadmap. Priority is constrained by the mainnet release gates in [`roadmap.md`](roadmap.md); “next” does not mean “safe to ship on mainnet.”

## Ordering

- **Now:** complete Testnet4 physical-device, interoperability, recovery, backend, packaging, and independent-review evidence.
- **Next foundation:** open-format exits, recovery UX, and the encrypted remote coordination protocol on test networks.
- **Then:** Plus service experience and Teams operational workflows.
- **Later:** regulated assurance and optional financial-market integrations.

## Issue-ready epics

| ID                 | Priority | Tracking                                              | Epic                                                  | Definition of done                                                                                                                                                                                                                            |
| ------------------ | -------- | ----------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GROOT-PRODUCT-01   | P0       | [#61](https://github.com/grootwallet/groot/issues/61) | Adopt Free, Plus, and Teams product boundaries        | Canonical specs, public claims, entitlement boundaries, expiry behavior, and non-lock-in acceptance tests agree.                                                                                                                              |
| GROOT-LICENSE-01   | Done     | [#62](https://github.com/grootwallet/groot/issues/62) | Adopt base-wallet licensing architecture              | ADR 0080 adopts Apache-2.0 for the base wallet, preserves third-party terms and trademarks, records the ownership qualification, and adds contribution/attribution policy. Future relay or service licenses still require separate decisions. |
| GROOT-INTEROP-01   | P0       | [#20](https://github.com/grootwallet/groot/issues/20) | Implement BIP329 label and frozen-coin import/export  | Versioned, bounded, privacy-reviewed round trips preserve immutable provenance rules and pass external-tool interoperability.                                                                                                                 |
| GROOT-COORD-01     | P1       | [#63](https://github.com/grootwallet/groot/issues/63) | Specify encrypted remote signer coordination          | Protocol, threat model, state machines, metadata budget, vectors, self-hosting, and offline escape receive independent review.                                                                                                                |
| GROOT-COORD-02     | P1       | [#64](https://github.com/grootwallet/groot/issues/64) | Implement the self-hostable opaque relay              | Relay cannot decrypt or sign; retention, deletion, abuse, HTTPS/Tor, migration, reproducible deployment, and loss tests pass.                                                                                                                 |
| GROOT-COORD-03     | P1       | [#65](https://github.com/grootwallet/groot/issues/65) | Build Plus device enrollment and remote proposal UX   | Account-number identity, device verification, invitations, encrypted notifications, per-signer status, and PSBT fallback work on desktop/mobile test networks.                                                                                |
| GROOT-RECOVERY-01  | P1       | [#66](https://github.com/grootwallet/groot/issues/66) | Build the Recovery & Inheritance Center               | Reviewed recommendations, role-specific explanations, plan versioning, emergency packet, health checks, and drills are accessible and tested.                                                                                                 |
| GROOT-RECOVERY-02  | P1       | [#17](https://github.com/grootwallet/groot/issues/17) | Complete funded Miniscript spending paths             | Every advertised path passes immediate/boundary/post-boundary/reorg/restart tests and external recovery review.                                                                                                                               |
| GROOT-RECOVERY-03  | P2       | [#66](https://github.com/grootwallet/groot/issues/66) | Add family helper and beneficiary workflows           | A parent, spouse, helper, executor, and owner can enroll, rehearse, revoke, replace, and recover without service dependence.                                                                                                                  |
| GROOT-TEAMS-01     | P2       | [#67](https://github.com/grootwallet/groot/issues/67) | Separate organization approvals from Bitcoin signing  | Roles, approval policy, delegation, offboarding, versioning, and audit semantics cannot authorize a cryptographic spend by themselves.                                                                                                        |
| GROOT-TEAMS-02     | P2       | [#68](https://github.com/grootwallet/groot/issues/68) | Add safe batch payouts                                | CSV/template import, duplicate detection, fee/change/coin review, limits, approvals, authoritative PSBT summary, cancellation, and recovery are complete.                                                                                     |
| GROOT-TEAMS-03     | P2       | [#69](https://github.com/grootwallet/groot/issues/69) | Add audit, accounting, and integration exports        | Signed/tamper-evident history, BIP329 and accounting exports, local API/webhooks, redaction, retention, and access control pass review.                                                                                                       |
| GROOT-PRIVACY-01   | P2       | [#10](https://github.com/grootwallet/groot/issues/10) | Complete Payjoin V2                                   | ADR 0031 durability, transport, review, fallback consent, interoperability, privacy, and denial-of-service evidence is complete.                                                                                                              |
| GROOT-ASSURANCE-01 | P3       | [#70](https://github.com/grootwallet/groot/issues/70) | Specify provider-neutral cosigner escape architecture | Multiple-provider protocol, delayed sovereign exit, shutdown/migration, jurisdiction, collusion, and correlated-infrastructure risks are reviewed.                                                                                            |
| GROOT-ASSURANCE-02 | P3       | [#71](https://github.com/grootwallet/groot/issues/71) | Research EU self-custody insurance                    | Counsel and partners validate distribution, underwriting, claims, data, cosigner independence, insolvency, and evidence-pack feasibility before a pilot.                                                                                      |
| GROOT-MARKETS-01   | P4       | [#72](https://github.com/grootwallet/groot/issues/72) | Evaluate optional market integrations                 | P2P exchange, lending, Liquid swaps, submarine/chain swaps, CoinJoin, and CoinSwap are assessed separately for custody, privacy, legal, UX, failure, and revenue risk.                                                                        |

Adjacent existing trackers remain authoritative for the local wallet health advisor ([#8](https://github.com/grootwallet/groot/issues/8)), recovery-path health and timelock refresh ([#16](https://github.com/grootwallet/groot/issues/16)), and first-class Liquid support ([#60](https://github.com/grootwallet/groot/issues/60)).

## Explicit exclusions from the near-term business model

- custody, recovery-key escrow, or a Groot-controlled unilateral spending path;
- selling transaction, address, balance, or signer-graph data;
- balance-based fees or mandatory transaction routing;
- proprietary descriptors, backup formats, or PSBT extensions required to exit;
- opaque “yield,” lending, exchange, insurance, or privacy claims;
- a single cosigner or relay represented as resilience.
