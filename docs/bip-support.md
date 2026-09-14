# Bitcoin Improvement Proposal support

The 2026-09-14 stale-multisig-proposal safeguard changes no descriptor, BIP48
key, PSBT serialization or signature verification, backup format, or persisted
schema. It checks a saved proposal's selected outpoints against the current BDK
unspent set before further signing/import/broadcast; accelerator replacements
continue under their separate original-transaction validation. The owner's
reported Sparrow recovery of this exact Mainnet 2-of-3 descriptor, Nova and
Coldcard Mk4 signing, and successful external broadcast adds limited
owner-operated interoperability evidence, not general BIP support or a release
certification pass. Async command dispatch and fee-quote debounce are UI
responsiveness changes only.

The 2026-09-14 presentation follow-up changes no BIP support or evidence:
standard multisig hides the Miniscript-only lab for a native-null recovery
template, public BSMS/Groot export copy is format-specific, and Receive/Send
loading acknowledgement changes no descriptor, address, signer, PSBT,
transaction, or persisted format.

The 2026-09-13 policy-review copy and shared loading-indicator adjustment have
no BIP, descriptor, key-derivation, HWI, PSBT, persisted-format, or protocol
impact. The owner-reported exact `4630bf95` Mainnet policy and Ledger receive
checks are candidate-specific physical UI/device evidence, not new BIP support
or an interoperability-status change.

ADR 0066 changes only Mainnet multisig setup-copy failure handling, in-memory
Core admission order after existing-wallet adoption, and Policy/Coldcard
presentation. It does not change BIP48 keys, descriptors, policy, PSBTs,
interchange, recovery, or supported signer identities. It adds no BIP support
or interoperability evidence; physical retesting remains required.

ADR 0065 changes the timing of BIP48 standard multisig Mainnet admission in the
isolated candidate: an offline public draft may become a watch-only coordinator
after restart, but native address issuance requires a threshold of durable
descriptor-matching policy/first-address proofs plus each Coldcard policy-file
acknowledgement. It changes no BIP48 derivation, descriptor, PSBT, or backup
format and adds no interoperability evidence. Trezor and Coldcard do not count
as interactive-quorum proof in this HWI build, so affected combinations remain
receive-blocked pending certification. The rejected coordinator-PIN signer
checklist remains removed; sequential scans still preserve other unexpired
initial-import admissions. No physical evidence transfers to this candidate.

The 2026-09-12 hardware correction changes no BIP, descriptor, PSBT, backup, or
persisted-wallet semantics. It corrects the HWI 3.2.0 Trezor Safe 3 protocol
model identifiers used by the existing Mainnet BIP84/BIP48 admission gate and
prevents saved-signer scans from erasing other exact, time-bounded admissions in
one BIP48 draft. The old-build physical results remain candidate-specific and do
not raise an implementation or interoperability status.

The approved 2026-09-08 application design refresh has no BIP support or protocol
evidence impact: only local presentation assets/tokens change. Rust, WalletPort,
transaction facts, integer-satoshi formatting, recovery and signer validation,
transport policies and all persisted formats remain unchanged by this refresh.

The 2026-09-08 provenance-query follow-up has no BIP support or evidence-level
impact. It preserves the existing labels, privacy clusters, address-reuse history,
transaction accounting and database format while reducing query work. Protocol,
PSBT, derivation, network and signer behavior are unchanged.

The 2026-09-08 notification/navigation changes have no BIP support-level impact:
wallet/session-bound delivery, worker scheduling, and paged public history DTOs
change neither derivation nor PSBT, RBF/CPFP, recovery, or transport semantics.
Full native wallet state remains authoritative regardless of UI page size.
Existing BIP125/BIP174 regression coverage exercises the shared transaction logic;
no new physical, public-network, Tor, or mobile evidence is implied.

