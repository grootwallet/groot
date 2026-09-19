# Implementation status

The application-wide readability follow-up raises shared supporting copy to 13
pixels, removes remaining sub-12-pixel non-print copy, strengthens secondary-text
contrast in both themes, and increases the hierarchy of wallet, transaction,
coin, settings, hardware, and recovery rows. Long optional backup-format guidance
now follows the standard blue chevron disclosure while page-level subtitles are
shorter. The compact desktop wallet list scrolls the selected wallet into view on
launch and after selection. Wallet behavior, security consequences, native
commands, persisted formats, dependencies, and protocol support are unchanged;
no migration is required. The reviewed Mainnet source-policy hashes are refreshed
only for the UI-only Settings and diagnostics subtitle changes; their wallet and
network behavior is unchanged.

The Mainnet hardware-signing presentation follow-up keeps the existing Ledger
policy and transaction authorization boundary while reducing the policy modal
to its security-relevant values and one action. Hardware-address details retain
the exact grouped address, intended label, copy control, and one spacing note
without duplicating comparison guidance. The shared desktop modal layer now
re-anchors after window and fullscreen resizing so its internal scroll body and
actions remain reachable. No wallet data, native command, signing behavior,
persisted format, dependency, or protocol support changes; no migration is
required.

The multi-network onboarding header now keeps global Settings reachable when the
selected network has no wallet profiles. This closes the empty-namespace trap in
which the shell correctly opened onboarding but provided no route to the
restart-bound network selector. The Settings page continues to expose only app
preferences and network selection until a wallet is unlocked. No wallet data is
moved, copied, opened, or migrated; persisted formats, native commands,
dependencies, transaction behavior, and BIP support are unchanged.

The rejected Mainnet multisig coordinator-PIN live-signer checklist remains
removed. Standard multisig creation no longer depends on a 15-minute
process-memory HWI admission, so a validated saved draft can become an offline
watch-only coordinator after restart. Rust now rejects a new Mainnet multisig
receive address until at least the spending threshold has durable matching
interactive policy/first-address proof and each Coldcard policy file has its
separate acknowledgement. The receive form links an unmet gate to Policy.
Trezor and Coldcard cannot count toward the interactive quorum in this candidate;
such signer combinations remain receive-blocked until a reviewed device path
exists. External-signer and recovery admission are unchanged. No persisted
format changes or physical certification evidence transfer; exact packaged
restart/resume and funding tests are still required (ADR 0065).

The 2026-09-12 hardware follow-up corrects two Mainnet-candidate blockers found
on older internal build `v0.4.94 · 27f821be`. HWI 3.2.0 identifies Trezor Safe 3
revisions as `trezor_t2b1`/`trezor_t3b1`, not `trezor_safe_3`; the trusted
allowlist now admits those exact revisions while continuing to reject other
Trezor models. Saved-signer discovery no longer destroys the other exact,
time-bounded admissions accumulated for one multisig draft, and a successful
live policy/address proof renews only the proven signer. No renderer metadata can
create admission. Shared dialogs now portal through the existing reusable modal,
the shared loading animation is namespaced, and hardware setup copy names only
the release-target models with network-correct Ledger instructions. No persisted
format, migration, dependency, command, descriptor, or PSBT behavior changes.
The exact old-build evidence and required corrected-build repetition are in
[`hardware-certification-mainnet-2026-09-12.md`](hardware-certification-mainnet-2026-09-12.md).

The approved 2026-09-08 design refresh applies locally bundled Source Sans 3,
Blue Ink/ivory light and dark semantic tokens, shared radii and readable supporting
type across existing application routes and reusable components. Wallet operations,
native secret-entry sheets, startup timing and backup print output are unchanged.
No persisted format or network/dependency change is introduced. Browser evidence
and physical-webview limitations: [`design-refresh-2026-09-08.md`](design-refresh-2026-09-08.md).

The subsequent 2026-09-08 query follow-up combines indexed provenance reads,
removes a redundant output-lineage lookup, and replaces correlated address-reuse
recounts with one grouped calculation that skips unchanged row writes. Frozen
read/reconciliation oracles, corruption and rollback fixtures, and query-plan and
statement budgets protect the same persisted results. No schema, transport,
dependency, BIP behavior or production UI change is introduced. See
[`provenance-query-follow-up-2026-09-08.md`](provenance-query-follow-up-2026-09-08.md).

The 2026-09-08 navigation follow-up binds notification read/ack to wallet UUID
and ephemeral unlock-session identity, invalidates stale frontend delivery work,
and removes notification latency/failure from snapshot and broadcast completion.
Native Overview returns recent-three activity plus complete pending accounting;
native Activity filters/sorts the complete transaction history and exposes bounded,
revision-bound cursor pages without constructing receive/coin/suggestion DTOs.
RBF/CPFP quotes and saved external-signer reads run on blocking workers. Overview
secondary details and Send public signer identity no longer wait behind unrelated
reads. The 1.8-second startup gate is unchanged. These are shared Rust/frontend
paths, not a claim of mobile or physical-hardware certification. No persisted
format, dependency or network transport changes; no migration or BIP support-level
change. The two new read endpoints bring the registered command count to 133.
Evidence and remaining performance work are recorded in
[`navigation-performance-2026-09-08.md`](navigation-performance-2026-09-08.md).

The 2026-09-08 maintenance follow-up removes two registered native commands with no
current caller: the legacy Payjoin-specific inspection wrapper superseded in Send by
the general bounded payment-request parser, and a standalone mainnet-admission clear
wrapper whose cleanup remains owned by every relevant lifecycle path. The active
V2-only payment-request parser and its Payjoin detection test remain; its dead
specialized DTO/parser and duplicate tests are removed, and no Payjoin transport or
session is enabled. Export filenames now share one private validator for the unchanged length,
path, NUL, trimming, and allowlisted-extension rules. Registered native commands
decrease from 133 to 131. Persisted formats, dependencies, UI behavior, wallet and
network policy, transaction behavior, and BIP support/evidence are unchanged; no
migration is required.

The 2026-09-08 simplification follow-up removes the unused generic `airgap`
multipart decoder. It had no command registration, adapter call, production
caller, persisted representation, or documentation-owned product behavior; the
active animated-QR implementation remains the bounded `crypto-psbt` UR transport
and retains its multipart ordering, redundancy, CBOR, PSBT, and resource tests.
The same follow-up gives permanent-label, multisig-signer, and hardware-signer
renaming one pure whitespace-normalization helper while preserving their distinct
bounds and stable errors. No command, dependency, capability, DTO, persisted
format, protocol behavior, or BIP support/evidence changes; no migration is
required.

The 2026-09-06 contract-maintenance follow-up preserves fourteen existing native
error codes that previously normalized to `internal_error` in the frontend.
Source-contract and mocked-IPC adapter tests cover the allowlist, including the
existing explorer, label-interchange, export, hardware-context, and proposal
failures. The architecture guide explains wallet-operation locking and intentionally
repeated review/release checks while preserving the release-pinned Rust sources.
Native validation, signing, scheduling, diagnostics
redaction, and persisted formats are unchanged; no migration or BIP support/evidence
change is introduced. The remaining audit work is sequenced in
[`code-quality-plan-2026-09-06.md`](code-quality-plan-2026-09-06.md).

v0.4.92 adds a trusted, app-scoped diagnostic event log for wallet lifecycle,
sync/recovery scans, transaction preparation/signing/broadcast, receive generation,
eligible-address discard and hardware verification, coin freeze state, backup/recovery operations, network
configuration, and diagnostic export. Rust uses a fixed allowlisted schema and
stable-error redaction; no renderer-authored strings enter records. The user-facing
feature is **App logs**. It remains entered from its standalone Settings section,
preserves the regular unlocked shell navigation, and exports deterministic JSON or
CSV. The page can search all safe fixed-field context, combine closed event-type
and outcome filters, reverse date order, switch between an aligned table and the exact
sanitized JSON, and explicitly copy the current JSON result. Allowlisted failures add
a fixed safe explanation and closed scalar context. Pruned recovery failures include
the requested birthday, required anchor, earliest retained full block, and earliest
usable birthday in the app log and durable modal error; raw backend strings remain
excluded. The complete allowlisted category
inventory is collapsed as optional insight. Receive generation shows label count
without label text. The log is a separate
owner-only append-only JSONL file capped at 16 MiB, so wallet, registry, proposal,
backup, descriptor, node-setting, and secret-envelope formats are unchanged and no
migration is required. This has no BIP support impact.

This ledger prevents prototype UI from being mistaken for production wallet behavior. “Implemented” means wired through the real Tauri adapter; “browser fixture” means deterministic UI behavior only.

The canonical inventory of implemented, partial, inherited, in-progress, and
candidate Bitcoin Improvement Proposals is
[`bip-support.md`](bip-support.md). Any feature or dependency change that alters
BIP support or its evidence updates that matrix and this ledger together.

The current internal mainnet RC preserves decimal and sub-1 sat/vB custom rates
through normal single-signer, multisig, maximum-spend, and delayed-policy
preparation instead of rounding them to whole sat/vB. The shared amount renderer
also uses a structural unit spacer across review, detail, signed, and broadcast
success surfaces so native WebView styling cannot collapse the amount/unit gap.
No persisted format or migration changes.

The same RC makes the existing maximum-spend invariant explicit after selection:
single-key and multisig sends identify the result as the maximum spendable amount
and state when frozen coins remain excluded. Transaction construction and frozen
state are unchanged; no persisted format or migration changes.

The first signed/notarized mainnet certification run of v0.4.92 commit
`c7406209` authenticated a fully synchronized, pruned, loopback Bitcoin Core
node and created a BIP84 Ledger external-signer profile, but exposed an
Overview routing defect before any history scan or funds were used. Overview
unconditionally queried the cross-wallet network-setup reuse API even though
mainnet deliberately rejects that API, so it replaced the valid retained
per-wallet Core setup with a false **Wallet data is unavailable** state. A
manual refresh could then reach normal sync without the authoritative snapshot
and surface `initial_scan_required` instead of the first-scan chooser. Overview
now skips cross-wallet setup discovery on mainnet and treats a successful
Rust-gated wallet-data read as proof that the selected wallet retained its own
authenticated Core setup. The existing snapshot then opens the required
birthday chooser and prevents ordinary sync from bypassing it. This is a
presentation/orchestration correction only: the trusted admission, encrypted
RPC secret, descriptors, profiles, databases, transactions, and recovery
formats are unchanged, no migration is required, and BIP support is unaffected.
The `c7406209` signed candidate is failed diagnostic evidence and must not be
distributed or relabeled; fresh final-commit reproducibility and signing evidence
remain required.

Internal mainnet RC `ab73515a` confirmed that the Overview correction reaches
the mandatory first-history-scan chooser and that the retained loopback Core
configuration still authenticates successfully. It also exposed a separate
pruned-node scanner defect before any block, transaction, balance, or funds
were applied: a new scan always gave BDK a genesis checkpoint, causing BDK to
request the full genesis block even when the chosen birthday was near the
current tip. A pruned Core correctly returned `Block not available (pruned
data)`, which the app misleadingly translated as a connection failure. New
scans now anchor at the block immediately before the chosen birthday, reject a
birthday at or below the prune boundary because that anchor is unavailable,
and translate Core's pruned-block response to the stable actionable
`node_history_unavailable` error. Existing wallet/profile data and failed scan
records remain compatible; retrying creates a fresh authoritative scan record.
No migration is required. This changes neither descriptors nor standards
support, so the BIP matrix is unaffected. `ab73515a` is internal diagnostic
evidence, not a distributable release candidate; the corrected exact commit
passes the pinned `pnpm validate` suite, Clippy with warnings denied, 399
non-ignored Rust tests, and all 12 isolated funded/descriptor Regtest cases.
Exact-diff review and live repetition against the retained mainnet pruned range
remain required.

Final-candidate preflight now compiles the mainnet release-policy branches only
into the dedicated mainnet build and the fail-closed rejection branches only
into rehearsal builds, instead of retaining both sides of a constant `cfg!`
condition in every binary. The source-policy tripwire pins and regression tests
were updated to require that exact conditional-compilation boundary. Network
identity and wrong-network-key tests likewise select their expected branch at
compile time, and focused frontend/Rust cases cover mainnet multisig inputs,
wallet-choice button semantics, BSMS address validation, and empty cosigner
identities. All four native network targets compile, and the classified Rust
coverage gate is again above its unchanged 99% line, 100% function, and 97%
region floors. Mainnet behavior, rehearsal behavior, persisted formats,
descriptors, transactions, recovery semantics, and BIP support are unchanged;
no migration is required. Because these source/test changes postdate the sealed
`2110eaf` evidence, fresh independent unsigned builds of the eventual exact
final commit remain required.

v0.4.92 is the post-v0.4.91 security-remediation source line. It closes the code and documentation dispositions from the independent baseline review of commit `2832acbb2f9aac3ed1b4079f70dd74d7277b2291`: future-mainnet exact-model HWI admission, final broadcast and RBF intent checks, frozen RBF/CPFP construction, expiring source-wallet authorization, recovery xpub network checks, cancellation-atomic policy evidence, credential zeroization, v2 migration failure handling, package-signing verification, deterministic SBOM ordering, and mutation-resistant release tripwires. It also discloses copied-profile offline guessing during onboarding. No persisted format changed and no migration is required. ADR 0055 now permits a separately isolated, non-distributable mainnet certification candidate; v0.4.91 package and physical evidence stays historical, and mainnet release remains blocked. Details: [`security-remediation-2026-09-03.md`](security-remediation-2026-09-03.md) and [`mainnet-closing-review-2026-09-03.md`](mainnet-closing-review-2026-09-03.md).

The final reproducibility correction removes the Apple hardware-family suffix
from unsigned `BUILD-INFO` while retaining exact macOS product/build, arm64,
Xcode version/build, Apple Clang version/target, SDK, source, network, HWI,
configuration, lock, and language-toolchain identities. Strict comparison still
requires the executable, SBOM, recorded digests, and corrected metadata to be
byte-identical. The earlier `18d888e5` Build A is superseded diagnostic evidence.
Independent `8d38f617` builds then exposed absolute Cargo-registry paths with
different local usernames in the executable despite identical `BUILD-INFO`;
that campaign is also failed diagnostic evidence. Independent `b2f680bd` builds
removed every physical path but differed in only the content-derived Mach-O
`LC_UUID` and its dependent linker-generated ad hoc-signature page hash.
Independent `6aad2584` builds proved Apple ld additionally incorporates the
host's ambient `RC_UUID_SALT`. Independent `1371f376` builds then had that
variable absent on both hosts but still differed in exactly all 16 UUID bytes
and the dependent 32-byte linker ad hoc-signature page hash; removing signatures
and neutralizing UUIDs on disposable copies again made the complete payloads
byte-identical. All three UUID campaigns are failed diagnostic evidence. The
builder now owns encoded Rust remapping for the checkout, Cargo home, and Cargo
target, rejects external Rust flags, clears `RC_UUID_SALT`, requests Apple ld's
reproducible mode, derives a stable retained UUID from the finished pre-signature
Mach-O payload, recomputes the existing ad hoc CodeDirectory code hashes, passes
strict signature verification, and rejects any executable retaining checkout,
Cargo-home, Cargo-target, or user-home paths. The Regtest default-cookie fallback is now
compiled only for Regtest; public-network builds fail closed if that unreachable
fallback is invoked instead of embedding `CARGO_MANIFEST_DIR`. Supported runtime
behavior, persisted formats, descriptors, protocols, migrations, and BIP support
are unchanged; this release-tooling correction has no BIP impact. The unsigned builder also activates Tauri's production
`custom-protocol` feature, aligning the compared raw executable with the mode
used by the packaged application and avoiding Tauri's development-only embedded
configuration-parent path.

