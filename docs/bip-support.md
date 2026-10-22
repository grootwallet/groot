# Bitcoin standards

**Upstream status** and Groot support are separate: each linked BIP owns its current upstream status. This matrix describes the current source, not universal platform or release certification. Native tests, real-Core evidence and exact-device acceptance are distinct.

## Implemented and in-progress BIPs

| BIP                                                                                                                                                                                                               | Groot scope                                                                | Limitation                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki)                                                                                                                                              | HD derivation, origins, fingerprints, xpubs                                | Fingerprint is identity metadata, not a backup                                                                                                                                |
| [39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki)                                                                                                                                              | Native 24-word generation/recovery and exact passphrase                    | Words never cross the webview; native UI certified per platform                                                                                                               |
| [43](https://github.com/bitcoin/bips/blob/master/bip-0043.mediawiki)/[44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)                                                                         | Purpose/coin/account/change hierarchy via BIP84/BIP48                      | No general legacy accounts or multi-account discovery                                                                                                                         |
| [48](https://github.com/bitcoin/bips/blob/master/bip-0048.mediawiki)                                                                                                                                              | Native-SegWit multisig origins and branches                                | Account 0, `m/48'/coin'/0'/2'`                                                                                                                                                |
| [68](https://github.com/bitcoin/bips/blob/master/bip-0068.mediawiki)/[112](https://github.com/bitcoin/bips/blob/master/bip-0112.mediawiki)                                                                        | Block-relative delayed policies; fixed Partner/Family named-path rehearsal | Legacy Recovery creation disabled; test-network continuity only; no certified delayed-policy USB flow                                                                         |
| [77](https://github.com/bitcoin/bips/blob/master/bip-0077.md)                                                                                                                                                     | Payjoin V2 dependency/URI foundation                                       | No session transport, sender/receiver UI or fallback downgrade                                                                                                                |
| [84](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki)                                                                                                                                              | Software/hardware single-key `wpkh`                                        | `m/84'/coin'/0'`                                                                                                                                                              |
| [94](https://github.com/bitcoin/bips/blob/master/bip-0094.mediawiki)                                                                                                                                              | Isolated Testnet4 build/network checks                                     | Not Mainnet approval                                                                                                                                                          |
| [125](https://github.com/bitcoin/bips/blob/master/bip-0125.mediawiki)                                                                                                                                             | RBF proposals, signing, broadcast and lineage                              | Final original-mempool/recipient-preservation checks                                                                                                                          |
| [129](https://github.com/bitcoin/bips/blob/master/bip-0129.mediawiki)                                                                                                                                             | Public four-line BSMS 1.0 backup import/export and first address           | Public desktop backup remains supported; internal Testnet4 candidate restores encrypted enrollment and phone signing, with physical acceptance pending                        |
| [141](https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki)/[143](https://github.com/bitcoin/bips/blob/master/bip-0143.mediawiki)/[173](https://github.com/bitcoin/bips/blob/master/bip-0173.mediawiki) | P2WPKH/P2WSH, SegWit-v0 signing and Bech32 via BDK/rust-bitcoin            | Not Taproot wallet support                                                                                                                                                    |
| [157](https://github.com/bitcoin/bips/blob/master/bip-0157.mediawiki)/[158](https://github.com/bitcoin/bips/blob/master/bip-0158.mediawiki)                                                                       | Kyoto confirmed-only test-network discovery; Core filter matching          | [Deferred recovery/cache/peer/platform work](compact-filter-deferred-work.md); no independent P2P broadcast                                                                   |
| [174](https://github.com/bitcoin/bips/blob/master/bip-0174.mediawiki)                                                                                                                                             | Persisted PSBTv0, signature verification/merge, file/Base64/UR exchange    | Reviewed non-signature fields cannot change; PSBTv2 absent                                                                                                                    |
| [21](https://github.com/bitcoin/bips/blob/master/bip-0021.mediawiki)                                                                                                                                              | Network-checked payment QR address/amount/label parsing                    | Unknown required parameters rejected; Payjoin requests never silently downgrade                                                                                               |
| [325](https://github.com/bitcoin/bips/blob/master/bip-0325.mediawiki)                                                                                                                                             | Compile-time Signet identity and Core integration                          | Public-network/device evidence remains separate                                                                                                                               |
| [329](https://github.com/bitcoin/bips/blob/master/bip-0329.mediawiki)                                                                                                                                             | Bounded atomic addr/tx/output/xpub interchange                             | Groot-only history excluded; receive ownership search 0–9,999 plus indexed records; imports cannot exceed the supported recovery gap; matched xpubs keep current signer names |
| [379](https://github.com/bitcoin/bips/blob/master/bip-0379.md)                                                                                                                                                    | Reviewed WSH policy compiler/analysis foundations                          | Arbitrary policy text and delayed USB unavailable; creation disabled                                                                                                          |
| [380](https://github.com/bitcoin/bips/blob/master/bip-0380.mediawiki)                                                                                                                                             | Public descriptor origins, wildcards, checksums, identity and recovery     | Private keys rejected at public imports                                                                                                                                       |
| [382](https://github.com/bitcoin/bips/blob/master/bip-0382.mediawiki)                                                                                                                                             | `wpkh` and `wsh`                                                           | No general descriptor-family support                                                                                                                                          |
| [383](https://github.com/bitcoin/bips/blob/master/bip-0383.mediawiki)                                                                                                                                             | `wsh(sortedmulti)`                                                         | Derived public-key sorting; descriptor text/checksum may differ while addresses match                                                                                         |
| [388](https://github.com/bitcoin/bips/blob/master/bip-0388.mediawiki)                                                                                                                                             | Device-specific HWI policy approval/first-address proof                    | No native BIP388 template/key-information interchange                                                                                                                         |
| [389](https://github.com/bitcoin/bips/blob/master/bip-0389.mediawiki)                                                                                                                                             | Receive/change `/<0;1>/*` presentation and bounded recovery                | Persisted explicit pairs remain compatible; conflicting branches fail                                                                                                         |

CPFP is package-fee policy, not a standalone implemented BIP. UR is Blockchain Commons transport, not a BIP. Hardware model support requires the [certification matrix](hardware-certification.md).

## Dependency-level protocols

The peer stack conditionally handles BIPs 130, 133, 155, 339 and 324. Groot does not expose these as independent features or promise universally encrypted P2P. Fee presets come from Core, not peer feefilter messages; manual/Tor restrictions remain stricter than dependency defaults.

## Candidate BIPs

| Work                            | Prerequisite                                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| Finish 157/158 and 77           | Close their existing privacy, recovery, persistence, transport and interoperability gaps |
| Full 129/388                    | Product need for encrypted setup/native wallet policies, vectors and cross-device proof  |
| 321 payment URIs                | Bounded parameter semantics, authorization, network checks and privacy review            |
| 370 PSBTv2                      | Preserve PSBTv0 and prove every supported signer                                         |
| 86/340/341/342 Taproot          | Coherent descriptor, signing, sync, backup/recovery and hardware program                 |
| 327/328/373/390 MuSig2          | Mature Taproot plus interoperable aggregate signing/PSBTs                                |
| 322 message proofs              | Explicit message review separate from transaction authorization                          |
| 352/375/376/392 Silent Payments | Complete send/receive/scan/backup/privacy design                                         |
| 353 DNS payments                | DNSSEC, privacy, spoofing and network-failure policy                                     |
| 331/431 package relay           | Prefer inherited exact-Core policy over a second relay implementation                    |
| 393 descriptor identity         | Review against current canonical-descriptor identity before changing formats             |

Candidates are not commitments. Legacy P2SH multisig, arbitrary scripts, Taproot wallets and proposals unrelated to the onchain product are not implied by dependency support.

## Maintenance rule

Update scope and evidence in the same change that changes standards behavior. Check current upstream records then; do not copy an old Draft/Deployed label into a current claim. Preserve parser bounds, network/private-material rejection and interoperability limitations. This cleanup changes no standards implementation or dependency; BIP impact is **documentation only**.

The rc04 update-control layout and native Caps Lock sizing fixes have **no BIP impact** and preserve existing wallet/profile formats.

App release/update preparation (ADR 0086) and 5.2 naming (ADR 0087) have **no BIP impact**: no key derivation, descriptor, transaction, protocol or wallet backup format changes. Experimental platform packaging does not extend physical interoperability evidence.

The 5.2.0 GA version promotion and same-machine reproduction decision (ADR 0088) have **no BIP impact**.

The GA remediation keeps BIP329 records and wallet formats unchanged. It adds an atomic application-level recovery-gap bound to restored address-label imports. The first-history disclosure fix has **no BIP impact**.

The 5.3 iOS foundation (ADR 0089) has **no BIP impact**: native mobile safety gates and isolated build configuration change no derivation, descriptor, PSBT, label or backup format and establish no new physical interoperability evidence.

The 5.3 defect remediation (ADR 0090) changes no BIP support, PSBT encoding, derivation or wallet format. It extends application failure/recovery tests around existing SegWit BIP125/174 paths; it does not add interoperability or physical-device certification. Accessibility, Activity retention, scanner copy and worker scheduling have no BIP impact.

The mobile-key scope correction (ADR 0093) and retained-branch audit change no BIP implementation or current support. Passing BIP129/174 tests on the retained branch are not merged mobile support or physical signing/recovery evidence.

ADRs 0094–0096 restore the retained BIP129 encrypted enrollment and BIP174 QR phone-signing implementation for internal Testnet4 testing, with native first-address/policy checks. Existing backup/PSBT encodings and BIP39 software-passphrase versus phone-signer words-only derivation remain unchanged. Physical interoperability is not established by the local Core pass; see the RC2 candidate record.

## Retained Continuity evidence

Refs #17, ADR 0100: the unified internal candidate extends fixed Partner/Family BIP68/112 coordination to named delayed paths, per-input maturity/reorg checks, role-bound BIP174 signature collection and primary renewal. PSBT uniform block-based CSV identifies the selected delayed path; time-based, disabled or mismatched sequences fail closed. Existing BIP48 origins, descriptor derivation and backup/proposal formats remain unchanged. Test-network creation is available for rehearsal; physical signer interoperability, Mainnet Continuity and phone Miniscript enrollment are not certified. There is no dependency change.

The RC3 mobile footer, notice spacing and first-scan configuration disclosure have no BIP impact. Node authentication, TLS/Tor validation, privacy consent and source-review gates remain unchanged.

The RC4 existing-wallet setup navigation correction has no BIP impact: pairing records, derivation, PSBTs, native key authorization and persisted formats are unchanged.

RC5 backup deferral: no BIP support or wire-format change. BIP39 word verification is optional during phone pairing; the existing verification flag remains false until a successful native check. BIP48 key/policy identity checks and BIP129 invitation binding are unchanged.

RC6: no BIP or wire-format impact from mobile layout/copy, completed-camera cleanup or the Keychain access-policy adjustment in ADR 0097. Credentials and phone-key derivation remain unchanged.

Unlocked mobile screens omit the brand header and start below the system safe area. Sync and backup reminders use compact inline actions with 44px touch targets; recovery verification remains available. This presentation change has no BIP or persisted-format impact.

The Coldcard missing-policy address-error correction changes no BIP support, descriptor, key derivation, PSBT or persisted format. Physical Testnet4 discovery and public-account reads are not a completed signing certification.

RC9 Coldcard Testnet4 runtime packaging (ADR 0098) has **no BIP or persisted-format impact**. The HWI 3.2.0 executable and vendor code, derivation paths, descriptors, policy requirements, PSBT encodings and signature validation are unchanged. Device-free startup measurements add no physical interoperability evidence.

ADR 0099 removes an application-level mainnet rollout amount ceiling and clarifies policy errors. **No BIP or persisted-format impact**: transaction/PSBT encodings, descriptors, derivation, signing, recovery and interoperability are unchanged. Bitcoin supply bounds and final-PSBT fee protection remain enforced.

The fixed-continuity finalizer verifies BIP68/112 constraints against the actual transaction as well as current input age, preventing a later-maturing branch from changing the witness for an earlier selected sequence. This corrects validation with the existing pinned Miniscript library; it changes no descriptor, backup, PSBT encoding or dependency.

The RC10 test-feedback corrections have **no BIP or persisted-format impact**: independent policy/health presentation, shared error notices and per-target nullable fee responses change no derivation, descriptor, PSBT or backup format. The owner's Mk4 Testnet4 one-input timing trial is limited candidate evidence, not full model/firmware, recovery, threshold or broadcast certification.

RC11 operation-scoped Testnet4 transport (ADR 0101) has **no BIP or persisted-format impact**. Full fingerprint/account-xpub proof, vendor signing/display, policy gates, descriptors, PSBT encodings and native signature validation remain required. Host timing and protocol fixtures add no physical model certification.

Shared error-notice consistency after the Jade RC11 trial has **no BIP or persisted-format impact**. Only presentation and browser fixtures change; hardware transport, key reads, policy gates, signing, credentials, descriptors and backups are unchanged. Owner timing samples establish a performance baseline, not full device certification.

Internal RC12 Trezor/Jade Testnet4 runtime acceleration (ADR 0102) has **no BIP or
persisted-format impact**. The pinned HWI driver, derivation paths, descriptors,
PSBT encodings, and native identity/policy/address/signature checks stay the same.
Jade keeps its existing HWI shared test-network mapping for Testnet4. Owner
performance reports are not physical interoperability certification.

The Model One follow-up changes only HWI PIN result handling and fresh-scan retry presentation. It has **no BIP or persisted-format impact**: a typed already-unlocked result still proceeds through the existing live full-account identity check, and derivation, descriptors, PSBTs, signing validation and backup formats are unchanged. Physical repeated-action acceptance remains pending.

RC14 corrects the internal DMG app copy so relative runtime symlinks and the app signature remain intact. It changes no BIP support, transaction or signer protocol, persisted format, derivation, descriptor, PSBT or key material. The mounted DMG must pass the same app-seal verification as the build artifact before handoff.

The Model One repeated-action routing follow-up has **no BIP or persisted-format impact**. It changes when Groot requests the PIN matrix after a recent successful unlock and lets a locked saved-signer health check request that matrix. Every subsequent identity, address and signing operation still reopens the device and checks the full account identity; derivation, descriptors, PSBTs, signatures and backup formats are unchanged.

The sealed internal Mainnet HWI session path has **no BIP or persisted-format impact**. It checks existing BIP84 and standard BIP48 account paths, `xpub` network identity and the explicit HWI Mainnet selector; it changes no descriptor, PSBT, signature, key, wallet file or supported standard. The RC17 scan-progress and hardware-error presentation fixes also have no BIP or persisted-format impact. Public Mainnet packaging remains separately gated.