The 2026-09-03 independent-review remediation and isolated mainnet preparation
change evidence, not supported BIP families. BIP84/BIP48 hardware admission is
narrowed for a future mainnet build to trusted hardware identifiers. ADR 0054
accepts HWI's exact Coldcard/Jade family records while keeping certification
model-specific. BIP48 recovery
from Groot and BSMS public backups requires fresh live-HWI admission before a
mainnet profile can be created. BIP174 transaction finalization repeats the
recipient/amount, frozen-input, RBF-original-intent, and descriptor-derived CPFP
ownership checks at the trusted boundary. No persisted descriptor, backup, or
proposal format and no upstream BIP status changed. See
[`security-remediation-2026-09-03.md`](security-remediation-2026-09-03.md).
The subsequent pre-wallet Core-admission interlock changes only backend/storage
authorization order. It does not change descriptors, derivation, PSBT semantics,
backup interchange, or support for any BIP.
ADR 0064 permits creation of an empty descriptor-bound profile before node setup,
but preserves exact-node admission before any Mainnet wallet-data open. Automatic
first-scan defaults, Mainnet setup reuse, and sub-sat/vB fee presentation change
no descriptor, derivation, PSBT, backup, transaction, or interoperability semantics.
The follow-up Mainnet setup-reuse UI, actionable sanitized setup diagnostics, and
collapsed descriptor presentation likewise change no BIP implementation or evidence.
ADR 0055 makes the already reviewed BIP84/BIP48 mainnet parameter row reachable
only in an isolated certification build. This changes network availability, not
BIP semantics or the evidence status of any wallet, signer, or recovery path.
The final-candidate coverage repair replaces constant-folded network test
branches with equivalent compile-time-selected branches and adds boundary
tests; it changes no BIP implementation, descriptor, derivation, PSBT, backup,
or interoperability semantics.
The 2026-09-05 internal-RC correction restores encrypted saved-node reuse during
PIN-only unlock, moves existing-wallet Core preflight back to Overview, removes a
global banner, and corrects ad-hoc HWI packaging. It changes no BIP behavior,
descriptor, derivation, PSBT, backup, or interoperability evidence.
The follow-up authentication-throttle permit fixes a mainnet-only unlock ordering
bug without changing any persisted format or BIP behavior.

Status: canonical implementation and candidate inventory as of 2026-09-02.

This document records which Bitcoin Improvement Proposals (BIPs) Groot implements,
which are only partially implemented or inherited through a dependency, and which
are candidates for later work. It must be read together with
[`implementation-status.md`](implementation-status.md): this matrix describes
standards coverage, while the implementation ledger distinguishes browser fixtures,
Rust behavior, network rehearsal, packaged builds, physical-device evidence, and
independent review.