Fresh Machine A and independent Machine B builds of frozen detached commit
`2110eaf0afd0339754c1b9bbba31011c66aa3d69` passed on the exact macOS 26.6.2,
Xcode 26.1.1, SDK 26.1, Node 24.19.0, pnpm 11.13.1, repository Rust 1.97.1,
and Tauri CLI 2.11.4 environment. All four evidence-file hashes and retained
UUID `4BE90441-1EF6-373F-B2C0-2982D591703B` matched. Each machine passed the
builder validation and a second complete `pnpm validate`, reported 74 frontend
files/366 tests plus 46 quantified Node release/quality tests, produced a
strict-valid ad hoc/linker-only arm64 executable and a matching CycloneDX 1.6
SBOM with 539 unique locked components, retained a clean detached worktree, and
found no physical path in evidence. The independent unsigned reproducibility
gate is complete; mainnet distribution remains blocked by the other open rows
and ADR 0012. Exact sanitized evidence and deviations are recorded in
[`reproducible-mainnet-builds-2026-09-04.md`](reproducible-mainnet-builds-2026-09-04.md).

The isolated mainnet-enablement line closes the three audited command boundaries
for the non-distributable ADR 0055 certification candidate. Standard multisig recovery from
Groot or BSMS public backups now reconciles every signer against a recent live-HWI
admission before any mainnet profile directory or database is created; recovered
device metadata is derived from the admission rather than trusted from the backup.
Guided delayed/recovery Miniscript backups remain recoverable on test networks but
are rejected before profile creation on mainnet, preserving the standard-BIP48-only
first-release scope.
Final mainnet CPFP validation requires one descriptor-derived wallet output. ADR
0061 admits either loopback HTTP or direct HTTPS Core before any genesis RPC while
still rejecting remote plaintext, Tor/onion, Esplora, and automatic fallback.
Test-network behavior and every persisted format are unchanged; no
migration is required. The follow-up Core-admission branch now requires a typed
Rust-owned permit at both SQLite constructors, binds existing-wallet admission to
the selected wallet and exact saved Core configuration, consumes new-wallet
admission once, and covers every included creation/recovery path with symmetric
rollback. Mainnet distribution and ordinary use remain blocked; this boundary still
requires independent human sign-off and enabled-path evidence. Coldcard Mk4 and Jade Classic remain the
model-specific certification targets while ADR 0054 explicitly accepts HWI
3.2.0's exact family-level runtime identities.

v0.4.91 makes the native package version and short source commit available from one shared, keyboard-focusable copy control in the sidebar, every shell-less setup and recovery flow, and Settings. Copy feedback is both inline and toasted, while failure remains explicit. The shared component reads only the existing public runtime identity and does not expose wallet, device, node, or profile data. Desktop 1180×780 and mobile 390×844 browser-prototype inspection covers the sidebar, onboarding, and Settings placements without horizontal overflow. Exact packaged Testnet4 commit `0849375d` then passed the reviewer-operated identity visibility and copy check across those three placements. Registry v1 and every persisted wallet, proposal, backup, network-settings, and secret-envelope format remain unchanged; no migration is required. The broader physical lifecycle evidence remains bound to exact packaged v0.4.90 commit `c6d0d5d2`.

The same exact v0.4.91 source commit `0849375d` now has a Developer ID signed and Apple-notarized macOS arm64 Testnet4 package. Groot and its bundled HWI 3.2.0 helper carry the same Developer ID team, hardened runtime, and secure timestamps; the stapled app passes deep strict verification, offline ticket validation, Gatekeeper assessment, and a real packaged `hwi --version` launch. Because HWI is a PyInstaller one-file executable, its helper-only signature has the explicitly approved `com.apple.security.cs.disable-library-validation` entitlement so its authenticated embedded Python runtime can load after extraction; Groot itself does not have that entitlement. The signed HWI digest is compiled into Groot, and the fresh 539-component SBOM binds the signed Groot executable and exact source commit. A reviewer then launched the exact repository artifact without an unidentified-developer warning and confirmed its displayed `v0.4.91 · 0849375d` identity. The same package physically discovered a previously certified signer through its bundled HWI, derived its authoritative public identity, rejected duplicate creation, and opened the existing wallet. A subsequent non-spending check matched a newly revealed Testnet4 receive address exactly between Groot and that signer's trusted display. The reviewer then completed one disposable Testnet4 payment with a previously certified signer: the pre-sign review matched, the bundled HWI returned a valid signature, Bitcoin Core accepted the finalized transaction, and a complete app restart plus sync preserved confirmed outgoing activity, the reviewed fee, remaining balance, label, and accounting. This focused candidate-specific pass retains no wallet, signer, transaction, address, or node identifier. It does not transfer the broader physical lifecycle results from v0.4.90, provide independent review, or establish mainnet readiness.

v0.4.90 corrects three presentation and startup findings from the packaged v0.4.89 software-wallet Testnet4 run. Setup warnings retain visible separation from each other and from the first credential field; the shared amount component gives BTC and sats units explicit inline separation on software, external-signer, and multisig authorization surfaces; and Overview reads the authoritative selected profile before dispatching wallet-kind-specific queries, avoiding a false unsupported-wallet toast while the shell refreshes after creation. Registry v1 and every persisted wallet, proposal, backup, network-settings, and secret-envelope format remain unchanged; no migration is required.

The software-wallet creation result returns the public BIP32 master fingerprint, authenticated public receive/change descriptors, and whether the protected network setup was copied. Groot presents the fingerprint through the shared readable-identifier copy control and keeps the checksummed BIP389 multipath watch-only descriptor plus its privacy warning behind the standard **View more details** disclosure. Creation now completes the native network-copy attempt before committing/publishing the profile and before the success screen can navigate to Overview, closing the race in which Overview could read a selected wallet before its node setup and protected RPC secret existed. A failed or stale source still produces a valid offline wallet with one setup action. Mainnet Overview and Settings now expose the same protected setup reuse already authorized natively: a manual retry opens the reuse dialog when another saved source exists, otherwise it opens Core configuration. Setup-copy failure records a sanitized diagnostic event, and stable missing-admission/storage/source codes no longer collapse to `internal_error`. No persisted wallet, registry, backup, proposal, network-settings, secret-envelope, or version-1 diagnostic schema change is required. This changes BIP32/BIP39/BIP380/BIP389 presentation and records reviewer-operated Sparrow 2.5.4 recovery evidence for exact packaged v0.4.94 commit `a735fb19` in `docs/bip-support.md`.

The software-wallet fingerprint label includes the shared accessible insight tooltip. Its optional localized explanation identifies the fingerprint as public recovery-check metadata and states that it cannot restore the wallet or spend bitcoin. This is presentation-only, has no further BIP support impact, and changes no persisted format or migration requirement.

Software-wallet creation now transitions immediately from the credential form to the fingerprint confirmation after the native wallet command succeeds, before optional network-setup adoption. The earlier diagnosis that this transition was absent was incorrect: the actual mainnet failure occurred earlier, when duplicate-wallet detection opened existing local databases for public descriptor identity and incorrectly demanded a live Core admission. Offline exact-identity inspection is now explicitly limited to read-only public descriptors and no longer requires Core; selected-wallet data reads remain admission-gated. This repair changes no wallet data, BIP support, or persisted format.

The software-wallet protection step now contains one compact acknowledgement: keep the exact passphrase with the backup, it cannot be reset, and a different value opens a different wallet. The copied-profile sentence and the deferred-backup card are absent here; Overview and Settings retain the persistent unverified-backup reminder. The field hint is limited to validation guidance. This presentation-only simplification changes no credential policy, BIP support, wallet data, or persisted format.

The current follow-up corrects hardware-wallet duplicate identity and routing. Rust now treats only an exact canonical public receive descriptor as the same wallet, scans every same-network profile's authoritative wallet database, and retains the eight-character descriptor checksum solely as an integrity check. Distinct wallets with a checksum collision can coexist; true duplicates return the authoritative existing wallet UUID, and the UI selects only that profile instead of navigating to whichever wallet was previously active. Network-setup reuse remains downstream and independent. The desktop sidebar also shows the native package version and short source commit before unlock, startup fails closed if native/web version or network identities disagree, and release builds refuse a missing, malformed, or checkout-mismatched commit identity. A physical Testnet4 follow-up exposed that Bitcoin Core emitter failures bypassed the existing sanitized RPC boundary and that one transient request stopped a fresh history scan. Core block and mempool emission now retries transient transport failures a bounded number of times, maps exhaustion to the stable network error, and has an English presentation backstop against raw internal messages. A failed first scan no longer describes the genesis checkpoint as verified balance history. Registry v1 and every persisted wallet, proposal, backup, and network-settings format remain unchanged; no migration is required.

The current follow-up makes self-transfer hardware comparison explicit. When Rust proves that the recipient is wallet-owned, the proposal DTO now includes the integer-satoshi sum of every PSBT output controlled by the selected wallet. Review & sign presents that authoritative value as **Consolidating** beside the existing fee-only wallet-debit explanation; external-recipient proposals omit it. This additive DTO does not change any persisted profile, wallet, proposal, registry, backup, or interchange format and requires no migration.

v0.4.77 gives a successful BIP329 JSONL export the same macOS **Show in Finder** success-toast action as Groot's other file exports. Rust returns only the existing short-lived, single-use saved-file capability and display label alongside the record count; the selected path remains inside the trusted native boundary. Cancellation and non-macOS results contain no reveal capability, and reveal failure uses the existing durable error toast. No persisted or interchange format changes.

v0.4.76 fixes the packaged BIP329 export failure exposed when an original RBF payment confirmed before its already-broadcast replacement. Permanent payment labels were correctly retained on both transactions, but export recognized only a missing original as coherent history and falsely rejected the missing replacement as an orphan. Rust now validates both exact members symmetrically through the broadcast proposal and acceleration record, applies the same proof to previously wallet-owned outputs and additive imports, and includes explicit output assignments in deterministic export. Unrelated transaction/output identifiers remain fail-closed. No persisted format or migration changes.

v0.4.75 makes the v0.4.74 RBF detail treatment progressive: the default card contains only **Fee increased** and a short honest outcome, while one **View fee increase details** disclosure reveals the full visual journey, identifiers, fee rates, and accounting explanation. The Rust DTO and every persisted profile, wallet, proposal, registry, backup, and interchange format are unchanged; no migration is required.

v0.4.74 models an RBF conflict set as one payment row in Overview and Activity while preserving its complete visual lineage in transaction details. The canonical replacement is the representative when it wins; a confirmed original is the representative if it wins the race; and the broadcast replacement represents the payment while pending. An additive Rust-owned DTO carries both transaction references, available authoritative fee rates, and the honest outcome without changing persisted profile, wallet, proposal, registry, backup, or interchange formats.

v0.4.73 reconciled persisted RBF broadcast intent with BDK's later canonical graph, but its original-winner presentation removed the useful detail timeline and its replacement-winner path still exposed the superseded version as a second accounting row. v0.4.74 supersedes that presentation model.

v0.4.72 makes replacement accounting visual semantics explicit: the active replacement keeps its normal sent amount, while only the superseded original is muted and struck through in Activity and details. BIP329 export now retains immutable transaction and wallet-output labels for a coherently completed RBF even when BDK omits the superseded conflict from its current graph; unrelated orphan mappings still fail closed. The label modal's additive-import explanation uses the same supporting typography as other modal guidance. No persisted profile, wallet, proposal, registry, backup, or interchange format changes; no migration is required.

v0.4.71 refines the transaction-detail replacement history introduced in v0.4.70. Details now lead with a compact earlier-to-newer fee-increase journey, preserve both visible transaction identifiers as `prefix…suffix`, and keep the accounting explanation optional. The same presentation is responsive at desktop and mobile sizes and leaves full transaction identifiers available only to the existing copy action. v0.4.70 corrected the RBF decimal-target defect, added portable BIP329 label interchange, and moved packaged explorer actions behind the native allowlisted opener. Browser fixtures prove UI orchestration only; Rust and isolated Core tests own wallet truth.

v0.4.69 distinguishes an RBF replacement rate below BDK's required minimum from an insufficient wallet balance. The native boundary now returns `fee_rate_too_low` with a concise instruction to choose a rate above the original transaction's replacement minimum, and the frontend recognizes the complete existing acceleration-error family instead of collapsing those codes to `internal_error`. Shared receive-address verification copy is shorter while preserving exact trusted-display comparison and Coldcard's automatic-return/no-approval semantics. The Coldcard Mk4 certification ledger records the packaged v0.4.68 USB interruption/rescan, activity-ordering, and CPFP evidence without claiming the still-open RBF, negative-PSBT, recovery, or independent-review rows. No persisted wallet, profile, proposal, registry, backup, payment-draft, or signer-identity format changes; no migration is required.

v0.4.68 makes every explicit hardware scan a fresh HWI discovery, so disconnected devices disappear and a reconnected signer can be discovered without reopening the payment. It also persists a stable local observation time for unconfirmed transactions whose BDK update lacks one, keeping newly broadcast activity ahead of older pending entries across sync and restart. These changes preserve the existing opaque capability, fresh identity verification, transaction accounting, and persisted schema boundaries.

v0.4.67 adds Command/Ctrl+L as an immediate native-desktop lock for only the selected wallet. Once accepted, it prevents concurrent wallet selection, cancels coordinated hardware and sync work, and invokes the unchanged native lock command before presenting the unlock route. The existing Settings reference shows it only on native desktop, while startup, onboarding, lock, navigation, text entry, dialogs, repeated key events, browser prototypes, and mobile platforms remain inert. Focused policy, shell-ordering, localization, and desktop/mobile browser-prototype regressions cover the boundary. No credential, secret, persisted format, DTO, stable error, Rust command, dependency, or mobile behavior changes.

