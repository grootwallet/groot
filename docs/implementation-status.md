# Current implementation status

This page describes the checked-in `5.2.0-rc03` feedback branch. Public v0.5.1 is authorized only at `c731fa1c` under ADR 0083. Internal candidates do not inherit its release approval.

**Native** means implemented behind Rust/Tauri. **Fixture** means browser demonstration only. Neither is physical-device certification. Exact release/device evidence belongs in the [Mainnet checklist](mainnet-release-checklist.md) and [hardware certification](hardware-certification.md).

## Native capabilities

| Capability                  | Implemented scope                                                                                       | Remaining boundary                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Software wallets            | Native 24-word generation/recovery, deferred backup verification, BIP84, passphrase unlock/signing      | Native secret entry and lifecycle must be certified per platform                                                                    |
| Hardware single-key wallets | Public BIP84 import/export, app PIN, account identity proof, address display, persisted PSBT signing    | Exact model/firmware/platform evidence is required                                                                                  |
| Standard multisig           | BIP48 `wsh(sortedmulti)`, resumable setup, public-key import, PSBT collect/verify/merge/finalize        | Device policy approval and first-address proof remain required                                                                      |
| Backup restoration          | BSMS, Groot JSON and bounded public descriptor text; derives and checks first address                   | PDF is a human-readable export, not a recovery import; encrypted BSMS rounds are absent                                             |
| Labels and coin control     | Immutable one-to-five labels, provenance, reuse, selection, freeze/unfreeze, BIP329                     | BIP329 is metadata interchange, not a wallet backup or live sync                                                                    |
| Recovered label import      | Native ownership derivation and atomic restoration of missing address labels                            | Searches receive indexes 0–9,999 plus already indexed addresses; xpub matches keep current signer names                             |
| Transactions                | Authoritative PSBT review, persistent proposals, software/HWI/file signing, broadcast, RBF and CPFP     | Final native authorization, prevout and original-mempool checks cannot be bypassed                                                  |
| Core sync                   | Configurable local/remote Core, managed Mainnet history, birthday/gap controls, resumable scan progress | Explicit first-history consent; unavailable history never counts as verified balance                                                |
| First-history consent       | Genesis scan after approval; decline opens node connection directly; retry after partial observations   | Automatic sync must not race or bypass consent                                                                                      |
| Compact filters             | Opt-in confirmed-only test-network discovery                                                            | Durable peer cache, platform/privacy/recovery work remains in [deferred work](compact-filter-deferred-work.md); no Mainnet fallback |
| Wallet registry             | Isolated UUID profiles, independent sessions, rename, lock and credential-authenticated deletion        | Unsupported formats remain intact until explicit deletion                                                                           |
| Hardware app PIN change     | Current/new PIN, encrypted verifier and node-secret rotation, wallet lock, interruption rollback        | Hardware-only and multisig; software BIP39 passphrases cannot change                                                                |
| Deletion                    | Worker-based removal; backup acknowledgements after DELETE                                              | Funded software needs tested backup; multisig retains descriptor recovery test; no secure-erasure claim                             |
| UI utilities                | EN/FR/ES, light/dark, discreet mode, zoom, sanitized logs, explicit clipboard, QR/file interchange      | Browser coverage does not certify native dialogs or physical cameras                                                                |
| App releases                | Native GitHub stable detection and signed-manifest preparation; localized offline notes                 | Owner verification key/signatures pending; no automatic installation or public release authorization                                |
| Notifications               | Persisted receipt/confirmation markers and selected-wallet foreground sync                              | No push while the app is terminated                                                                                                 |

## Unavailable or experimental

- Timelocked Recovery and Assisted recovery creation are disabled with **Coming soon**. Existing delayed-policy profiles remain compatible; native compiler/spend tests are not a release claim.
- Decaying/expanding policies are experimental foundations, not supported creation paths.
- Payjoin V2 recognizes requests and rejects unsupported fallback; sender/receiver sessions and transport are not implemented.
- Experimental Windows/Linux x64 packaging is Signet-only, without bundled HWI, native seed UI or passive USB discovery. Builds/CI do not certify physical platforms. iOS and Android public releases are not certified. Passive USB discovery is macOS-only; Windows production HWI verification fails closed.
- Mobile pairing and continuity/Miniscript development live on separate feature branches; their presence is not merged support.
- No cloud backup, custodial key service, Lightning, Taproot wallet, or hosted remote signing service is implemented.

## Maintaining this page

Keep one row per capability. Update it when scope or evidence changes; do not append release diaries or historical test totals. Standards and limitations belong in [`bip-support.md`](bip-support.md). Release authorization remains exact-commit scoped.

Documentation cleanup has **no BIP, API, schema, dependency or runtime impact**. It corrects stale descriptions without extending support.