The canonical BIP texts and their upstream statuses live in the
[`bitcoin/bips`](https://github.com/bitcoin/bips) repository. Bitcoin Core itself
lives in the separate [`bitcoin/bitcoin`](https://github.com/bitcoin/bitcoin)
repository. An upstream status such as **Deployed** or **Complete** does not mean
that Groot implements the BIP.

## Status vocabulary

- **Complete** — implemented for Groot's documented product scope through the real
  Rust/Tauri wallet boundary. It does not imply mainnet or every-platform release
  certification.
- **Bounded subset** — Groot intentionally implements only the named part of the
  BIP. The omitted parts must not be implied.
- **Work in progress** — useful implementation exists, but a documented functional,
  adversarial, interoperability, network, platform, or release gate remains open.
- **Phase 0** — a dependency or parser foundation exists without an exposed end-to-
  end feature.
- **Inherited/conditional** — a pinned dependency or configured Bitcoin Core node
  may implement the protocol, but Groot neither owns nor universally guarantees it.
- **Candidate** — not implemented; any future implementation still requires normal
  product, threat-model, compatibility, dependency, test, and release review.

## Implemented and in-progress BIPs

| BIP                                                                                                                                                                                                                     | Upstream status | Groot status                           | Exact Groot scope and limitation                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki)                                                                                                                                                    | Deployed        | **Complete**                           | Hierarchical master/child keys, account xpubs, origins, derivation paths, and fingerprints for software and multisig wallets. Software creation presents the Rust-derived master fingerprint as copyable recovery identity metadata.                                                                                                                                                                                                                                                                          |
| [39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki)                                                                                                                                                    | Deployed        | **Complete**                           | Exactly 256 bits of native OS entropy produce 24 words. The wallet passphrase is also the BIP39 passphrase. Generation, native recovery entry, descriptor re-derivation, and secret zeroization are implemented. A reviewer successfully restored the exact packaged v0.4.94 Mainnet software wallet from commit `a735fb19` in Sparrow 2.5.4 with matching history and balance; that is reviewer-operated interoperability evidence for this exact wallet and candidate, not a general release certification. |
| [43](https://github.com/bitcoin/bips/blob/master/bip-0043.mediawiki) and [44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)                                                                           | Deployed        | **Bounded structural subset**          | Groot follows the purpose/coin/account/change/index hierarchy through BIP84 and BIP48. It does not implement general BIP44 legacy-P2PKH accounts or multi-account discovery.                                                                                                                                                                                                                                                                                                                                  |
| [48](https://github.com/bitcoin/bips/blob/master/bip-0048.mediawiki)                                                                                                                                                    | Deployed        | **Complete**                           | Native-SegWit multisig account origins use `m/48'/coin'/0'/2'`, with receive and change branches in checksummed P2WSH descriptors.                                                                                                                                                                                                                                                                                                                                                                            |
| [68](https://github.com/bitcoin/bips/blob/master/bip-0068.mediawiki) and [112](https://github.com/bitcoin/bips/blob/master/bip-0112.mediawiki)                                                                          | Deployed        | **Complete for recovery policy**       | Recovery and compatible legacy Inheritance wallets use block-relative `older(n)` Miniscript branches, per-coin maturity tracking, and actual delayed-path spending. Groot does not currently expose general absolute or time-based lock policies.                                                                                                                                                                                                                                                             |
| [77](https://github.com/bitcoin/bips/blob/master/bip-0077.md)                                                                                                                                                           | Draft           | **Phase 0**                            | Payjoin Dev Kit 1.0 is pinned with V2 only. Trusted Rust performs bounded network-checked Payjoin URI inspection, but no sender/receiver UI, protocol traffic, encrypted session persistence, OHTTP transport, fallback workflow, or interoperability claim exists.                                                                                                                                                                                                                                           |
| [84](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki)                                                                                                                                                    | Deployed        | **Complete**                           | Software and external-signer wallets use `m/84'/coin'/0'` `wpkh()` receive/change descriptors.                                                                                                                                                                                                                                                                                                                                                                                                                |
| [94](https://github.com/bitcoin/bips/blob/master/bip-0094.mediawiki)                                                                                                                                                    | Deployed        | **Complete as a build target**         | Testnet4 has a compile-time-isolated native identity, address/key parameters, exact chain checks, Core integration, and HWI selection. This does not enable mainnet.                                                                                                                                                                                                                                                                                                                                          |
| [125](https://github.com/bitcoin/bips/blob/master/bip-0125.mediawiki)                                                                                                                                                   | Deployed        | **Complete**                           | New transactions opt in to replacement. Groot constructs, reviews, signs, persists, broadcasts, and reconciles RBF replacements and their transaction lineage.                                                                                                                                                                                                                                                                                                                                                |
| [129](https://github.com/bitcoin/bips/blob/master/bip-0129.mediawiki)                                                                                                                                                   | Complete        | **Bounded subset**                     | Bounded public four-line BSMS 1.0 descriptor-record import/export, network checks, descriptor parsing, and first-address verification are implemented. Encrypted coordinator/signer setup rounds are not implemented.                                                                                                                                                                                                                                                                                         |
| [141](https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki), [143](https://github.com/bitcoin/bips/blob/master/bip-0143.mediawiki), and [173](https://github.com/bitcoin/bips/blob/master/bip-0173.mediawiki) | Deployed        | **Complete/inherited**                 | P2WPKH, P2WSH, SegWit-v0 transaction signing, and Bech32 addresses are exercised through rust-bitcoin, BDK, Groot descriptors, and Groot PSBT flows.                                                                                                                                                                                                                                                                                                                                                          |
| [157](https://github.com/bitcoin/bips/blob/master/bip-0157.mediawiki) and [158](https://github.com/bitcoin/bips/blob/master/bip-0158.mediawiki)                                                                         | Deployed        | **Work in progress**                   | The optional test-network backend performs confirmed-only discovery with verified headers, filter headers, filters, matching blocks, bounded execution, and atomic BDK application. The public index is memory-only; Core still owns fees, mempool operations, recovery, and broadcast. Adversarial, public-network, real-Tor, packaged, and mobile evidence remains open.                                                                                                                                    |
| [174](https://github.com/bitcoin/bips/blob/master/bip-0174.mediawiki)                                                                                                                                                   | Deployed        | **Complete (PSBT v0)**                 | Creation, Rust-derived review, persistence, partial-signature verification/merge/removal, software and HWI signing, finalization, broadcast, Base64/file exchange, and bounded `crypto-psbt` UR v2 transport are implemented. PSBTv2 is not claimed.                                                                                                                                                                                                                                                          |
| [21](https://github.com/bitcoin/bips/blob/master/bip-0021.mediawiki)                                                                                                                                                    | Closed          | **Complete for in-app QR scanning**    | Receive QR codes emit `bitcoin:<address>`. Single-key and multisig Send scan plain addresses or bounded BIP21 URIs in Rust, enforce the compiled address network, reject unknown required parameters, preserve integer satoshi precision, and prefill supported amount/label/message fields for review. Payjoin-bearing requests remain blocked from silent fallback until the separate BIP77 gates pass. Groot has no operating-system URI handler, and BIP321 has replaced BIP21 upstream.                  |
| [325](https://github.com/bitcoin/bips/blob/master/bip-0325.mediawiki)                                                                                                                                                   | Complete        | **Complete as a build target**         | Signet has a compile-time-isolated identity and exact-chain Core integration. Public-network evidence remains distinct from implementation.                                                                                                                                                                                                                                                                                                                                                                   |
| [329](https://github.com/bitcoin/bips/blob/master/bip-0329.mediawiki)                                                                                                                                                   | Draft           | **Complete for applicable types**      | Native JSONL import/export covers Groot-owned `addr`, `tx`, `output`, and `xpub` subjects with bounded atomic validation. Groot-only intent, policy, provenance, cluster, and replacement history are deliberately not encoded as proprietary records.                                                                                                                                                                                                                                                        |
| [379](https://github.com/bitcoin/bips/blob/master/bip-0379.md)                                                                                                                                                          | Draft           | **Bounded subset**                     | Rust compiles, type-checks, sanity-checks, analyzes, persists, reviews, and spends reviewed WSH key/threshold/block-relative recovery policies. Arbitrary user policy text and delayed-policy USB hardware flows are not supported.                                                                                                                                                                                                                                                                           |
| [380](https://github.com/bitcoin/bips/blob/master/bip-0380.mediawiki)                                                                                                                                                   | Deployed        | **Complete for supported descriptors** | Canonical public descriptors, key origins, wildcards, checksums, descriptor identity, parsing, export, and recovery are central wallet boundaries. Software creation now exposes its authenticated public watch-only descriptor through an explicit copy action with a privacy warning. Unsupported descriptor families are not accepted merely because the dependency can parse them.                                                                                                                        |
| [382](https://github.com/bitcoin/bips/blob/master/bip-0382.mediawiki)                                                                                                                                                   | Deployed        | **Complete**                           | `wpkh()` owns BIP84 singlesig and `wsh()` owns standard multisig and recovery policies.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| [383](https://github.com/bitcoin/bips/blob/master/bip-0383.mediawiki)                                                                                                                                                   | Deployed        | **Complete for `sortedmulti()`**       | Standard multisig uses checksummed `wsh(sortedmulti(...))`. BIP383, rather than the P2SH-specific BIP67, owns the descriptor-level lexicographic key ordering Groot uses.                                                                                                                                                                                                                                                                                                                                     |
| [388](https://github.com/bitcoin/bips/blob/master/bip-0388.mediawiki)                                                                                                                                                   | Complete        | **Partial/indirect**                   | Groot coordinates device-specific policy registration, repeat authorization, and first-address verification through HWI for supported standard multisig devices. It does not natively import/export a BIP388 descriptor template plus key-information vector.                                                                                                                                                                                                                                                 |
| [389](https://github.com/bitcoin/bips/blob/master/bip-0389.mediawiki)                                                                                                                                                   | Draft           | **Complete bounded subset**            | Public descriptor recovery accepts and exports the conventional receive/change `/<0;1>/*` multipath form and verifies it against explicit branches. The software-wallet success screen combines its authenticated receive/change branches into the same checksummed public multipath form. Groot does not expose arbitrary multipath alternatives.                                                                                                                                                            |

## Dependency-level P2P BIPs

The pinned Kyoto/`bip157` stack also uses the following P2P messages or transport
when applicable:

| BIP                                                                                      | Groot status              | Boundary                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [130](https://github.com/bitcoin/bips/blob/master/bip-0130.mediawiki) — `sendheaders`    | **Inherited**             | Used inside the compact-filter dependency, not exposed as a product feature.                                                                                                                           |
| [133](https://github.com/bitcoin/bips/blob/master/bip-0133.mediawiki) — `feefilter`      | **Inherited**             | Parsed by the peer stack. Groot's user-facing fee presets remain authoritative Bitcoin Core RPC results, not this peer message.                                                                        |
| [155](https://github.com/bitcoin/bips/blob/master/bip-0155.mediawiki) — `addrv2`         | **Inherited**             | Peer discovery/address representation inside the compact-filter stack; manual/Tor modes retain Groot's stricter explicit-peer and no-fallback rules.                                                   |
| [339](https://github.com/bitcoin/bips/blob/master/bip-0339.mediawiki) — `wtxidrelay`     | **Inherited**             | Negotiated by the peer stack; Groot does not currently broadcast through this stack.                                                                                                                   |
| [324](https://github.com/bitcoin/bips/blob/master/bip-0324.mediawiki) — encrypted P2P v2 | **Inherited/conditional** | The dependency can use v2 transport when an eligible non-proxy peer advertises support. Groot does not require or certify BIP324 on every route and must not claim universal P2P transport encryption. |

Blockchain Commons UR v2 `crypto-psbt` transport is implemented but is not a
numbered Bitcoin BIP.

## Candidate BIPs

Candidates are ordered by fit with Groot's present architecture, not by upstream
BIP number. They are not commitments.

| Priority                  | BIPs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Candidate scope and prerequisite                                                                                                                                                                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Finish existing work      | **157/158**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Complete the adversarial Kyoto strategy, durable-index decision, Signet/Testnet4 peer-diversity and resource measurements, real-Tor proof, packaged/mobile lifecycle testing, and explicit recovery/broadcast architecture recorded in [`compact-filter-deferred-work.md`](compact-filter-deferred-work.md). |
| Finish existing work      | **77**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Add encrypted append-only Payjoin state, fresh OHTTP transport, sender and receiver state machines, authoritative original-versus-proposal review, explicit fallback consent, restart/adversarial tests, hardware evidence, and independent interoperability.                                                |
| High                      | **129**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Add the encrypted BSMS coordinator/signer rounds if full cross-vendor setup coordination becomes a product requirement.                                                                                                                                                                                      |
| High                      | **388**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Add a native wallet-policy model, upstream test vectors, and descriptor-to-policy conversion rather than relying exclusively on device-specific HWI behavior.                                                                                                                                                |
| High                      | [321](https://github.com/bitcoin/bips/blob/master/bip-0321.mediawiki)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Replace limited BIP21 handling with the current URI standard: exact parameter semantics, required/unknown parameter handling, user authorization, modern addresses, safe OS deep links, and privacy-reviewed proof callbacks if ever supported.                                                              |
| Medium                    | [370](https://github.com/bitcoin/bips/blob/master/bip-0370.mediawiki)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Add PSBTv2 only after checking every supported signer. Preserve PSBTv0 interoperability and Groot's invariant that reviewed transaction fields cannot change when signatures are imported.                                                                                                                   |
| Medium, one program       | [86](https://github.com/bitcoin/bips/blob/master/bip-0086.mediawiki), [340](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki), [341](https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki), [342](https://github.com/bitcoin/bips/blob/master/bip-0342.mediawiki), [350](https://github.com/bitcoin/bips/blob/master/bip-0350.mediawiki), [371](https://github.com/bitcoin/bips/blob/master/bip-0371.mediawiki), [386](https://github.com/bitcoin/bips/blob/master/bip-0386.mediawiki), and [387](https://github.com/bitcoin/bips/blob/master/bip-0387.mediawiki) | Treat Taproot as one coherent wallet, descriptor, PSBT, hardware, backup, recovery, sync, and certification program. Implementing one primitive must not be presented as Taproot wallet support.                                                                                                             |
| Later, after Taproot      | [327](https://github.com/bitcoin/bips/blob/master/bip-0327.mediawiki), [328](https://github.com/bitcoin/bips/blob/master/bip-0328.mediawiki), [373](https://github.com/bitcoin/bips/blob/master/bip-0373.mediawiki), and [390](https://github.com/bitcoin/bips/blob/master/bip-0390.mediawiki)                                                                                                                                                                                                                                                                                            | MuSig2 aggregation, derivation, PSBT fields, and descriptors require mature basic Taproot and hardware interoperability first.                                                                                                                                                                               |
| Medium                    | [322](https://github.com/bitcoin/bips/blob/master/bip-0322.mediawiki)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Generic message signing/verification could support interoperable ownership or policy proofs. It must remain visibly separate from transaction authorization and require exact message review.                                                                                                                |
| Later privacy program     | [352](https://github.com/bitcoin/bips/blob/master/bip-0352.mediawiki), [375](https://github.com/bitcoin/bips/blob/master/bip-0375.mediawiki), [376](https://github.com/bitcoin/bips/blob/master/bip-0376.mediawiki), and [392](https://github.com/bitcoin/bips/blob/master/bip-0392.mediawiki)                                                                                                                                                                                                                                                                                            | Silent Payments require a coherent sending, receiving, scanning, descriptor, PSBT, recovery, provenance, labeling, and privacy design. Compact-filter/light-client consequences require separate review.                                                                                                     |
| Later                     | [353](https://github.com/bitcoin/bips/blob/master/bip-0353.mediawiki)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Human-readable DNS payment instructions require DNSSEC validation, privacy-preserving resolution, spoofing-resistant display, and an explicit network-failure boundary.                                                                                                                                      |
| Monitor Core policy/relay | [331](https://github.com/bitcoin/bips/blob/master/bip-0331.mediawiki) and [431](https://github.com/bitcoin/bips/blob/master/bip-0431.mediawiki)                                                                                                                                                                                                                                                                                                                                                                                                                                           | Package relay and pinning topology may improve robust CPFP/RBF handling. Groot should normally inherit this from its exact Bitcoin Core backend rather than add a second relay implementation.                                                                                                               |
| Monitor                   | [393](https://github.com/bitcoin/bips/blob/master/bip-0393.mediawiki)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Descriptor annotations may eventually carry interoperable public policy metadata, but must not replace BIP329 or Groot's permanent label and provenance history.                                                                                                                                             |

## Reviewed non-candidates

The following nearby wallet BIPs are deliberately not current candidates:

- **BIP37** Bloom-filter SPV has weaker privacy and denial-of-service properties;
  Groot's selected light-client direction is BIP157/158.
- **BIP38** encrypted individual private keys conflict with Groot's BIP39 seed and
  credential-encrypted wallet-envelope model.
- **BIP45, BIP49, and BIP87** are legacy or alternative P2SH/nested/multisig
  derivation schemes; Groot deliberately uses BIP48 native SegWit.
- **BIP47** reusable payment codes add a different notification and recovery model;
  Silent Payments are the more coherent future privacy candidate.
- **BIP69** deterministic transaction ordering is not a privacy target for Groot.
- **BIP70–75** are the legacy payment-protocol family; BIP321 is the candidate URI
  standard.
- **BIP78** Payjoin V1 is intentionally excluded. Groot's PDK build is V2-only and
  must not silently downgrade.
- **BIP85, BIP93, and BIP450** are alternative entropy or backup encodings that
  conflict with the settled 24-word BIP39 recovery model unless separately approved
  as an optional, interoperable backup format.
- **BIP127** proof of reserves is outside Groot's wallet/coordinator mission.
- **BIP128** specifies presigned-transaction timelock recovery, a different
  architecture from Groot's script-enforced Miniscript recovery policies.
- **BIP381, BIP384, and BIP385** specify legacy or deliberately unsupported
  descriptor forms (`pkh`, `sh`, `combo`, `raw`, and `addr`). Dependency parsing
  capability alone is not Groot product support.
- **BIP391** binary output descriptors is closed upstream.
- Mining, Stratum, consensus-deployment, sidechain, and general node-server BIPs are
  Bitcoin Core/miner concerns rather than Groot wallet capabilities. Groot may rely
  on deployed Bitcoin consensus through its node and libraries without presenting
  every consensus rule as an implemented wallet feature.

The internal mainnet RC post-unlock sync-presentation follow-up has no BIP impact.
It changes only how an existing native sync is presented: automatic unlock sync
uses compact progress, while explicit manual refresh retains detailed progress and
later foreground cycles remain quiet. Network access policy, wallet discovery,
descriptors, transaction handling, and interoperability evidence are unchanged.

The internal mainnet RC lock-scheduling and credential-focus follow-up has no BIP
impact. It preserves the existing atomic sync-cancellation and wallet-session rules
while moving their wait off the native UI thread and focusing an existing field.

The internal mainnet RC Receive refresh follow-up has no BIP impact. It exposes an
explicit UI trigger for the existing authoritative sync operation without changing
address derivation, mempool interpretation, descriptors, or interoperability.

The internal mainnet RC sync-coordination, recovery-status scheduling, and Mainnet
explorer follow-up has no BIP impact. It serializes existing sync triggers, moves an
existing read off the native UI thread, and permits an explicit txid-only explorer
lookup without changing wallet protocol behavior or interoperability evidence.

The internal mainnet RC coin-freeze follow-up has no BIP impact. It serializes the
existing persistent spendability mutation against automatic sync and moves its
database work off the native UI thread without changing coin-selection policy,
transaction construction, descriptors, or interoperability evidence.

The internal mainnet RC broadcast-scheduling and acceleration-presentation follow-up
has no BIP impact. It moves existing signing/broadcast/persistence work off the native
UI thread, hides an RBF action that was already ineligible for self-spends, and makes
existing loading and amount-unit presentation explicit without changing BIP125
construction, CPFP policy, PSBT handling, descriptors, or interoperability evidence.

The internal mainnet RC payment-scanner sizing follow-up has no BIP impact. It changes
only the camera viewport and targeting-guide presentation; BIP21 parsing, address
validation, network checks, and imported payment-request data are unchanged.

The internal mainnet RC fee-precision and amount-spacing follow-up has no BIP support
scope impact. It removes unintended whole-sat/vB rounding from existing transaction
construction by using Bitcoin's integer sat/kwu representation consistently, while
preserving authoritative effective-fee review and existing relay-policy failures.
The amount-unit change is presentation-only.

The maximum-spend clarification has no BIP support impact. It adds durable inline
and toast feedback for the existing rule that frozen outputs remain excluded from
transaction construction; no transaction, fee, descriptor, or protocol behavior changes.

The 2026-09-09 RC legibility, transaction-detail, bounded-zoom, recovery-result,
locked saved-network-summary, and direct-HTTPS Mainnet Core changes have no BIP support
impact. The remote service uses the same Bitcoin Core RPC discovery, exact-chain
checks, descriptors, transactions, and recovery semantics as loopback Core. This
widens a transport release policy only; it does not change BIP support or promote
the still-pending remote-endpoint evidence.

The locked public-network-observation cache and transaction-disclosure copy have no
BIP support impact. They persist and render only a previously verified fee rate and
chain height; transaction construction, descriptors, recovery, signing, broadcast,
and protocol interoperability are unchanged.

## Maintenance rule

The 2026-09-08 command-surface and export-validation maintenance has no BIP impact.
The active bounded BIP21 payment-request parser retains its V2-only Payjoin detection
and no-fallback test; an uncalled Payjoin-specific IPC wrapper and its now-dead
specialized parser, DTO, error enum, and duplicate tests are removed. Sharing the
unchanged export filename rules does not alter BSMS, PSBT, descriptor, backup,
transaction, recovery, or interoperability behavior or evidence.

The v0.4.92 sanitized diagnostic event log has no BIP impact. It records only
allowlisted operation categories, outcomes, build/platform context, and coarse sync
metadata; it does not change descriptors, PSBTs, transaction construction,
recovery/backup interoperability, sync protocols, network policy, or supporting
evidence for any BIP. Adding a sanitized receive-address discard category, exposing
only the permanent-label count on generation, and relocating the navigation entry
to Settings likewise have no BIP impact. Renaming the viewer to App logs, retaining
the ordinary shell, and adding renderer-local search, filtering, ordering, raw JSON,
and explicit sanitized-log copy change presentation only and likewise have no BIP
impact. Adding outcome filtering, fixed sanitized failure explanations, structured
pruned-history block heights, and the matching recovery-error presentation does not
change descriptor derivation, recovery inputs, scanning semantics, transaction data,
or any BIP support/evidence and therefore likewise has no BIP impact.

The 2026-09-13 Mainnet send-responsiveness and review-spacing follow-up has no
BIP support or interoperability impact. It moves existing PSBT preparation,
maximum-spend quoting, and coin-selection previews off the native UI thread,
coalesces renderer preview requests during amount edits, and changes only
review-row presentation. PSBT construction, fee selection rules, descriptors,
signing, and protocol data are unchanged.

The subsequent spinner, Policy loading-state, BSMS/Groot JSON export-switching,
and receive-descriptor QR presentation follow-up has no BIP support impact.
Both already-supported public backup commands run under the same app PIN once;
their bytes, parsers, descriptor semantics, recovery checks, and BIP129/BIP380/
BIP389 interoperability evidence are unchanged. The observed Mainnet spend and
confirmation are exact-build owner reports, not new standards certification.

Restoring the already-admitted Mainnet direct-HTTPS Core selector has no BIP
support impact. It changes only Settings presentation of the existing Core RPC
transport; chain identity, wallet discovery, descriptors, and transaction
standards remain unchanged. A browser fixture is not real-node evidence.

Every feature, interoperability, signer, descriptor, transaction, payment request,
backup/recovery, sync/backend, network, or dependency change must assess BIP impact.
If it adds, removes, expands, narrows, or changes evidence for a BIP:

1. update this matrix in the same change;
2. update the owning product, architecture, flow, ADR, implementation-status, test,
   and release documents where applicable;
3. preserve separate upstream and Groot statuses;
4. state whether support is direct, a bounded subset, work in progress, or merely
   inherited through a dependency; and
5. never promote fixture, dependency, Regtest, or physical-device evidence into a
   stronger release claim.

If a change has no BIP impact, its pull request records that explicit assessment.
Upstream status changes alone may update this document without changing Groot's
implementation status.