v0.4.64 fixes the Testnet4 hardware-wallet Overview race exposed by a fresh Coldcard Mk4 Bitcoin Core scan. Saved hardware-health and multisig policy-verification reads now join the serialized blocking wallet-operation boundary before opening SQLite, so they cannot perform database-open checkpoint maintenance beside a sync write transaction. Core block and mempool fetching now stages BDK changes in memory before opening the short atomic SQLite transaction, and Overview reports scan progress relative to the wallet's persisted checkpoint instead of appearing indefinitely stuck. Navigation and automatic-lock expiry request cancellation of any native foreground scan; expected `sync_cancelled` and `wallet_locked` transitions route quietly instead of emitting stacked sync, activity, and coin errors. Network-setup reuse still copies only protected connection settings—not wallet checkpoints, history, labels, or scan state. Persisted wallet/profile/proposal/registry/backup/payment-draft/network-settings formats, public DTO shapes, signer identity handling, dependencies, and stable errors are unchanged; no migration is required.

v0.4.63 keeps an explicitly selected maximum payment synchronized with its native drain quote. Changing an active Max payment's preset or custom fee rate now requests a fresh native maximum for that exact recipient, rate, and coin selection, then atomically replaces the displayed amount and fee; asynchronous responses are still discarded if any quoted input changed. Manually editing the amount exits Max mode, so later fee changes never overwrite a user-entered amount. Single-key and multisig desktop/mobile acceptance tests characterize the amount reduction and authoritative fee at a changed custom rate. The Rust transaction builders, integer-satoshi accounting, PSBT review derivation, persisted wallet/profile/proposal/registry/backup/payment-draft formats, IPC DTOs, dependencies, and stable errors are unchanged; no migration is required.

v0.4.62 fixes maximum-amount payment review for single-key and multisig wallets. The native drain preview already returned its exact integer-satoshi amount and fee, but both Send forms discarded that fee and re-applied a generic form estimate; when transaction weight differed, the valid maximum appeared to exceed the spendable balance and **Review payment** stayed disabled. Send now retains the authoritative non-persisted quote only while its recipient, amount, fee rate, and exact coin selection still match, ignores stale asynchronous responses, and falls back to the ordinary estimate after any edit. Malformed native quotes fail closed. The Rust transaction builders, PSBT review derivation, persisted wallet/profile/proposal/registry/backup/payment-draft formats, IPC DTOs, dependencies, and stable errors are unchanged; no migration is required.

v0.4.61 corrects the v0.4.60 Coldcard Testnet4 receive-address assumption. The earlier `bcrt1` response was caused by the Mk4 being configured for Regtest, not by a required HWI compatibility encoding. Testnet4 verification again presents the canonical `tb1` address and requires the freshly authenticated Coldcard to return that exact address; a script-equivalent Regtest response now fails closed as a device-network mismatch. The transient `hardwareDisplayAlias` DTO field and its synthetic comparison copy are removed. Coldcard address display is documented accurately as display-and-dismiss: firmware returns the displayed address automatically and offers no approve/reject decision, so Groot checks the returned address exactly while the user may independently compare the trusted display. Existing Regtest aliases for documented device families remain unchanged. No persisted wallet, profile, proposal, registry, backup, pairing-record, secret-envelope, node-settings, dependency, or stable-error format changes; no migration is required.

v0.4.60 attempted to accommodate a packaged Testnet4 Coldcard Mk4 BIP84 single-key mismatch by exposing and accepting a script-equivalent `bcrt1` address. Subsequent physical review established that the device had been configured for Regtest. v0.4.61 removes that incorrect cross-network behavior.

v0.4.59 makes Coldcard Mk4 fingerprint verification actionable during hardware-wallet onboarding. The public-data review keeps its explicit confirmation because Mk4 firmware 5.6.1 can display the eight-character Master Key Fingerprint under **Advanced/Tools → View Identity**, and an optional disclosure now gives the exact comparison steps plus a fail-closed stop instruction for any mismatch. Ledger, Trezor, BitBox02 Nova, file-import, and generic signer review semantics remain unchanged. Release tooling also requires the fresh package SBOM to bind the exact source commit, lockfiles, and built executable digest. No persisted wallet, profile, proposal, registry, backup, pairing-record, secret-envelope, node-settings, IPC, DTO, dependency, or stable-error format change.

v0.4.58 closes three focused gaps found during packaged Trezor Model One Testnet4 signing. Proposal DTOs now identify a wallet-owned recipient and its PSBT key-origin paths from Rust's authoritative script ownership, so every review calls out a self-transfer and states that only the network fee leaves the wallet. Transaction signing alone receives a bounded ten-minute device-review window; discovery remains 90 seconds and other selected-device interactions remain five minutes. Starting or continuing a hardware action after idle-session expiry closes the hardware overlays and routes directly to wallet unlock instead of leaving an authenticated-looking screen with an inline lock error. No persisted wallet, proposal, registry, profile, backup, or payment-draft format changes.

The app shell now also observes native session expiry independently of background sync, including on Settings and Send, while allowing an already-active hardware transaction review to finish before routing to unlock. The automatic-lock selector uses the application sans-serif typography and a larger native control target. This follow-up does not change persisted wallet, proposal, registry, profile, backup, or payment-draft formats.

v0.4.57 corrects the packaged Ledger retry path found during partial-PSBT certification. A fingerprint-less locked device is associated with the active proposal only when one eligible saved signer matches its family; ambiguous same-family choices fail closed and require unlock plus rescan. This keeps Ledger's authoritative saved policy reference in the two-step review before signing. Closing either signing review while HWI is waiting now gives immediate modal-attention and on-device rejection guidance, then closes only after the terminal device response. PSBT save suggestions add the authoritative signature count (`-s0`, `-s1`, `-s2`, and so on), so repeated exports of one proposal remain distinct. These are UI/export-name changes only; persisted wallet, proposal, registry, profile, backup, and payment-draft formats are unchanged.

v0.4.56 makes every completed Send intent restart-safe for software, external-signer, and multisig wallets. Entering Amount & fee now waits for an authenticated native write of one bounded public-only draft inside the selected wallet directory; Overview and Send reload that draft after a full process restart and wallet unlock. Preparing the authoritative PSBT clears the draft and preserves the existing persisted-proposal lifecycle. This is backward-compatible: the optional versioned `payment-draft.json` file is additive, owner-only, and contains no credential, private key, PSBT, device path, or hardware prompt state; wallet databases, registries, proposals, profiles, and backups are unchanged. The instrumented hardware-cancellation test fixture allows up to 15 seconds to start under full-suite load; production hardware deadlines and cancellation behavior are unchanged.

v0.4.52 preserves a completed Send intent across in-app route changes for software, external-signer, and multisig wallets. Returning from Coins resumes the same Intent or Amount & fee stage with recipient, permanent labels, amount, fee choice, and still-eligible manual selection restored; Overview exposes the existing resume callout before a PSBT exists. Drafts are volatile, wallet-scoped renderer state, contain no credentials or hardware state, clear when an authoritative proposal is prepared, and disappear when the app process ends. No persisted format changes.

v0.4.51 keeps keyboard focus inside every tokenizing payment/receive label input when plain Tab commits a typed label. Blank Tab continues normal forward navigation, Shift+Tab continues normal reverse navigation without committing the draft, and Enter/comma/semicolon retain their existing commit behavior. No persisted format changes.

v0.4.50 makes frozen funds explicit on both single-key and multisig Send amount steps. When any wallet coin is frozen, the spendable balance is followed by the frozen amount and a **Review frozen coins** link to Coins, where unfreezing remains an explicit confirmed action. Groot never silently changes coin eligibility. No persisted format changes.

v0.4.49 adds a deliberately small, navigation-only desktop shortcut set and a platform-aware reference under Settings → App appearance. Command on Apple platforms and Ctrl elsewhere opens Overview, Activity, Coins, Settings, Receive, or Send; shortcuts cannot submit, sign, broadcast, discard, or lock, and remain inert during startup, onboarding, lock, text entry, and dialogs. The shared shortcut definition drives both behavior and presentation. No persisted format changes.

v0.4.48 gives the native startup identity enough time to read without exposing wallet state early. The existing canonical SVG lockup now reveals once from left to right over 900 ms and remains on the trusted-session gate for about 1.8 seconds; reduced-motion users see the static vector mark for the same brief gate. Browser-prototype startup remains immediate, route navigation never replays the animation, and no wallet, profile, proposal, registry, or network-settings format changes.

v0.4.47 fixes the packaged Testnet4 freeze captured while automatic Core history sync owned the wallet-operation lock and an external-signer proposal read waited synchronously on the native window thread. External-signer proposal reads now use Tauri's blocking worker pool, and source-level scheduling coverage includes all three wallet proposal readers. The authoritative database was verified to retain the spendable unconfirmed output reported as unavailable by the interrupted UI load. No wallet, profile, proposal, registry, or network-settings format changes.

v0.4.46 aligns the Privacy & history help controls directly beside their definition labels with consistent spacing and matching vertical bounds. The existing accessible hover, focus, and touch tooltip behavior is unchanged, and the compact layout remains aligned at desktop and mobile widths.

v0.4.45 applies the shared accessible label-tag treatment across every wallet-label surface without changing persisted formats. Transaction rows and details, receive requests and address details, active-payment callouts, coin selectors and provenance, multisig coin timelines, and resumed recipient verification now preserve and display their complete authoritative label sets as tags. Signer, device, and wallet identities remain ordinary text. Desktop and mobile regressions cover transaction details and receive-address details, including discreet-mode masking.

v0.4.44 clarifies label copy and repairs saved-payment resumption without changing persisted formats. User-facing fields and headings now say **Label**, while receive creation explains plainly that up to five reusable labels can be added and cannot be changed later. Truncated recent-label suggestions expose their complete text on hover or keyboard focus. Overview resume links carry the exact active proposal ID; software, external-signer, and multisig Send restore that proposal, and multisig immediately restores its recipient, full label set, amount, and review stage without depending on optional signer-policy metadata reads. Desktop and mobile regression coverage verifies the tooltip and multisig resume journey.

v0.4.43 restores complete multi-label presentation without changing persisted formats. Single-key and multisig receive hero cards now show every address assignment already visible in their awaiting-payment rows. Advancing Send commits a valid trailing label to the token array, preserving the complete set when returning from Amount & fee. Transaction, hardware-signing, cancellation, and resume reviews render the authoritative proposal labels as accessible compact tags. Desktop and mobile regression coverage verifies the receive hero, Send Back path, and both software and multisig review surfaces.

The post-v0.4.42 size and maintainability audit makes adapter selection a compile-time build decision. Standalone browser builds retain the deterministic fixture, while Tauri bundles contain only the native adapter and cannot silently fall back to fixture behavior. The native release profile now uses ThinLTO, one code-generation unit, and stripped symbols; runtime optimization, persisted formats, wallet behavior, and the packaged HWI trust boundary are unchanged. Measurements and intentionally deferred refactors are recorded in [`code-size-maintainability-audit-2026-08-26.md`](code-size-maintainability-audit-2026-08-26.md).

The post-audit `wallet.rs` decomposition now isolates deterministic error translation, recovery-scan persistence and gap enforcement, and append-only address/signer verification evidence in dedicated sibling modules. Command signatures, DTOs, SQL schemas and statements, error codes and text, authenticated state access, persistence formats, signing behavior, and hardware-wallet behavior are unchanged. Existing unit, adversarial, restart, funded-Regtest, and performance evidence continues to exercise those private seams through the same trusted commands and helpers.

v0.4.42 caps newly submitted manual Receive and Send assignments at five labels in both the renderer and Rust boundary while preserving existing and provenance-derived records with larger label sets. The shared token field is slightly shorter, its hover/focus remove glyph is smaller and exactly centered, and the control now fades in without a scale or one-pixel growth effect. Single-key and multisig flows retain the same immutable schema-v3 assignments and label reuse behavior.

v0.4.41 polishes the shared Send/Receive label-token interaction without changing persisted data. Empty-input Backspace now selects the final token before a second press removes it, token removal floats over the token only on hover or focus without reserving awkward inline space, and the prior-label strip is limited to four calm single-row suggestions. Its height remains reserved while typed filtering has no match, preventing the receive modal and send flow from jumping.

v0.4.40 replaces the detached multi-label chip row and separate Add action with one compact Wasabi-style token input across software and multisig Send/Receive. Selected labels remain inside the field, Enter/Tab/comma/semicolon commit typed text, hover or keyboard focus reveals removal, touch keeps removal available, and removing a reused token restores it to the suggestion list. The v0.4.39 schema-v3 persistence model is unchanged.

v0.4.39 allows one to twelve immutable permanent labels on each new receive request or payment intent. Selected suggestions become removable chips and disappear from the suggestion list; the first label remains the rollback-compatible primary label while an additive schema-v3 table preserves the rest. Existing addresses, proposals, transactions, provenance, labels, and wallet databases remain intact. Change provenance is mixed only when distinct source clusters are joined, not merely because one source has several descriptive labels.

v0.4.38 fixes the intermittent long Overview skeleton captured during Testnet4 wallet switching. Automatic Core sync no longer races the first persisted-snapshot read at unlock or immediately after selection for the serialized wallet-operation lock. Selection stops and cancels the previous wallet's sync before committing the target, the target route paints cached state first, and network refresh resumes on the next bounded interval. Returning the app to the foreground and explicit refresh remain immediate. Persisted wallet, registry, proposal, BDK, node-secret, and sync-source formats are unchanged.

v0.4.37 fixes the repeated CPU and SQLite cost exposed by fully scanned Testnet4 wallets. BDK's persisted local chain now retains a bounded recent window, periodic deep-reorg checkpoints, and every transaction-anchor height instead of reloading roughly 150,000 redundant consecutive checkpoints on each ten-second refresh. Sparse checkpoints are a native BDK representation; deep reorgs remain recoverable and confirmed transaction anchors remain authoritative. Wallet switching also waits for Rust's atomic selection result before changing the routed wallet kind, preventing a watch-only page from opening against the previously selected profile. Existing databases compact compatibly on first open; schema and wallet, profile, proposal, node-secret, and sync-source formats are unchanged.

v0.4.36 fixes the remaining native-window stall exposed when switching away from a multisig wallet during its first historical scan. Durable notification reads and acknowledgements now move their serialized wallet-lock wait and SQLite work to Tauri's blocking worker pool, completing the same scheduling boundary already used by wallet selection, snapshots, and proposal reads. Notification delivery semantics and persisted wallet, profile, proposal, node-secret, and sync-source formats are unchanged.

v0.4.35 fixes a native-window stall exposed while copying a protected Bitcoin Core setup into a multisig wallet during its first historical scan. Active single-key and multisig proposal reads now move their serialized wallet-lock wait and SQLite work to Tauri's blocking worker pool. Network-setup adoption continues to request foreground-sync cancellation before waiting for the operation lock, so the copy remains atomic while the macOS event loop stays responsive. Persisted wallet, profile, proposal, node-secret, and sync-source formats are unchanged.

