# Product roadmap

Implemented scope is in [current status](implementation-status.md). GitHub [issues](https://github.com/grootwallet/groot/issues) own live priority and acceptance; this page does not duplicate their state.

The first production target is a **macOS Apple-silicon desktop release with both software and approved hardware wallets**.

## Next

- Finish the current wallet restoration, first-scan consent, labels, deletion and hardware UX feedback; validate the exact replacement candidate before release.
- Reduce maintenance risk through the [code cleanup plan](engineering-roadmap.md), starting with CSS.
- Deliver the [5.3 mobile plan](mobile-5.3-plan.md): isolated iOS build, authenticated watch-only pairing, receive labels and bounded PSBT review first. Reuse the separate mobile branch selectively. Signing stays blocked pending security, recovery and physical-device evidence.
- Add Windows/Linux releases only after packaging, filesystem, trusted HWI and device acceptance. PGP download signatures do not replace platform or runtime helper verification.

## Later, separately reviewed

| Work                              | Required before support is advertised                                                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Timelocked recovery/inheritance   | Rehearse every spending path, loss scenario, maturity boundary and hardware flow. New creation remains disabled                                                  |
| Remote signer coordination        | Authenticated end-to-end encrypted enrollment/messages, replay and substitution protection, bounded relay metadata, offline PSBT fallback and independent review |
| Compact-filter expansion          | Close [documented recovery, cache, peer and platform gaps](compact-filter-deferred-work.md)                                                                      |
| Payjoin V2                        | Durable encrypted sessions, transport, exact fresh review, explicit fallback consent and interoperability                                                        |
| Taproot and other standards       | One coherent wallet/signing/backup/recovery program; see [BIP candidates](bip-support.md#candidate-bips)                                                         |
| Optional family/business services | Open interchange and independent recovery; service roles never grant Bitcoin signing authority                                                                   |

The base wallet remains Apache-2.0. Paid or unavailable services must not strand funds or prevent supported local signing and export. No custody, recovery-key escrow, proprietary exit format, mandatory transaction routing or sale of wallet activity. Future services need their own product, privacy, legal and licensing decisions; no proposed price is an implemented product.
