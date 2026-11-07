# Product roadmap

Implemented scope is in [current status](implementation-status.md). GitHub [issues](https://github.com/grootwallet/groot/issues) own live priority and acceptance; this page does not duplicate their state.

The current public baseline is the historical **v5.3.0 macOS Apple-silicon desktop release**. ADR 0107 restores the intended pre-1.0 numbering for the next release line.

## Next

- Validate the exact `0.5.4-rc01` candidate with the full automated harness and preserve the frozen public-release approval gate.
- Complete physical iPhone pairing, fixed Continuity/Miniscript and Windows/Linux signer acceptance before expanding support claims.
- Reduce maintenance risk through the [code cleanup plan](engineering-roadmap.md), continuing the small frontend and native ownership extractions already under test.
- Define and test the explicit manual or bridge update from historical `v5.3.0` to final `v0.5.4` before release.
- Sign Windows/Linux packages only after packaging, filesystem, trusted HWI and per-device acceptance. Download signatures do not replace platform or runtime-helper verification.

## Later, separately reviewed

| Work                              | Required before support is advertised                                                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Timelocked recovery/inheritance   | Finish fixed test-network Partner/Family paths, loss/recovery and exact offline signer evidence; Mainnet and legacy Recovery creation remain blocked             |
| Remote signer coordination        | Authenticated end-to-end encrypted enrollment/messages, replay and substitution protection, bounded relay metadata, offline PSBT fallback and independent review |
| Compact-filter expansion          | Close [documented recovery, cache, peer and platform gaps](compact-filter-deferred-work.md)                                                                      |
| Payjoin V2                        | Durable encrypted sessions, transport, exact fresh review, explicit fallback consent and interoperability                                                        |
| Taproot and other standards       | One coherent wallet/signing/backup/recovery program; see [BIP candidates](bip-support.md#candidate-bips)                                                         |
| Optional family/business services | Open interchange and independent recovery; service roles never grant Bitcoin signing authority                                                                   |

The base wallet remains Apache-2.0. Paid or unavailable services must not strand funds or prevent supported local signing and export. No custody, recovery-key escrow, proprietary exit format, mandatory transaction routing or sale of wallet activity. Future services need their own product, privacy, legal and licensing decisions; no proposed price is an implemented product.