HWI 3.2.0 performs all-backend discovery even when given a device-type selector. Groot therefore executes exactly one aggregate `enumerate` for each explicit user scan, validates and deduplicates the response, caches all valid paths behind opaque short-lived capabilities, and filters each caller afterward. Callers coalesced into the same native discovery generation receive the same redeemable capability, while a later scan revokes it. A process-wide bounded coordinator blocks discovery during interactive work, includes queue time in absolute deadlines, cancels queued and running native work on modal close/navigation/wallet switch, and fails excess work with stable errors. Cached paths are hints only: health, display, policy, and signing operations freshly match type, fingerprint, derivation, and complete saved account xpub under the same lease as their action. Dynamic HWI values use stdin rather than argv, and only Rust can persist a hardware-health result under a revalidated wallet-operation guard.

The bundled HWI 3.2.0 boundary is intentionally limited to standard multisig.
Guided Recovery and legacy Inheritance keep their implemented Rust policy,
maturity, proposal, and offline PSBT flows, but USB enrollment, policy/address
display, and signing fail closed before device discovery. BitBox02, Ledger, and
Jade are firmware candidates rather than supported delayed-policy integrations;
Coldcard and Trezor are unsupported for that family. See ADR 0044.

| Capability                                                           | Browser fixture                                                                                                                                                                                                                                                                                                                                                                         | Rust/Tauri                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Automated evidence                                                                                                                                                                                                                                                                                                                                                                                                                   | Release status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 24-word create/recover/unlock                                        | Yes, including private reveal, optional immediate verification, persistent deferred-verification CTA, authenticated native re-presentation before deferred proof, and optional bounded coin/dice entry                                                                                                                                                                                  | OS CSPRNG is mandatory; Rust validates and domain-separates optional physical outcomes before mixing; macOS native generated/re-presented-word display and exact-order challenge; deferred verification freshly authenticates and marks verified only after proof; words never cross IPC                                                                                                                                                                                                                                                                                                                                | Rust entropy/mixing/credential/envelope/registry-migration tests; frontend supplemental-input/order/defer/later-verify/re-presentation contract tests                                                                                                                                                                                                                                                                                | Regtest functional on macOS; iOS/Android native challenge and platform certification pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Secret-bearing platform surfaces                                     | Explicit copy actions for public wallet/transaction data only                                                                                                                                                                                                                                                                                                                           | Write-only centralized clipboard with typed byte bounds; no production logging/telemetry sink; deny-by-default CSP and minimal capability set; generated words remain native-only                                                                                                                                                                                                                                                                                                                                                                                                                                       | Permanent source/configuration gate plus clipboard policy units                                                                                                                                                                                                                                                                                                                                                                      | Automated boundary green; signed-app crash/accessibility/screen-capture/clipboard-lifecycle inspection pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Single-key balance/activity/UTXOs                                    | Yes                                                                                                                                                                                                                                                                                                                                                                                     | Yes, BDK + Core RPC; typed self-spends expose the fee debit without a false counterparty                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Unit and UI E2E; Rust classification unit                                                                                                                                                                                                                                                                                                                                                                                            | Regtest functional                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Label provenance and single-key/multisig coin select/freeze/unfreeze | Typed known/mixed/unknown provenance, reusable prior-label suggestions, address-reuse status, source transaction/payment/change lineage, three automatic strategies, exact manual inputs, live Rust privacy summary, authoritative funding-review warnings, discreet metadata masking, and a one-time first-assignment recovery panel for an observed unlabeled multisig receive output | Version-2 normalized stable label entities with immutable exact assignments, exact output and transaction-input lineage, durable cluster links, atomic v1 preservation/backfill/sync, fail-closed corrupt mappings, Rust/BDK Balanced/More-private/Lower-fee selectors using descriptor weights/effective values, persisted exact-input/freeze boundaries, an exact persisted Lower-fee versus More-private fee comparison, and an exact-output-bound command that atomically creates missing used-address metadata plus its first immutable receive assignment                                                         | Migration idempotence/rollback/preservation, cross-origin normalized reuse and suggestion ordering, exact multi-output wallet graph, inheritance/cluster/corruption, one-time observed-output assignment/relabel/change boundaries, locked/profile isolation, signed fee-delta, seeded selector, Unicode-boundary, confidentiality gate, funded RBF/CPFP/reorg/restart/recovery, and desktop/mobile route tests                      | Regtest functional; issue #9 automated acceptance complete, with physical signer certification tracked independently                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Labeled receive/discard/QR/copy/details                              | Yes                                                                                                                                                                                                                                                                                                                                                                                     | Yes, including transactional recovery-gap enforcement before reveal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Policy/UI E2E; Rust derivation-gap boundary unit                                                                                                                                                                                                                                                                                                                                                                                     | Regtest functional                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Single-key prepare/sign/broadcast                                    | Yes, including Receive-address round trip, change review, Overview draft resumption, and warning-confirmed cancellation                                                                                                                                                                                                                                                                 | Yes, persisted restart-safe PSBT, active-proposal listing/cancellation, auto or exact inputs, exact intent/fee, wallet-owned-change, and internal change-gap validation                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Network-prefix, resume/cancel, and wrong-PIN E2E; restart/list/corruption, hostile-output, and change-gap Rust tests                                                                                                                                                                                                                                                                                                                 | Regtest functional; software proposals use the same visible resume and destructive-confirmation lifecycle as external-signer and multisig proposals                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| External-signer single-key wallet                                    | Yes, cable fixture plus descriptor/file flows, PIN-authorized public descriptor export, durable address-specific verification status, active-proposal resumption, local signature discard, and wallet-scoped latest device-health result                                                                                                                                                | Yes, BIP84 public-only descriptors, throttled PIN verifier for export and signing, exact descriptor-database identity revalidation, bounded saved-device BIP84 fingerprint/path/xpub health checks, durable latest-result replacement per signer, native bounded backup save, persisted HWI/file PSBT signing, exact-revision local signature removal, on-device receive display where supported, and append-only timestamped address-verification events restored after restart                                                                                                                                        | Parser/export-round-trip/adversarial/address/identity Rust units, including BIP84 health identity, latest health-result replacement, proposal/signature-discard, and verification persistence; desktop/mobile resume journey E2E                                                                                                                                                                                                     | Regtest functional; physical matrix pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Software-wallet secret and descriptor integrity                      | Native generation, backup verification, recovery entry, unlock, and signing                                                                                                                                                                                                                                                                                                             | Generated and recovered words never enter the webview; new creation requires 16 passphrase characters without composition rules while exact historical recovery remains compatible; native recovery bounds input before Rust allocation and clears native/Rust copies; decrypted envelope payloads, recovery credentials, and legacy derived keys use RAII zeroization across fallible paths; both BIP84 descriptors are re-derived at unlock and matched on every database open; session bindings clear on lock/expiry; portable v3 Argon2id/AES-GCM envelopes have no mandatory platform-keystore dependency          | Entropy, passphrase-boundary, portable-envelope, wrong-credential, authenticated v2 migration, descriptor mismatch, native presentation, recovery-boundary, and exceptional-path zeroization checks                                                                                                                                                                                                                                  | macOS native recovery implemented; other platforms still fail closed pending native recovery UI and packaged lifecycle certification; cross-platform Argon2id calibration remains a mainnet blocker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Single-key delete                                                    | Yes                                                                                                                                                                                                                                                                                                                                                                                     | Yes, credential + typed confirmation + symlink-safe tombstone removal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Filesystem unit + UI E2E                                                                                                                                                                                                                                                                                                                                                                                                             | Regtest functional; no flash-erasure claim                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Multisig policy validation and resumable creation                    | Yes                                                                                                                                                                                                                                                                                                                                                                                     | Yes; one bounded owner-only public draft restores policy/signers/verification/backup progress, excludes credentials and device paths, revalidates descriptors/evidence, and supports explicit discard                                                                                                                                                                                                                                                                                                                                                                                                                   | TypeScript orchestration plus Rust schema, duplicate/impossible-state, and secret-surface tests                                                                                                                                                                                                                                                                                                                                      | Implemented                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| BIP48 `wsh(sortedmulti)` descriptors                                 | Yes preview                                                                                                                                                                                                                                                                                                                                                                             | Yes, checksummed and BDK-parsed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Rust canonicalization/address tests                                                                                                                                                                                                                                                                                                                                                                                                  | Implemented                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Coordinator PIN + watch-only persistence                             | Yes                                                                                                                                                                                                                                                                                                                                                                                     | Yes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Rust build/test/Clippy; setup E2E                                                                                                                                                                                                                                                                                                                                                                                                    | Implemented                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Manual/SD public-key import                                          | Yes                                                                                                                                                                                                                                                                                                                                                                                     | Yes validation at preview/create; bounded public JSON parser                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Parser adversarial units; duplicate and setup E2E                                                                                                                                                                                                                                                                                                                                                                                    | Manual and mounted-file flow implemented; vendor matrix incomplete                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Desktop HWI enumerate/readiness/xpub/sign/address/policy verify      | Shared device discovery/review, bounded scans, exact-path operations, durable address evidence, PIN-first Trezor choice, and Rust-supplied Regtest display aliases                                                                                                                                                                                                                      | Every operation re-reads and verifies saved identity. Direct device responses contribute only cryptographically verified partial signatures to Groot's untouched canonical PSBT; returned transaction and metadata fields are discarded. Discovery is cached for at most 15 minutes and exact-path operations stay bounded. macOS public-network packages resolve only their bundled HWI and verify its compiled digest, code signature, and containing app seal before every spawn; production builds also pin the Developer Team ID. External public Unix HWI retains pinned provenance and root-owned path ancestry. | Process/readiness/ambiguity/address/policy/key-origin/Nova-model/PSBT normalization tests; bundled-path and package-tamper tests; desktop/mobile E2E; exact-model physical records                                                                                                                                                                                                                                                   | Core campaigns pass for Coldcard MK4, Ledger Nano S Plus, Trezor Model One, original BitBox02, and original Jade. Safe 3 firmware 2.12.3 passes its local Regtest USB and clean-profile recovery campaign, with package/public-network and independent-review rows open. BitBox02 Nova firmware 9.26.3 on HWI 3.2.0 passes its funded local Regtest BIP84/BIP48 USB core campaign under self-review, including exact-model import, policy/address proof, rejection/retry, canonical signing, restart, Ledger wrong-device rejection, duplicate/foreign/one-sat-mutation rejection, USB interruption/retry, threshold broadcast/accounting, and independent clean-profile Groot JSON recovery with the source preserved and reopened intact. Nova remains release-open because cold-cache reset was not isolated from the shared BitBoxApp cache and Testnet4/package/independent-review/Whisper rows remain. |
| File PSBT/backup exchange                                            | Yes                                                                                                                                                                                                                                                                                                                                                                                     | Bounded Rust validation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Unit + desktop/mobile E2E                                                                                                                                                                                                                                                                                                                                                                                                            | Functional                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| BIP129/BSMS and public descriptor recovery                           | Deterministic fixture                                                                                                                                                                                                                                                                                                                                                                   | Yes, bounded public four-line BSMS import/export plus BIP-389 multipath, explicit receive/change, and standard receive-only descriptor recovery                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Rust canonical/network/private-material/address-syntax/branch-consistency/derived-address tests                                                                                                                                                                                                                                                                                                                                      | Standard sortedmulti functional; encrypted BIP129 rounds not implemented                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| UR/animated QR/camera PSBT exchange                                  | Yes, including bundled local QR-symbol decoder                                                                                                                                                                                                                                                                                                                                          | Bounded `crypto-psbt` UR v2 encode/decode with complete BIP174 parsing before webview return                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Rust hostile/duplicate/out-of-order frame and malformed-PSBT units; animated-frame desktop/mobile E2E; physical camera pending                                                                                                                                                                                                                                                                                                       | Functional with file/text fallback; desktop/mobile camera certification pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Pending transaction acceleration                                     | Yes                                                                                                                                                                                                                                                                                                                                                                                     | RBF and CPFP create one idempotently resumed persisted authoritative PSBT per original/method; BDK changes, proposal, and lineage commit atomically; each RBF conflict set materializes as one accounting row plus an outcome-aware detail timeline                                                                                                                                                                                                                                                                                                                                                                     | Forced rollback proves no partial lineage or consumed change index; focused original-winner/replacement-winner row-collapse regressions; a disposable Core 31.1 test crosses production preparation/resumption, sequential signature import, restart, finalization, rejection-safe broadcast, persisted replacement lineage, and CPFP package rate; an independent BDK/Core test adds reorg, mempool restoration, and reconfirmation | Regtest implementation and funded Groot workflow evidence complete; physical signer/Testnet4 rehearsal remains                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Birthday/gap-limit/full rescan                                       | Yes, including explicit first-scan choice, unverified pre-scan presentation, block progress, cancellation, lock-safe continuation, and retry                                                                                                                                                                                                                                            | Persisted bounded controls; credential-authenticated asynchronous Core rescan; one active run per wallet; run-id-guarded per-block checkpoints; matching-checkpoint resume with safe birthday restart fallback; normal Core sync blocked until the first verified observation                                                                                                                                                                                                                                                                                                                                           | Rust bounds/progress/resume/terminal/reopen units; scheduler first-scan-state unit; known-history Core birthday/gap recovery; 65-payment/121-address extended-gap fixture under 30 seconds; clean file-backed descriptor recovery/reopen; desktop/mobile cancel/retry journey                                                                                                                                                        | Automated native trusted-boundary evidence complete; packaged Testnet4 first-scan, inactivity-lock continuation, restart-resume, and independent clean-storage evidence remain                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Remote Core TLS/Tor                                                  | Per-wallet direct/Tor settings with explicit errors                                                                                                                                                                                                                                                                                                                                     | HTTPS with platform certificate validation; v3 onion hostname sent only inside bounded loopback SOCKS5; encrypted RPC password; exact chain check; no fallback                                                                                                                                                                                                                                                                                                                                                                                                                                                          | URL/auth policy units; inspected SOCKS hostname/no-fallback/rejection/timeout tests; direct auth/timeout/TLS-handshake/wrong-chain matrix                                                                                                                                                                                                                                                                                            | Automated boundary green; real VPS certificate and network-level DNS observation pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Foreground live sync and notices                                     | N/A                                                                                                                                                                                                                                                                                                                                                                                     | Selected-wallet single-key/multisig BDK sync, durable unique receipt/confirmation markers; fixed 35-second post-attempt cadence; route-independent scheduler; coalesced wake-ups without overlap                                                                                                                                                                                                                                                                                                                                                                                                                        | Scheduler cadence/overlap/error/restart units; route-lifecycle source checks; Rust snapshot-event and notification persistence units                                                                                                                                                                                                                                                                                                 | Regtest functional while unlocked app is running; exact-package Mainnet route/cadence retest pending; terminated background delivery out of scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Multisig receive/sync/balance                                        | Yes                                                                                                                                                                                                                                                                                                                                                                                     | Yes, separate BDK database + labels; saved descriptors/xpub metadata require an unlocked selected wallet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Descriptor address unit test; desktop/mobile route E2E                                                                                                                                                                                                                                                                                                                                                                               | Regtest functional                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Multisig PSBT collect/merge/finalize/broadcast                       | Yes, pre-funded 2-of-3 demo wallet                                                                                                                                                                                                                                                                                                                                                      | Yes, persisted PSBT + HWI/import merge; every ECDSA partial signature is verified against its real input sighash before count or mutation                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Real-sighash valid/forged/no-mutation Rust tests, ready-made-wallet E2E, pinned Bitcoin Core 31.1 CI broadcast, desktop/mobile E2E                                                                                                                                                                                                                                                                                                   | Regtest functional; physical-device certification remains in progress                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Multisig export/recovery/delete                                      | Yes, branch copy, BSMS/JSON download, and native-save PDF QR sheet                                                                                                                                                                                                                                                                                                                      | Yes, credential-authorized checksummed public backup + first-address drill                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Rust tamper/round-trip tests and desktop/mobile lifecycle E2E                                                                                                                                                                                                                                                                                                                                                                        | Regtest functional; PDF output is WebKit-rendered, path-private, and unencrypted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Recovery/inheritance Miniscript                                      | Yes: unified configurable Recovery creation; compatible legacy Inheritance wallets; plain-language per-coin authority state; optional wait restart; and recovery/heir-key sweep                                                                                                                                                                                                         | Rust compiler and descriptor persistence; authoritative maturity DTO; additive alert, notification, chain-observation, and proposal-path tables; one-input primary self-spend or delayed-key external sweep; path-specific signer validation and broadcast-time reorg check                                                                                                                                                                                                                                                                                                                                             | Boundary/hostile/restart/reorg units; desktop/mobile/localized/stale-tip and both-action E2E; funded deterministic Core Regtest with independent ages, reopen, backward reorg, re-maturity, isolated renewal, and delayed-key branch spend                                                                                                                                                                                           | Regtest functional. Exact device-specific Testnet4 and packaged physical-signing evidence remains a release gate; no assisted recovery service is implemented                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Decaying/expanding multisig                                          | Yes, guided simulator                                                                                                                                                                                                                                                                                                                                                                   | Rust compiler and timeline analysis                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Rust edge cases; decaying UI E2E                                                                                                                                                                                                                                                                                                                                                                                                     | V2 preview; funded/reorg gates pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Multiple-wallet registry and sessions                                | Yes, direct active-state wallet list in desktop navigation and unlock; explicit unsupported-format state for pre-sidecar disposable Regtest hardware/multisig profiles                                                                                                                                                                                                                  | UUID-isolated creation, selection, deletion, legacy migration, independent five-minute sessions whose deadlines exclude background polling, and an OS-held process-lifetime app-data lock acquired before wallet commands. Current hardware/multisig profiles require public metadata plus an encrypted local PIN verifier; missing sidecars disable credential entry without mutating the old files.                                                                                                                                                                                                                   | Session isolation/expiry units; schema/corruption/rollback/restart and legacy compatibility tests; real child-process exclusion and forced-termination recovery; desktop/mobile E2E                                                                                                                                                                                                                                                  | Regtest functional; two known early disposable profiles require explicit deletion/recreation; packaged second-launch presentation remains platform acceptance evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Persistent application language                                      | Complete EN/FR/ES frontend catalog covering routes, dialogs, progress/error states, toasts, accessibility names, recurring statuses, counts, and appearance controls                                                                                                                                                                                                                    | Local preference only; English source copy is the stable key; user-entered and protocol data never enters localization; native errors use stable-category or localized safe fallbacks                                                                                                                                                                                                                                                                                                                                                                                                                                   | Locale normalization/persistence/interpolation/plurals, static rendered-copy and toast catalog gate, plus desktop/mobile language-switch E2E                                                                                                                                                                                                                                                                                         | Functional across the frontend; native operating-system dialogs and third-party hardware-device screens remain platform-owned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Network backends and fees                                            | Per-wallet Core fee/broadcast editor plus separate Core or confirmed-only compact-filter activity source; startup progress/failure with last verified height; Core full/pruned/IBD/disk/filter-index diagnostics; explicit custom fee remains available when presets are unavailable                                                                                                    | Compile-time Regtest/Signet/Testnet4 identity; exact Core chain/genesis checks; protected RPC; atomic Kyoto BIP157/BIP158 BDK updates; sanitized sync status; locally broadcast unconfirmed transaction persistence; owner-only shared working directory; explicit peers/diversity; manual/Tor no-fallback rules; bounded sync runtime; dependency debug stdout suppressed in dev/test/release                                                                                                                                                                                                                          | Three-network compile matrix; Core URL/auth/proxy/fee units; compact-filter wrong-client-network, malformed/disconnect/stall, symlink/non-directory, initial-handshake no-identifier, SOCKS5 exact-route/no-direct-fallback, six-stage atomic rollback/restart, locally broadcast pending restart, and notification reorg-idempotence units; funded persisted Regtest reorg/re-anchor and valid false-positive full-block path       | Core Regtest functional. Compact-filter funded happy path, restart, shallow reorg/re-anchor, false-positive safety, atomic application, outgoing pending persistence, startup progress, and mocked Tor routing are automated. The canonical remaining decisions/evidence are in [`compact-filter-deferred-work.md`](compact-filter-deferred-work.md); merging the foundation does not close #7. Esplora not wired                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Payjoin V2                                                           | Send QR scanning recognizes a Payjoin-bearing request and blocks conventional-payment fallback; no sender/receiver session UI yet                                                                                                                                                                                                                                                       | Exact PDK 1.0.0 V2-only dependency; bounded native general BIP21 and Payjoin-V2 parsing with network validation and no V1 or conventional-payment downgrade                                                                                                                                                                                                                                                                                                                                                                                                                                                             | PDK vector, general BIP21 amount/text, all standard address families, unknown-required parameter, Payjoin detection, and wrong-network unit tests                                                                                                                                                                                                                                                                                    | Phase-0 foundation only. Encrypted PDK event persistence, OHTTP transport, sender/receiver state machines, fresh proposal review, fallback consent, interoperability, and hardware evidence remain before #10 can close                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Desktop release evidence                                             | N/A                                                                                                                                                                                                                                                                                                                                                                                     | Clean locked unsigned build, deterministic target-specific CycloneDX/license inventory, artifact/SBOM hashes, two-build comparison, signature verification scripts, offline signed-update and HWI provenance verifiers, and a macOS builder/verifier that packages exact HWI 3.2.0 with matching pre-1.0 app metadata                                                                                                                                                                                                                                                                                                   | CI regenerates SBOM and rejects tampered update/HWI/package fixtures; portable-envelope units and unsigned packaged process/crash recovery are locally proven                                                                                                                                                                                                                                                                        | Reviewed HWI input is recorded and the bundled boundary is implemented. Independent machines exactly reproduced all four unsigned `2110eaf` evidence files. Developer ID signing, notarization, signed portable backup/restore, physical package evidence, and complete lifecycle acceptance remain pending; see [`reproducible-mainnet-builds-2026-09-04.md`](reproducible-mainnet-builds-2026-09-04.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Mainnet release                                                      | Available only in the isolated, non-distributable ADR 0055 macOS Apple-silicon certification build                                                                                                                                                                                                                                                                                      | Dedicated compile-time identity and storage; purpose-bound exact-genesis loopback-Core admission before wallet SQLite opens; BIP84/BIP48/xpub/address/HWI parameter row; one-recipient/1,000,000-sat policy; no remote/compact-filter fallback                                                                                                                                                                                                                                                                                                                                                                          | Rust parameter/policy/admission tests, CI source-policy gate, exact enablement-diff review, and enabled-candidate evidence matrix; the unsigned two-machine row passes for `2110eaf`                                                                                                                                                                                                                                                 | Distribution and merge to `main` remain blocked pending exact-candidate review, live backend proof, physical certification, signed/notarized lifecycle, recovery, minimal-value rehearsal, checklist completion, and ADR 0053 approval                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Local Testnet4 observation on 2026-08-19: an ad-hoc-signed macOS build migrated an existing software wallet to version 3 and subsequently unlocked it without a Keychain prompt. The same session exposed and fixed a separate default-node-state bug: a wallet with no saved node configuration no longer treats absent RPC credentials as corrupt storage. Repeated Testnet4 connection checks then exposed synchronous Core RPC and historical wallet scanning on the native command thread; those commands now use the blocking worker pool, with a source-level regression test covering both wallet kinds plus node test/save. A later packaged run proved that scheduling change alone insufficient: the direct client's timeout implementation created and joined one macOS helper thread per local RPC request throughout the block-zero history scan, producing UI beachballs and intermittent false-offline connection tests. Local plaintext Core RPC now uses a bounded loopback-only socket transport while remote HTTPS retains platform-native certificate validation. The first packaged socket build also exposed a mock-fidelity error: its client half-closed the write side before reading, which the mock accepted but real Core treated as an aborted request. Removing that FIN exposed a second framing error: the client waited for socket closure after receiving a complete `Content-Length` response, leaving connection checks in their loading state until timeout. The client now sends the complete request and returns immediately after the exact declared body; redirect, timeout, non-loopback, authentication, wrong-chain, persistent-socket response framing, 256-request stress, and opt-in live local-Core regressions fail closed or pass as appropriate. This is useful same-machine development evidence, not portable relocation, signed/notarized candidate, funded transaction, or independent-review evidence.

The same Testnet4 session later supplied a five-second process sample from the still-stuck packaged app. It identified the remaining cause: `node_config_save` was blocked on the global wallet-operation mutex while automatic Core sync owned it for a block-zero historical pass. Automatic sync is now explicitly cancellable, Settings pauses and cancels it, and node saving requests cancellation before acquiring the mutex. Cancellation rolls back the partial normal-sync transaction and does not change persisted wallet or credential formats. The ad-hoc-signed macOS v3.8 candidate then passed repeated connection checks plus a full app restart against the same Testnet4 node and profile. That run exposed a separate startup presentation defect: Overview could paint briefly before the native locked-session result redirected to unlock. The shell now fail-closes behind a neutral startup gate until Rust reports the selected session. The ad-hoc-signed macOS v3.9 candidate then passed repeated relaunches without exposing Overview before the lock screen.

Display-only fiat estimates and the Market page were subsequently removed from the main branch under ADR 0038. The frontend route, navigation, preferences, fixtures, and native price-provider commands are absent, so ordinary Groot runtime cannot contact the former market-data provider. The historical implementation remains only on `codex/market-reference`; this removal does not change wallet or credential persistence formats.

The Testnet4 v4.7 development bundle exposed that public-network HWI still depended on an external root-owned installation and therefore could not discover hardware from an ordinary downloaded app. ADR 0039 replaces that macOS packaging rule: v0.4.8 embeds the reviewed HWI 3.2.0 resource, compiles its exact digest, verifies both HWI and the containing app seal before every spawn, and never searches Homebrew or `PATH`. Automated path/package substitution tests pass. A physical v0.4.8 Testnet4 run then imported a Jade successfully and verified its identity, proving the packaged dependency works. That run also exposed a saved-device health-check bug: a concurrent unlocked Ledger could delay the old type-only Jade account-key request until timeout, while retrying after the Ledger locked passed. v0.4.9 removes type-only saved-device reads: it reuses a recent exact ephemeral path or performs type-scoped enumeration, selects the saved fingerprint, and then reads only that exact path. Regression tests cover an exact Jade selection with unrelated unlocked Ledger and BitBox02 entries. The exact v0.4.9 candidate then passed that physical multi-device Jade health check. v0.4.10 shortens the check's default loading, result, action, identity, and toast copy while keeping technical identity values visible in their dedicated fields. v0.4.11 corrects sparse Testnet4 fee presets by combining economical Core history with the local current mempool: when its transactions fit comfortably within one block, stale high short-target history no longer overrides the locally observed floor. The UI now says only **Bitcoin Core** instead of exposing `estimatesmartfee`. v0.4.12 renders the payment amount and unit with primary text contrast throughout single-key and multisig review, avoiding disabled-state styling. v0.4.13 adds ADR 0040's protected network-setup reuse: unlocked wallets can provide their Core and sync settings to new or existing wallets, Rust revalidates the source and re-encrypts any RPC password for the destination, and wallet data remains isolated. A physical v0.4.13 run then exposed wallet selection waiting on the native UI thread while a first historical Core scan held the serialized operation lock. v0.4.14 cancels that scan before the wait and performs selection on Tauri's blocking worker pool, keeping the window responsive. No wallet, profile, proposal, registry, or network-settings format changes.

v0.4.15 standardizes denomination casing across every amount surface: `sats` is always lowercase and `BTC` is always uppercase. The shared amount component now uses the canonical unit formatter and explicitly prevents inherited capitalization; a source regression rejects capitalized sats literals in user-facing Svelte files. This presentation-only change does not alter wallet accounting or persisted formats.

v0.4.16 limits transaction acceleration actions to the selected wallet's actual role. Sender-side fee replacement is labeled **Increase fee (RBF)** and appears only for pending, replaceable wallet-originated transactions. CPFP appears only when the pending transaction pays a wallet-controlled output, so an incoming payment no longer incorrectly offers RBF merely because the sender marked it replaceable. Persisted wallet and proposal formats are unchanged.

v0.4.17 slows the shared animated PSBT QR from four to two frames per second, giving Jade and other physical signer cameras twice as long to acquire each `crypto-psbt` frame. The bounded UR payload and persisted proposal remain unchanged.

v0.4.18 slows the shared animated PSBT QR further to one frame per second after physical Jade testing showed that two frames per second was still difficult to scan. The bounded UR payload and persisted proposal remain unchanged.

v0.4.19 makes Overview and Activity use the same deterministic transaction order: active pending entries appear before confirmed history for latest-first views and after it for earliest-first views, with timestamp sorting inside each group. This avoids Testnet4 miner block-time skew placing newly seen mempool activity below older confirmed payments. The change is presentation-only; persisted wallet and proposal formats are unchanged.

v0.4.20 removes the Trezor/KeepKey PIN position grid whenever its native challenge is busy, expired, rejected, disconnected, or otherwise failed. Requesting a fresh layout invalidates the previous challenge before the native request starts, and only a newly successful challenge can render a new blank grid. Persisted wallet and proposal formats are unchanged.

v0.4.21 fixes the BitBox02 and BitBox Nova unlock loop in HWI 3.2.0. A path-only enumeration result now continues to an exact-path account-key read that derives the fingerprint and xpub in one live client, instead of forcing another scan. Scan guidance is shorter. Persisted wallet and proposal formats are unchanged.

v0.4.22 shortens hardware discovery, progress, retry, and device-help copy while preserving the device-specific actions needed to recover. Persisted wallet and proposal formats are unchanged.

v0.4.23 hardens the complete HWI request lifecycle without changing persisted formats. Native HWI processes are single-flight, discovery is bounded to 30 seconds, duplicate frontend scans coalesce, dismissed scan generations ignore late results, targeted scans preserve other saved exact paths, and a saved single-key signer is found by its complete saved identity instead of broad enumeration before signing. BitBox02 and Nova path-only results remain actionable as detected devices.

v0.4.24 fixes Testnet4 multisig policy verification after hardware reconnects. Groot now passes HWI's explicit `testnet4` chain instead of the legacy Testnet chain, and a stale exact USB path gets one type-scoped, fingerprint-bound recovery attempt before the policy display is retried. Interactive rejection, cancellation, and busy results are never retried. Ledger errors are short and device-specific. Persisted wallet and proposal formats are unchanged.

v0.4.26 gives the multisig PDF backup the same native saved-file confirmation as the BSMS export. Groot renders the public backup as a bounded PDF, saves it atomically through the macOS file dialog, and offers a single-use **Show in Finder** action only after a successful save. Canceling the dialog is silent, and persisted wallet, registry, proposal, and network-settings formats are unchanged.

v0.4.27 fixes a packaged Testnet4 freeze captured while opening multisig Receive during the wallet's first shared-node historical sync. Receive and Send now cancel and pause automatic sync before entering either foreground flow. Snapshot and multisig-metadata commands that can contend for serialized wallet access run on Tauri's blocking worker pool, so reaching the sync cancellation boundary cannot block the macOS window event loop. Persisted wallet, registry, proposal, and network-settings formats are unchanged.

v0.4.28 corrects the hardware discovery and trust lifecycle. Three or seven eligible saved families now produce one aggregate HWI enumeration, concurrent callers share a native discovery flight and its opaque redeemable capabilities, conflicting non-empty paths fail closed, and only explicit **Scan again** starts discovery. A unique fingerprint-less BitBox02, Jade, or Ledger capability remains selectable for one interactive unlock/login operation without another scan; it stays an untrusted hint until the operation freshly binds the full saved identity, while multiple unresolved same-family paths fail as ambiguous. Trezor retains its bounded PIN flow and Coldcard remains prepare-then-rescan. A bounded coordinator prioritizes interactive prompts, starts deadlines before admission, cancels queued/running work from modal close/navigation/wallet switch, terminates complete process trees even when a successful direct parent leaves inherited pipes open, and prevents late persistence. Cached paths are opaque hints; health, display, policy, and signing freshly prove the live type, fingerprint, derivation, and complete saved account xpub under the action lease, then revalidate wallet context under the wallet-operation guard before persistence. Dynamic HWI selectors, paths, descriptors, and PSBTs use the stdin command protocol, leaving process argv fixed to `--stdin`. Native health operations persist their own result, so the renderer cannot submit an arbitrary healthy record. Foreground compact-filter sync now observes the same cancellation signal as Core sync before fetching and before applying an update. The semantic fake-HWI fixture measures one subprocess enumeration per explicit scan; UI scan acknowledgement remains an immediate state transition and warm capability selection performs no discovery subprocess. A packaged original BitBox02 proved that HWI 3.2.0 can start password entry inside aggregate `enumerate`, before returning the path-only row, so ADR 0043 gives discovery the same five-minute human-interaction bound as account-key import. A subsequent packaged Nova test reached the selected path but surfaced sanitized `hardware_unavailable` during account-key handoff; initial BitBox import now retries only HWI's typed disconnected, locked, or busy responses on the same capability, at most three total attempts, and preserves cancellation plus atomic identity binding. Persisted wallet, registry, proposal, backup, and network-settings formats are unchanged.

The packaged Nova follow-up further showed that five-minute discovery looked
indefinite and that HWI may request the BitBox password again after process
isolation opens the selected account-key connection. The current bound is 90
seconds for aggregate discovery and five minutes for selected-device review.
Fingerprint-less BitBox rows are presented as detected, and the second password
prompt is explicit; the password remains entirely on-device.
Packaged v0.4.29 Nova testing then showed that HWI's BitBox adapter can map its
non-granular reconnect failure to the otherwise unsupported-action code. Groot
includes that overloaded code only in bounded BitBox initial-import retries.
Further physical evidence showed the custom-path `getkeypool` identity proof
itself remained incompatible after successful Nova unlock. A subsequent
packaged retest disproved the direct-`getxpub` re-attestation candidate because
Nova enumeration remained fingerprint-less after unlock. BitBox single-key
import now uses HWI's canonical BIP84 keypool form without `--path`, returning
the live fingerprint, exact account origin, and account key from one open
client; full live identity validation remains mandatory. Physical packaged
testing on both original BitBox02 and Nova disproved that correction while
Trezor and Ledger passed. The remaining common boundary was Groot reopening
the cached BitBox HID path after aggregate enumeration. BitBox single-key
import now asks HWI to rediscover and open the device inside the account-key
process. Physical testing disproved that candidate on both models as well.
Source archaeology isolated the later global `--stdin` conversion as the
remaining shared boundary from the last HWI 3.2.0 Nova pass. Initial BitBox
single-key import now requires exactly one scanned BitBox row and invokes a
fixed documented BIP84 argv command containing no path, fingerprint, address,
descriptor, key, PSBT, password, or device identifier. The same atomic live
identity validation remains mandatory. Physical packaged retesting is
still open separately for original BitBox02 and Nova.

Hardware discovery row copy returned by Rust is cataloged in English, French,
and Spanish. A source-contract test extracts every native device-status message
and fails when any message is absent from the localization catalog, covering
ready, PIN, passphrase, unsupported-model, and device-specific readiness rows.

v0.4.30 advances the normalized label schema from version 1 to version 2 without rebuilding a
table or changing wallet, registry, secret-envelope, proposal, BDK, public-metadata, or descriptor-
backup formats. Matching normalized text now reuses one stable wallet-scoped label entity across
immutable receive-address and payment-intent assignments. The unlocked wallet snapshot exposes a
complete recent-use-ordered suggestion candidates; Receive and every new Send intent display at
most ten recent or typed full-history matches and require an explicit click
or typed match and explain that reuse groups related activity without suppressing real onchain-
cluster warnings. Existing label entities (including legacy duplicates), assignments, addresses,
payments, proposals, provenance, clusters, Recovery/Inheritance policy data, and history remain
present. Rust unit tests cover v1 preservation, cross-origin reuse, suggestion ordering, and cluster
truth; frontend unit and desktop/mobile browser acceptance cover locked/profile isolation and
explicit selection. This is deterministic automated evidence, not a physical-device or packaged-
candidate result.

v0.4.25 fixes multisig creation with shared network setup. The protected node and sync copy now finishes inside the native creation operation before the new profile is committed and selected, preventing automatic sync from observing a half-configured wallet. Copy failure is cleaned up and returns one offline setup result without discarding the valid multisig wallet. The Policy route reads the persisted snapshot while AppShell remains the sole refresh owner, removing duplicate startup refreshes and misleading `sync_in_progress` offline errors. Persisted wallet, registry, proposal, and network-settings formats are unchanged.

v0.4.55 shows a recent-label tooltip only when the rendered label is actually truncated, matching wallet-name behavior. Each suggestion exposes a dedicated measurable ellipsis span while the tooltip remains positioned against the complete button, so short visible labels avoid redundant copy and truncated labels retain the corrected viewport-safe placement. Single-key and multisig Send and Receive use the same rule. This is presentation-only and does not change permanent label identity, assignment, address, wallet, or proposal persistence.

v0.4.54 made every recent-label suggestion expose its complete text on hover and keyboard focus and corrected tooltip placement inside transformed modals. v0.4.55 narrows that behavior to labels with a real rendered overflow measurement.

v0.4.53 makes physical hardware review easier to follow without changing signing, proposal, or persistence behavior. Amount, fee, total, input, and change values in the hardware transaction modal toggle the shared display between sats and BTC when selected. Hardware-policy review keeps its first address compact by default with an explicit complete-address expansion. Ledger signing labels its live policy authorization and transaction comparison as two reachable steps and requires an explicit policy-reviewed transition before showing the transaction. A sanitized Testnet4 checkpoint records direct reviewer evidence for the original BitBox02 and Ledger Nano S Plus covering cancellation, denomination and policy-review presentation, threshold signing, signed-PSBT export, partial-signature restart persistence, locked-Ledger failure without mutation, finalization, broadcast, and confirmed coin state.

Current wallet-core maintenance moves the bounded native public-backup, PSBT, PDF-save, and saved-file reveal commands into `wallet/export_commands.rs` while preserving their registered command names, DTOs, validation, atomic replacement, owner-only Unix permissions, and ephemeral token behavior. Coldcard policy-file acknowledgement now acquires the wallet-operation guard before selected-wallet authorization, so authorization, signer lookup, and permanent acknowledgement remain in one serialized selected-wallet context. These internal changes do not alter wallet, profile, proposal, registry, backup, secret-envelope, or network-settings formats.

v0.4.65 preserves a foreground Bitcoin Core history scan across read-only Overview, Activity, and Coins navigation, while exclusive wallet flows retain their existing cancellation boundary. Remounting Overview reads the non-blocking native status and resumes the active percentage instead of restarting a fresh imported watch-only wallet near its initial checkpoint. The top-right refresh action now derives **Never synced** and relative update age from the last successfully persisted snapshot timestamp, with exact timestamp detail, rather than claiming **Updated now** on every mount. The history-scan and backup-verification banners retain a visible gap. Pure timestamp and source-characterization tests cover the changed invariants, and desktop/mobile browser inspection covers the responsive label. No wallet, profile, proposal, registry, backup, descriptor, network-settings, DTO, stable-error, or dependency format changes.

The internal mainnet RC sync-presentation follow-up starts one immediate automatic sync after each successful unlock, after Overview paints the wallet's persisted snapshot. Automatic unlock sync uses only the compact top-right spinner and percentage so it does not move the Overview layout; the detailed history-progress banner is reserved for explicit manual refresh, while first and recovery scans retain their dedicated progress presentation. Later ten-second foreground polling remains visually quiet, and read-only route navigation neither starts nor reveals another cycle. No persisted format, wallet operation, DTO, stable-error, dependency, or BIP behavior changes.

The next internal mainnet RC follow-up moves `wallet_lock` and any serialized sync-cancellation wait onto Tauri's blocking worker pool, preventing Command/Ctrl+L from stalling the native window event loop while an ordinary sync reaches cancellation. Because wallet sync commits atomically, cancellation intentionally retains the previous successful snapshot and timestamp. The locked route focuses the selected profile's existing credential input after loading. No persisted format, wallet operation, sync commit rule, DTO, stable-error, dependency, or BIP behavior changes.

The subsequent internal mainnet RC adds an explicit manual refresh to the single-key Receive page. It reuses the existing selected-wallet sync boundary while automatic polling remains paused, then applies the returned authoritative receive-address state so a mempool payment can move its request from awaiting to used without an Overview detour. Success, sanitized failure, cancellation, and expired-session routing are explicit. No persisted format, wallet operation, DTO, stable-error, dependency, or protocol behavior changes.

The next internal mainnet RC closes the observed automatic/manual refresh race: an Overview manual refresh now stops, cancels, and fully drains any scheduler-owned cycle before starting its user-visible operation, then resumes the normal interval afterward. Recovery-scan status polling moves its database read to Tauri's blocking worker pool so frequent progress updates do not stall the native event loop or restart the apparent spinner cadence. ADR 0057 also enables the existing explicit, privacy-disclosed transaction explorer action on Mainnet through the same txid-only Rust allowlist used by public rehearsal builds. No persisted wallet/profile/proposal/registry format, descriptor, transaction construction, accounting, or dependency changes.

The following internal mainnet RC fixes an observed coin-freeze race. Single-key and multisig freeze mutations now run on Tauri's blocking worker pool. The Coins route cancels and drains a scheduler-owned sync before the database mutation, applies the confirmed frozen state, and only then restores the normal automatic interval. This prevents the native event loop from beachballing on the wallet-operation mutex and prevents a pre-mutation automatic-sync snapshot from restoring a stale **Freeze** action after the success toast. The existing `groot_frozen_coins` format and spending policy are unchanged.

The next internal mainnet RC moves software, multisig, and external-hardware final broadcast commands—including Core submission, atomic persistence, and the immediate best-effort refresh—onto Tauri's blocking worker pool. Transaction details no longer offer RBF for a self-spend, while the trusted preparation boundary still rejects an ineligible direct request. Eligible fee acceleration now opens on an explicit preparing screen with stronger signer/loading motion until the authoritative quote is ready, and amount units retain a physical inline margin on final broadcast screens. No transaction construction, RBF/CPFP policy, persisted format, DTO, stable-error, dependency, or protocol behavior changes.

Packaged v0.4.65 Testnet4 received direct reviewer confirmation for the complete sync-lifecycle regression: the fresh BitBox02 Nova-named watch-only profile completed its Bitcoin Core history scan, read-only Activity/Overview navigation preserved rather than restarted progress, the persisted last-successful-sync age remained truthful across repeat sync and restart, and the history-scan/recovery-warning spacing passed. This is public wallet-sync evidence only—the device does not participate in descriptor synchronization—and therefore does not close or expand any BitBox02 Nova hardware, pairing, transport, signing, or independent-review certification row. v0.4.66 records that evidence without changing behavior, dependencies, persisted formats, DTOs, or stable errors.

v0.4.84 restores the documented offline fallback when a multisig network-setup source expires after being offered: Rust attempts and cleans the protected copy, commits the otherwise valid wallet offline, and returns one setup result instead of aborting at a stale preflight unlock check. Settings lists saved setup sources with a public readiness flag and unlock guidance while node details and credentials remain native-only. A fresh Core wallet no longer opens history controls before Core is ready; Overview shows a zero placeholder labeled **Never synced** and links to Settings. With Core ready, **New wallet** is selected by default, while birthday/full-history and address-gap controls are progressively disclosed. The multisig setup chip now derives the compiled network instead of saying Regtest, and the Bitcoin Core warning has explicit text spacing. Existing wallet, registry, proposal, scan, descriptor, secret-envelope, and network-settings formats are unchanged.

The 2026-09-09 RC follow-up removes the remaining separator directly below the expanded transaction-detail disclosure. The locked network popover now reads the selected wallet's saved non-secret backend, transport, and activity-sync method instead of showing generic architecture. RPC passwords remain encrypted and live fee, reachability, and tip checks still require unlock. No persisted format changes.

The subsequent RC follow-up changes an open transaction disclosure to **View less details**, renames **Core service tip** to **Network tip**, and shows the selected wallet's last successfully verified public priority fee and network tip while locked. Those observations live in a new optional owner-only per-wallet cache; existing wallets need no migration, RPC credentials remain encrypted, and fresh network calls still require unlock.

The 2026-09-12 internal-RC correction implements ADR 0064. Software-wallet
creation and recovery no longer request RPC credentials; an empty encrypted
profile can be created offline, while every Mainnet wallet-data open remains
blocked until that selected wallet has an admitted exact-chain Core session.
Same-network setup copying now includes Mainnet. The first scan starts
automatically without another credential prompt, and later scan-setting changes
still authenticate. App-level sync now runs every five seconds across Settings,
Receive, and Send. Core fee estimates retain sub-1 sat/vB precision. Shared
amount, disclosure, separator, locktime, shortcut, status-dot, and spinner
presentation is consistent. The native recovery verifier no longer overlays its
bottom shuffled-word row. No persisted format or BIP behavior changes; ADR 0061
remote-node and final-candidate evidence remain open.

v0.4.85 repairs two Bitcoin Core checkpoint-replay boundaries found during the physical Testnet4 campaign. Normal sync now compares sparse saved checkpoints with Core's active chain and, after a deeper reorganization, feeds BDK an in-memory checkpoint view ending at the highest agreement while replaying no earlier than the saved wallet birthday; stale-chain replacement remains part of the ordinary atomic commit. Explicit full rescans remove only local-chain checkpoints above the selected matching resume point before replay so an existing later tip cannot disconnect the introduced chain. Transaction history, descriptors, labels, proposals, signer metadata, registry, credentials, and network setup formats are unchanged. The durable Overview failure state now carries only a stable safe error code and distinguishes node permission/configuration from wallet-state reconciliation without exposing RPC details.

v0.4.86 corrects the Bitcoin Core policy boundary used to quote RBF replacements. Groot now reads the authoritative incremental-relay fee from the purpose-built read-only `getmempoolinfo` response rather than the compatibility-oriented `getnetworkinfo` response, and RPC whitelist rejection is translated to the stable actionable node-configuration error. The documented least-privilege RPC method list now includes `getmempoolinfo`. Transaction construction, replacement eligibility, persisted wallets, proposals, profiles, registries, descriptors, credentials, and network-settings formats are unchanged; no fallback fee policy is invented when Core omits or denies the authoritative value.

v0.4.87 restores the Policy capability boundary between standard threshold multisig and Miniscript recovery wallets. Standard `wsh(sortedmulti())` wallets retain Policy for threshold, signer identity and health, descriptor backup, and hardware-policy status, while recovery-lab links are absent and direct lab navigation returns to Policy. Wallets with a persisted Miniscript recovery template retain the analysis-only lab; its copy now states that it compares public signer-based alternatives and cannot alter the selected wallet. Warning headings, bodies, following fields, and actions use explicit vertical spacing at desktop and mobile widths. Wallet, profile, registry, proposal, descriptor, backup, credential, and network-settings formats are unchanged.

v0.4.88 makes pre-PSBT payment drafts directly disposable. Overview now separates **Discard draft** from **Resume**, and resumed software, external-hardware, and multisig Send flows repeat the discard action beside Back. Confirmation names the saved draft fields and states that no transaction or signature exists; successful clearing suppresses the route-exit auto-save that would otherwise recreate the draft. Prepared proposals keep their existing, separate cancellation review. This is a UI/lifecycle correction over the existing authenticated `payment_draft_clear` boundary; wallet, payment-draft, proposal, registry, profile, backup, credential, and network-settings formats are unchanged.

v0.4.89 closes the Core-configuration catch-up race observed during the packaged Testnet4 BIP84 recovery rehearsal. Before normal sync or any explicit full/birthday history scan, Rust now requires the configured Core node to be out of initial block download and its tip to have reached the wallet's last verified checkpoint. Full and birthday scans also reject a requested block range that a pruned node no longer stores. These cases return stable actionable `node_syncing` or `node_history_unavailable` errors and keep the previous verified wallet state untouched instead of surfacing a generic BDK reconciliation failure. This is compatible with every existing wallet, checkpoint, recovery-scan, descriptor, profile, registry, proposal, credential, and network-setting record; no migration is required.

# Restart-bound internal network selection

ADR 0068 adds a `multi` native identity whose Settings screen offers Regtest,
Testnet4, and Mainnet. ADR 0069 selects it as the intended GA artifact while
leaving distribution blocked on expanded exact-package evidence. Rust persists the exact closed-set selection in an
owner-only versioned file, loads it before the application-root process lock and
wallet initialization, and restarts on change. Existing Regtest data stays in its
compatible root; Testnet4 and Mainnet use separate named subdirectories. Foreign
registries still fail before wallet open, frontend/native mismatch still blocks the
shell, and malformed or unsafe selection storage aborts startup. Fixed release
builds remain compile-time network-bound and cannot switch. The current multi
package is not approved for distribution until ADR 0069's selector, restart, and
cross-network isolation evidence passes, and Mainnet retains its exact-Core
admission, policy, spend, HWI, and release gates. Wallet/profile/registry/database/
secret formats are unchanged and no migration is required.

# Isolated mainnet certification candidate

ADR 0055 authorizes one dedicated, non-distributable mainnet build so the ADR 0053
exit conditions can be exercised. The compile-time identity, isolated bundle and
storage ID, pre-database local-Core admission, and excluded sync/backend choices
are explicit; no runtime preference can activate mainnet elsewhere. ADR 0056
restores the existing PIN-only unlock flow: a separate native permit accesses only
the persisted authentication throttle, Rust decrypts the persisted per-wallet Core
setup, Overview verifies it before the first wallet-data database read, and node failures
remain on Overview rather than requesting RPC fields on the lock screen. It also
removes the global mainnet banner while retaining the normal Mainnet network
identity and exact payment review. The internal RC builder now compiles an
ad-hoc-compatible `REHEARSAL_ONLY` app requirement and verifies the pinned bundled
HWI, fixing the package mismatch that prevented Ledger enumeration. ADR 0012 still
blocks distribution and merge to `main`. The existing portable-profile Argon2id
parameters and persisted formats are unchanged. No BIP family support changes in
this correction.

## 2026-09-14 remote-Core recovery scan responsiveness

The owner reports the trusted Mainnet remote Core endpoint connected at block
966,930 with full history in the prior internal build. The subsequent wallet
rescan from birthday 966,900 stalled visually at 100% and the app beachballed;
that is **not** a completed remote-node wallet certification. The follow-up
moves recovery-settings validation and scan cancellation off the native UI
event loop, pauses automatic sync during explicit rescans, makes Core emitter
RPC calls interruptible between requests, and labels block-tip completion as
pending-transaction reconciliation until the atomic result is committed.
Activity gains a manual sync action using the existing wallet-specific path.
The owner's prior steps 1–4 (including cancellation presentation) passed on
the earlier build; remote rescan and clean-profile recovery remain open for
physical retest. No persisted wallet, profile, registry, proposal, or backup
format changes; no BIP support change.

## Registry contract maintenance

Shared synthetic fixtures now check native registry/profile serialization against
frontend field consumption, including all three wallet kinds and default/allowed
inactivity timeouts. The browser adapter now mirrors native timeout choices
(1, 5, 15, 30, or 60 minutes) and requires the selected wallet to be unlocked
before saving them. Rejected changes preserve the registry. Native command and
session-expiry behavior are unchanged; mocked IPC does not establish native
end-to-end conformance. No persisted format, migration, dependency, BIP support,
or BIP evidence changes are involved.

## Foreground scheduler maintenance

The measured snapshot follow-up replaces unconditional full-history provenance
passes with a transient dependency work queue that preserves legacy pass order
and skips unchanged sources. Exact persisted-table comparisons protect permanent
cluster evidence, labels, and replacement behavior. Independent-receive snapshots
at 300 transactions dropped from 817,507 to 7,507 SQL statements. There is no
persisted-format, schema, BIP support, or dependency change. Measurements and
scope limitations are recorded in `assurance-baseline-2026-09-08.md`.

The follow-up lifecycle assurance pass rejects session responses that settle
after monitor stop/restart or while hardware review pauses expiry handling.
Obsolete sync failures also cannot redirect the next wallet or alter its retry
cadence. Deferred-promise frontend tests reproduce the old behavior and verify
the fix. The synthetic snapshot benchmark and its confirmed quadratic SQL work
are recorded in `assurance-baseline-2026-09-08.md`; provenance optimization remains
a separate implementation with equivalence tests. No persisted format or BIP
behavior changes.

The ten-second live-sync scheduler now consumes the selected wallet kind already
owned by `AppShell`, eliminating the preceding `wallet_exists` and
`wallet_profiles` calls from each cycle. The invoked Rust sync command remains
authoritative for current selection, session, network, and wallet-state checks.
No profile means no scheduled native work. This changes no persisted format,
public DTO, stable error, dependency, BIP behavior, or user-visible flow.

ADR 0061 supersedes the Mainnet table row's local-only transport description:
the isolated candidate now admits loopback HTTP or direct HTTPS Core, with no
automatic fallback. Its remote-endpoint, network-observation, exact-candidate,
and independent-review evidence remains open, so distribution remains blocked.

Update this table in the same change whenever a capability crosses a boundary.

## 2026-09-16 Locked global Settings and multi-network build correction

The internal multi-network application now keeps global Settings reachable while the selected wallet is locked. The locked surface exposes only appearance, build identity, the active Bitcoin network, restart-bound network selection, sanitized logs, and cached public network status; wallet-specific node routes, sync configuration, credentials, recovery controls, exports, deletion, and live connection tests still require an unlocked session. Desktop and mobile shells retain a direct Settings entry and pass the locked state to the public network-status control. No wallet, profile, registry, proposal, descriptor, backup, credential, or network-selection format changes.

## 2026-09-16 Mainnet GA campaign reconciliation

The Mainnet campaign is not restarting from Testnet4. Existing owner-operated
evidence includes the `ab830d32` software lifecycle, Sparrow 2.5.4 recovery of
the exact `a735fb19` software wallet, a Mk4 + Nano S Plus + Nova BIP48 address
match, a confirmed deposit, a Groot 2-of-3 payment signed by Nano S Plus + Nova
and persisted after restart, and recovery/spending from the same public multisig
descriptor in Sparrow with Nova + Mk4. The remote campaign also includes an
archival Mainnet Core with synchronized indexes, bounded narrow-gateway probes,
two completed `783f2010` Groot refreshes, and a completed but still slow
`c7376112` refresh. These are retained as named-package evidence rather than
being downgraded to pending exploratory work.

The remaining GA delta is exact-artifact work: owner timing of the current
warm-mempool optimization, the complete remote HTTPS failure/lifecycle matrix,
frozen-package negative and recovery rows for Mk4/Nano S Plus/Nova, complete
Mainnet records for Model One/original BitBox02/Jade Classic/Safe 3 or an
explicitly reviewed scope reduction, the signed software/profile lifecycle,
final-commit reproducibility and notarization, and independent recovery/security
review. ADR 0069 now selects the restart-bound multi-network application as the
intended GA artifact, so its selector integrity, restart teardown, and
cross-network isolation become additional exact-package gates. The canonical ordered resume point is in
`docs/mainnet-release-checklist.md`; model-specific detail is in
`docs/hardware-certification-mainnet-2026-09-12.md`. This reconciliation adds no
new runtime behavior, persisted format, dependency, or BIP support claim.

## 2026-09-13 Mainnet multisig setup and Policy correction

The 2026-09-14 presentation correction fixes the policy-lab eligibility check
for Rust's `null` absent recovery template, so standard multisig shows no lab
entry in either Policy action location. The backup format label now precedes the
two choices with explicit spacing, and its shorter security note changes with
the selected public export format. Single-key and multisig Receive use the
existing wallet skeleton during initial reads instead of claiming an empty
address list. Multisig Send opens the existing hardware progress dialog before
session validation and device enumeration; actual HWI discovery remains
asynchronous and unchanged. No persisted wallet, backup, descriptor, proposal,
network, or signer format changes occur; physical performance remains to be
measured on device.

The subsequent remote-Core Settings correction restores the already-accepted
ADR 0061 Mainnet direct-HTTPS selection: the Mainnet-only UI guard now excludes
Tor but permits Remote TLS, consistent with Rust's existing exact-genesis,
credential, certificate, and pre-database admission policy. A Mainnet-mode
browser regression covers selection, save, reopening, and credential clearing;
this fixture is not a live remote-node certification. Local Core and saved
remote configurations retain their existing behavior. No wallet, registry,
credential, node-configuration, descriptor, or backup format changes occur.

The subsequent internal UI follow-up retains the current native wallet, signer,
PSBT, and Bitcoin Core paths. The shared disabled-button indicator is again one
open spinning circle without a decorative dot. The multisig Policy route shows
the existing wallet skeleton while its selected-wallet lookup is pending and an
actionable error if that lookup fails, never the single-key fallback for an
unresolved lookup. Standard sortedmulti wallets hide the Miniscript-only
Recovery policy lab in the card and overflow menu once both missing and native-null
recovery templates are treated as absent; the browser regression now
also watches for a transient false fallback. Export & verify authorizes both
existing public BSMS and Groot JSON commands with one app PIN, clears that PIN,
and switches between the two transient records without new authorization or a
persisted schema change. The existing shared modal enlarges the receive
descriptor QR. These are source/browser presentation and orchestration checks,
not physical certification of the replacement Mainnet binary.

Owner-operated internal `v0.4.94 · 4630bf95` testing subsequently displayed
the Mk4 policy-file acknowledgement and verified Nano S Plus/Nova policy
states, then a permanently labeled first multisig receive address verified on
the Nano S Plus. The Nova and Mk4 receive-address comparisons, funded signing,
restart, recovery, and independent Mainnet gates remain open. The subsequent
shared-button indicator and policy-review wording change is presentation-only;
it does not change HWI, wallet formats, or protocol behavior. Candidate-bound
details and the next physical steps are in the sanitized Mainnet hardware
checkpoint.

The exact packaged `08f45e1` candidate created the watch-only wallet but did
not copy a previously working network setup; Policy status, health status,
Coldcard acknowledgement, and snapshot reads then failed the unchanged
Mainnet database permit. The Policy route could also present a found Ledger or
Nova signer as “not found” when a coupled status read discarded the separately
available public first-address reference. ADR 0066 records the
corrected copy precondition, existing-wallet adoption session order, independent
reference read, single automatic error, and Coldcard reference/CTA copy. No HWI
binary, model allowlist, fingerprint matching, descriptor, database, draft,
node-secret, or wallet-backup format changes. These are source and browser/native
test claims only until the new packaged app is retested with the exact devices
and Core connection; Mainnet GA remains blocked.

The owner then reported that internal Mainnet candidate `dacb5cac` remained at
99% during a remote-Core unlock scan while Activity and Coins stayed in loading
skeletons. The follow-up keeps the last committed wallet state readable via an
authenticated read-only SQLite connection gated against the final commit during the in-memory Core refresh,
and prefetches raw mempool transactions in bounded 32-call RPC batches with a
direct-call fallback. It does not skip pending-transaction reconciliation or
promote 99% to completion. No persisted wallet, profile, proposal, registry,
backup, descriptor, or node-settings format and no frontend DTO or stable error
changes. Source/regression tests do not certify the replacement package against
the owner's remote node; physical retest remains required.

The owner-supplied sanitized log from exact Mainnet build `6edf79d8` shows
unlock succeeded but every subsequent automatic sync failed at 0% with
`node_admission_required`; it did not reach a block or mempool scan. A separate
unauthenticated reachability check from the same Mac resolved the saved remote
hostname but timed out connecting to TCP 443 while unrelated HTTPS responded.
This observation establishes an endpoint/network outage at the time of the
check, not a remote-server root cause or proof of wallet-data loss. The follow-up
shortens selected-wallet node-health timeouts, distinguishes an unreachable saved
node from absent setup in Overview, and suppresses misleading “Never synced”
while the persisted snapshot remains admission-gated. Existing persisted formats
and wallet-data admission requirements are unchanged. This does not certify the
remote node, rescan, or the new package; owner retest remains necessary once the
endpoint is reachable.

The narrow Core gateway is now implemented under `services/core-gateway` as a
dependency-free Python service with an NGINX/systemd deployment boundary. It is
wire-compatible with Groot's existing bounded JSON-RPC transport but accepts
only the exact chain/block/mempool/fee/index/broadcast calls and validated
parameters Groot uses. It authenticates revocable per-client principals from
salted scrypt verifiers, reconstructs requests with server-owned ids and Core's
loopback cookie, disables request logging, rate limits source and principal,
and structurally bounds responses. Integration tests cover valid single/batch
traffic, all-or-nothing rejection, unsupported methods, invalid parameters,
authentication, POST-only handling, client/Core credential separation, and
error-data stripping. The internal-alpha hostname was cut over from direct
NGINX-to-Core proxying to this gateway on 2026-09-15. External probes verified
authentication, method denial, exact Mainnet genesis, height, archival history,
required indexes, fee and mempool data, malformed and oversized-batch rejection,
and bounded overload behavior; a 60-request burst produced only successful or
rate-limited responses and the service recovered immediately. Full Groot
rescan/relaunch/broadcast testing and an independent security review remain open
under ADR 0067, so this deployment is not public-production evidence.

The owner then completed two exact `783f2010` remote-Core refreshes against the
gateway: both preserved the last committed wallet state and ultimately reached
100%, while the repeated pending-transaction phase remained near 99% for roughly
twelve minutes. The follow-up aligns client and gateway on a 256-call bounded
mempool batch to reduce authenticated HTTPS round trips eightfold. Automatic and
Activity refreshes now inspect and follow the native single-flight status instead
of producing repeated `sync_in_progress` failures, Activity uses the shared
`LoadFailure` surface for real errors, and Overview removes its raw secondary-data
loading sentence while retaining the committed snapshot. Request/response byte
bounds, exact RPC allowlisting, gateway concurrency/rate limits, atomic wallet
commit semantics, and cancellation remain unchanged. No persisted format or
stable error changes; a replacement exact build and live timing retest remain
required.

The exact `c7376112` owner retest confirmed that Overview and Activity remain
usable and the refresh completes, but the pending phase still required roughly
three to four minutes. The client now keeps a process-local public mempool-txid
baseline per wallet after a successful atomic commit. Later ordinary refreshes
scan only newly added transactions plus that wallet's still-pending
transactions, so BDK retains correct eviction handling without redownloading
unchanged unrelated transactions. Revealing a receive address invalidates the
baseline; explicit recovery scans always perform a complete mempool pass and
then seed the baseline. No raw transaction, address, descriptor, credential,
or persisted-format cache is introduced. The first pass after process launch
remains complete; exact-build warm-refresh timing still requires owner retest.

The 2026-09-16 Mainnet multisig run then showed 503 seconds of incomplete block
progress while its durable checkpoint was only 135 blocks behind the connected
node. That evidence isolates serial remote raw-block RPC as the bottleneck, not
wallet size, multisig evaluation, client hardware, node storage, or the later
mempool phase. Core refresh now uses a synced basic block-filter index when
available: block hashes are read in bounded 256-call batches and variable-size
BIP158 filters in separate eight-call batches,
wallet scripts are matched locally, and only matching raw blocks are fetched.
Start/target chain identity and each fetched block link are verified before the
complete chain checkpoint and relevant transactions enter the existing atomic
commit. Gateway and client parameter tests keep `getblockfilter` read-only and
basic-only. Nodes or gateways without the optional method/index keep the prior
full-block fallback. This is source evidence until the updated gateway and exact
packaged build complete the owner's live Mainnet timing retest.

The first exact packaged filter build `f5544e6a` exposed a transport regression
on that same wallet: its 135 filters were requested in one batch, the remote
HTTPS response remained in a sustained read for more than five minutes, progress
stayed at 0%, and the app appeared frozen until cancellation. The wallet's
durable checkpoint and data remained intact. Hash and filter batch limits are now
separate, filter responses are capped at eight calls per request, and one filter
is probed before batching so an undeployed/unsupported gateway falls back
promptly. This is an implementation correction, not evidence that the live
Mainnet timing gate has passed; the replacement exact package must still be
tested against the gateway and Family Test wallet.

The owner rejected client-side filter transfer as the default remote-Core UX
and explicitly accepted public wallet-query disclosure to the trusted server.
ADR 0070 now makes remote Core use `scanblocks` plus mempool-only
`getdescriptoractivity`: Groot sends at most 4,096
deduplicated `raw(script)` public scan objects, receives potentially matching
block hashes, verifies them against its independently fetched active hash range,
downloads only matching full blocks and matching pending transactions, and
retains the existing atomic wallet reconciliation. The gateway rejects address/key descriptors, private
material, other scan actions, unordered ranges, non-basic filters, and arbitrary
options. Local Core and the separate P2P compact-filter source are unchanged.
There is no persisted-format migration. On 2026-09-17 the owner-controlled
Mainnet service deployed the required gateway at source commit `5f94581`, added
`scanblocks`, `getdescriptoractivity`, scoped `help`, and `getblockfilter` to
both Core RPC whitelists, and restarted only Core and the gateway. Bitcoin Core
31.1 returned at height 967449 with transaction and basic-filter indexes
synced. A reversible authenticated HTTPS probe with 256 public scripts then
completed the four-call health/capability batch in 0.086 seconds, scanned blocks
967180-967449 in 0.120 seconds, and completed mempool descriptor activity in
2.662 seconds; the temporary principal was removed and the credential file was
restored byte-for-byte. This closes the infrastructure deployment prerequisite,
not the exact packaged Family Test timing gate.

The first packaged ADR 0070 run exposed three integration defects before that
live gate: an offline Mainnet preflight left Overview's command-family flag at
its single-key default and therefore sent a multisig retry to the wrong native
command; the connection test checked only generic Core health and could report
an outdated gateway as ready; and the gateway's ordinary ten-second upstream
timeout could abandon a still-running synchronous `scanblocks` request. The
follow-up binds retry dispatch to the selected profile before any preflight,
checks the two indexed methods through exact allowlisted `help` calls, uses one
five-second health attempt, maps rejected/missing capabilities to stable
configuration guidance, and gives only `scanblocks` a 120-second client and
gateway bound. No wallet, profile, proposal, registry, backup, descriptor,
node-settings, or diagnostic format changes; no migration is required. The live
gateway deployment passed the bounded probe recorded above; exact-package
Mainnet Family Test timing evidence remains required.

The exact `8d67d48` multi-network package then passed the owner's Mainnet Family
Test unlock and automatic Overview sync against that deployed path. The
follow-up removes the redundant connection test from ordinary Overview remounts:
Mainnet admission remains mandatory once after unlock, while returning during
the same admitted session reads the persisted snapshot without starting network
work. The app-shell cadence is now 35 seconds. Its reference-counted manual-sync
pause survives read-only route navigation, and both single-key and multisig
Receive expose the existing coordinated refresh action. No wallet, profile,
proposal, registry, backup, descriptor, node-settings, DTO, stable-error, or
dependency format changes; no migration is required. The reviewed mainnet
source-policy snapshot now pins the shell, scheduler, Overview, and both Receive
routes at these exact bytes. Exact replacement-package navigation and cadence
evidence remains required.

The subsequent owner review of `fbdd6419` found that successful route behavior
still masked three release defects: scheduler failures could exponentially delay
the next automatic attempt, explicit cancellation retained a resumable run and
stale modal progress, and the manual full-rescan command still used the local
per-block transport even for trusted remote Core. The correction keeps the
scheduler mounted across normal routes and schedules every next attempt at the
fixed 35-second interval. Explicit cancellation now discards its run record;
unexpected failure or process interruption remains the only resumable terminal
state. The Settings modal shows the live selected-network tip, rejects a future
birthday, explains both birthday and gap controls, and hides the standard gap
under an optional address-discovery disclosure. Remote birthday/genesis scans
now reuse the indexed `scanblocks` and `getdescriptoractivity` architecture,
resolve and download only matching blocks, and build a verified sparse tip
without a per-height HTTPS walk. This changes no wallet, registry, descriptor,
proposal, backup, node-setting, dependency, or schema format; legacy terminal
`cancelled` run rows are safely deleted when first observed. Exact-package
Mainnet full-scan timing, cancellation/reset, route-independent cadence, and
hardware certification remain owner acceptance gates.

The exact `be20f19` Mainnet owner run proved the indexed remote path could
complete, then exposed a repeat-rescan checkpoint discontinuity: a later
birthday anchor was constructed from genesis rather than the highest retained
BDK checkpoint, so BDK correctly rejected the introduced sparse chain. The
correction verifies that retained checkpoint against Core and extends it to the
new anchor before applying the indexed result. It also supersedes partial-run
resume behavior: cancelled, failed, and process-interrupted scan rows are
discarded, retries begin at zero from the saved birthday, and the Settings modal
never displays a stale prior range. The gap-limit tooltip is contained within
the rescan dialog. Follow-up owner evidence on `ae696ea` showed that the previous
completed row could still win the first UI poll, and that a single genesis-to-tip
`scanblocks` request failed after 18 seconds while the same node remained healthy.
The correction initializes the new zero-progress range before polling, ignores
terminal rows while that foreground command starts, and divides long indexed
scans into sequential ranges of at most 100,000 blocks with persisted progress
after each range. The remote transport still downloads matching blocks only and
performs one bounded descriptor-activity mempool pass; no per-height HTTPS walk
was reintroduced. No wallet, registry, descriptor,
proposal, backup, node-setting, dependency, DTO, or schema format changes; no
migration is required. Exact replacement-package repeat-scan timing and
Mainnet hardware certification remain owner acceptance gates.

The first exact `6a25085` owner retest then exposed a deployment mismatch rather
than a wallet or Core performance limit: the client and gateway allowed each
indexed range 120 seconds, but the live outer NGINX route still terminated reads
after 15 seconds. Core continued that abandoned process-wide scan, so unlock
refresh failed and the next birthday scan correctly encountered Core's active
scanner. The live route now uses the repository's 125-second outer bound. The
gateway additionally serializes its process-wide indexed scan slot and reports a
concurrent request as `scan_in_progress` rather than a missing connection. A
wallet-independent live check completed the selected-tip 64-block range in
0.012 seconds and confirmed the chunked genesis workload progresses on the
indexed Core path. No wallet, registry, descriptor, proposal, backup,
node-setting, dependency, DTO, or schema format changes; no migration is
required. Exact replacement-package wallet-script timing remains an owner gate.

The exact `78d3b4d` owner retest confirmed the saved multisig node credentials
and indexed sync remained usable, but exposed an unlock/navigation race in the
Overview presentation: a missed one-shot unlock hint could leave native Mainnet
admission unrestored for the first persisted snapshot read, even while the
route-independent synchronizer subsequently restored the session and completed.
Overview now treats that specific `node_admission_required` result as a
recoverable session transition, verifies the already-configured node once, and
retries the cached snapshot instead of telling the user to reconnect Bitcoin
Core. This changes no wallet, registry, credential, node-setting, DTO, or schema
format; no migration is required.

The exact `688ff7e` owner recording confirmed unlock and remote Core refresh
complete successfully, and exposed a presentation-only status polling race:
an older in-flight status read could overwrite the terminal 100% result with
its earlier 99% snapshot before the next poll restored completion. Overview now
accepts only the newest requested status read, so progress remains monotonic and
the completed state cannot regress. Native sync ordering, wallet data, node
settings, DTOs, schemas, and the 35-second automatic cadence are unchanged; no
migration or BIP-support change is required.

The subsequent exact-package Family Test unlock exposed a narrow JSON-RPC
gateway compatibility error: when indexed matching found exactly one relevant
block, Groot correctly sent a one-item batch for that block, but the gateway
collapsed it into a single upstream request and response object. The Rust batch
client rejected that response shape and surfaced the misleading
`network_unavailable` result after the indexed scan had succeeded. The gateway
now preserves the original batch shape independently of batch length, with an
integration regression covering the one-item request, upstream payload, restored
client id, and array response. No wallet data, credentials, persisted format,
DTO, dependency, or schema changes; no migration is required.

The 2026-09-19 Mainnet accounting review found no duplicate 7,000-satoshi
payment: the Ledger and multisig databases contain two distinct shared
transactions from separate dates, while the multisig CPFP remains its own
fee-only activity entry. It did expose a presentation race when a detail modal
was already open: the wallet snapshot and confirmation toast refreshed, but the
modal retained the previously clicked pending object. Overview and Activity now
retain only the selected transaction identifier and resolve its current record
from every authoritative snapshot, following the canonical RBF replacement when
needed. Network Services also restores vertical padding on its network row and
uses shorter copy. No native accounting, transaction graph, wallet data,
descriptor, proposal, node-setting, DTO, dependency, or schema format changes;
no migration is required. The reviewed Mainnet source-policy snapshot now pins
the exact Overview, Activity, and Settings route bytes containing this change.

The subsequent manual-sync failure polish is presentation-only. Overview,
Activity, and both Receive flows now preserve their last verified content while
showing the same concise retry banner, with enough following space to prevent
Activity search and sort labels from overlapping it. The sanitized
`network_unavailable` copy is shorter in every supported locale. Wallet sync,
credentials, node admission, persistence, DTOs, and schemas are unchanged; no
migration is required.

## 2026-09-19 Managed Mainnet enrollment and locked Settings continuity

ADR 0071 removes the shared-client-secret dead end without embedding a password
in source, build configuration, or environment. The gateway now issues unique
random principals through a separately source-throttled, size-bounded endpoint
and persists only scrypt verifiers. Native Rust consumes the one-time response,
rejects redirects, unknown fields, malformed credentials, wrong chain, IBD, and
missing indexed-scan capabilities, then uses the existing per-wallet encrypted
node-secret envelope. New Mainnet profiles and existing Mainnet profiles with no
saved node enroll automatically; every saved custom or managed configuration is
left untouched. An unavailable enrollment service leaves the wallet offline and
does not select a fallback node or fee.

The same follow-up fixes the recorded locked-route bounce. Startup and the
session monitor both treat Settings and App logs as intentional locked utility
routes, so the reduced **APP SETTINGS** surface remains stable instead of briefly
rendering before redirecting to Unlock. It exposes only appearance, language,
denomination, shortcuts, Bitcoin network selection, build identity, and sanitized
app logs. Wallet-specific node, sync, backup, recovery, export, and deletion
controls still require unlock. Existing wallet, registry, node-setting,
credential-envelope, descriptor, proposal, backup, and database formats are
unchanged; no migration is required. Gateway deployment, load/abuse review, and
exact-package Mainnet acceptance remain open GA gates.
