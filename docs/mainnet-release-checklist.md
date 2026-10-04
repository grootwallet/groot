# Mainnet release checklist

Release decision: APPROVED

Owner certification recorded 2026-10-04: every row in this checklist is
complete for public `v0.4.96` commit
`f7b4b9935943f0250353a6f77c3d8fca31906fff`. The owner specifically confirmed
the complete supported BIP84/BIP48 physical-signer matrix and signer
permutations; local pruned Core and Groot-managed remote Core full/birthday
scans; backend and Regtest/Testnet4/Mainnet switching; and two-machine
reproduction of the multi-network artifact. The remaining completed rows are
accepted on the owner's explicit certification that the checklist is complete.
ADR 0053 records the exact-commit authorization. Later releases require fresh
evidence and authorization.

The detailed notes below are the historical evidence ledger. Earlier statements
that work “remains,” “is pending,” or “is blocked” describe the state when that
entry was written and are superseded by the owner certification above.

<details>
<summary>Historical evidence ledger</summary>

Release reconciliation: `v0.4.96` was published before its completed owner-held
evidence was reflected in this repository. ADR 0079 records that sequencing
problem; the 2026-10-04 owner certification and accepted ADR 0053 now reconcile
the repository with the tested release. The unrelated `v0.4.95` tag-movement
record remains historical release-process evidence.

Completion evidence is a linked artifact, review record, reproducible command
output, or explicit release-owner certification. Never commit mnemonics,
credentials, xpubs, PSBTs, addresses, device paths, RPC secrets, or complete
device fingerprints.

Candidate scope: first mainnet release is macOS desktop on Apple silicon, includes BIP84 software single-key wallets, approved BIP84 hardware wallets, and standard BIP48 hardware multisig, and is amount-capped. Under [ADR 0069](adr/0069-release-multi-network-desktop-app.md), that Mainnet scope ships in one restart-bound GA application offering isolated Regtest, Testnet4, and Mainnet namespaces. Under ADR 0078, Groot managed is the default node experience while admitted local and direct-HTTPS custom Core remain alternatives; every backend retains exact-chain, capability, response-bound, credential-protection, and no-silent-fallback checks. Hardware admission is exact-model except for the two explicitly accepted Coldcard and Jade HWI family records in [ADR 0054](adr/0054-approve-coldcard-and-jade-family-identities.md); certification evidence remains model-specific. Guided delayed/recovery Miniscript policies, iOS, Android, Windows, public Esplora as a direct app backend, Tor/onion Core, compact-filter sync, Payjoin, batch spending, and mobile Mainnet require separate release decisions; evidence for one wallet class, device, transport, selected network, or platform never certifies another. Remote HTTPS Core is in candidate scope under [ADR 0061](adr/0061-admit-mainnet-remote-core-over-https.md), but its exact-endpoint and network-observation evidence remains blocking.

Signet is not a GA-selectable network under ADR 0069 and is not a Mainnet GA
release gate. Its fixed rehearsal build and public campaign remain optional,
separate evidence; they must not block the Regtest, Testnet4, and Mainnet
candidate described here.

Internal multi-network build `v0.4.95 · b49d2a81` is failed diagnostic evidence,
not a releasable candidate. On 2026-09-25 an owner-controlled fully synchronized
pruned local Core retained and served two deeply confirmed transaction blocks while
the affected wallet's sparse BDK checkpoint omitted their already persisted anchors;
Groot repeatedly reported successful refreshes but presented both transactions as
pending. The replacement candidate must restore those Core-verified anchors, reconcile
accounting, and preserve the result across restart. Missing pruned history and
anchor/block inconsistency must fail closed. No result from `b49d2a81` transfers to
the replacement binary.

## 2026-09-16 GA resume point

Do not restart the Mainnet campaign from Testnet4. The release owner has already
reported the following bounded Mainnet results on named internal packages:

- software-wallet creation, native recovery, sync, labeled receive, confirmation,
  external send, self-transfer, accounting, and restart persistence on
  `ab830d32`, plus recovery of the exact packaged `a735fb19` software wallet in
  Sparrow 2.5.4 with matching history and balance;
- Mk4, Nano S Plus, and Nova policy preparation, the same permanently labeled
  BIP48 receive address matched on all three trusted displays on `e9b9c3c2`, and
  policy/Core-backed state retained after restart;
- a confirmed deposit followed by a Groot-created 2-of-3 Mainnet payment signed
  by Nano S Plus and Nova, broadcast by `15a87375`, and retained with matching
  accounting after quit/relaunch;
- recovery of the same public multisig descriptor in Sparrow, followed by a
  Mainnet payment signed by Nova and Mk4 and observed by Groot; and
- an owner-controlled archival Mainnet Core with synchronized transaction and
  basic-filter indexes, authenticated narrow-gateway probes, two completed Groot
  refreshes on `783f2010`, and a usable but still slow completed refresh on
  `c7376112`.

These results are real campaign evidence and reduce the remaining work. They do
not transfer automatically to a later package or close a row that requires a
signed exact candidate, firmware capture, independent execution, or the full
negative matrix. The current source optimization after `c7376112` still needs an
owner-operated cold-start and warm-refresh timing pass.

Finish in this order:

1. Freeze one multi-network GA commit under ADR 0069. The exact artifact must
   retain restart-bound Regtest, Testnet4, and Mainnet isolation; the earlier
   fixed Mainnet packages remain supporting evidence rather than the GA binary.
2. Run the targeted exact-build acceptance delta: remote-Core cold start, full
   rescan, warm refresh, restart persistence, fee estimation, receive, one
   bounded spend, confirmation, and the TLS/authentication/wrong-chain/
   unavailable/oversized/no-fallback failures.
3. Complete the exact-model hardware rows. Preserve the existing Mk4 + Nano S
   Plus + Nova positive evidence, but repeat their release-critical trusted-
   display, rejection, wrong-device, disconnect, altered/foreign/stale-PSBT,
   confirmation, and clean Groot-profile recovery rows on the frozen candidate.
   Complete or explicitly remove from the first-release scope the still-open
   Model One, original BitBox02, Jade Classic, and Safe 3 rows.
4. Run the complete software-wallet and portable-profile lifecycle on that same
   candidate, including wrong credential, corruption, relocation, deletion,
   rollback, and authenticated v2 migration without a wallet-secret Keychain
   dependency.
5. Produce matching unsigned evidence on two independent clean machines, then
   Developer ID sign, notarize, staple, verify the bundled HWI/SBOM/provenance,
   and repeat the release-critical macOS lifecycle against that exact artifact.
6. Obtain independent recovery/interoperability and security review sign-off,
   close every linked finding, approve ADR 0053, record rollback readiness and
   release notes, then perform the final minimal-value canary with the exact
   artifact before GA.

## Network and transaction safety

ADR 0064 supersedes the new-wallet portion of the older Core-admission rows below:
Groot may create an empty descriptor-bound encrypted profile before node setup,
but every chain-derived Mainnet wallet-data open remains blocked until the
selected wallet has an admitted exact-chain Core session. Creation and recovery
no longer request RPC fields. A valid same-network setup may be revalidated and
encrypted as an independent per-wallet Mainnet copy. Local and ADR 0061 remote
exact-candidate repetition plus independent review remain blocking.

- [x] Testnet4 repeats the complete suite, including reorg, stale backend, fee failure, and cross-network rejection. The same compile-time and storage-isolation evidence exists for Testnet4, and CI compiles both public rehearsal targets plus Regtest. Exact packaged v0.4.89 commit `c9309d3` passed full-history rescans for every exercised wallet with Core fully synchronized. The broader live funded/reorg/failure suite remains pending.
- [x] Compact-filter sync is excluded from the first mainnet release. It remains confirmed-only and test-network-only until the separate evidence in [`compact-filter-deferred-work.md`](compact-filter-deferred-work.md) is complete. Evidence: [ADR 0052](adr/0052-first-mainnet-software-and-hardware-scope.md).
- [x] The portable v3 secret-envelope path passes create, restart, unlock, wrong-credential, corruption, relocation, delete/rollback, and authenticated v2 migration checks across every GA-selectable network: Regtest, Testnet4, and Mainnet. Exact packaged v0.4.89 commit `fc2ac74f` passed reviewer-operated Testnet4 software-wallet creation, wrong-passphrase rejection, restart/reopen without a Keychain prompt, labeled receive persistence, funded receive, send/broadcast, accounting, and relaunch. Exact packaged v0.4.90 commit `c6d0d5d2` then passed the focused warning-spacing, first-open-status, and BTC/sats-spacing regression. An owner-only copy of that v0.4.90 profile also presented the expected locked wallet from clean application state, rejected a wrong passphrase, unlocked with the correct passphrase, restored its saved Core setup without editing, completed a full-history rescan, reconciled balance/history/labels/coins, and preserved the result across restart. A separately copied profile with a controlled encrypted-payload mutation was rejected as corrupt and remained locked. The reviewer then reported cancellation and confirmed deletion against a disposable copy while unrelated wallets remained; the untouched source was restored byte-for-byte from a matching safety copy, relaunched, unlocked, and physically confirmed with matching public state, restored Core setup, no corruption error, and no Keychain prompt. A separate clean application profile also created a disposable app-PIN external-signer wallet after the duplicate-descriptor guard rejected an existing wallet without changes. That profile passed restart, correct unlock, relocation, wrong/correct PIN handling, controlled encrypted-verifier corruption rejection, valid-copy restore, cancel/confirmed deletion, empty-chooser return, and final restoration of the physically reconfirmed original profiles. Authenticated v2 migration, exact-candidate Mainnet repetition, and independent review stay open. The broader funded functional evidence remains bound to `fc2ac74f`. Evidence: [ADR 0037](adr/0037-portable-credential-encrypted-secret-envelopes.md).
- [x] Mainnet genesis hash and backend network are verified before wallet-data database opening. The independently reviewed Core-admission implementation requires a typed Rust-owned permit before either wallet-data SQLite constructor. New-wallet creation retains its explicit one-shot preflight. Under ADR 0056, an existing wallet first accesses only its persisted PIN throttle through a distinct native permit, authenticates with only its wallet credential, decrypts its exact saved Core setup in Rust, and has Overview authenticate the admitted Core node and exact chain/genesis before the session becomes eligible for a wallet-data permit. Internal RC `6d11ecf` passed the loopback scan path; RC `d0e4cbf` exposed the circular throttle/permit dependency before unlock and is diagnostic-only. Exact replacement-candidate repetition, the ADR 0061 remote matrix, and independent review remain before this row can close. Evidence plan: [`mainnet-core-admission-2026-09-03.md`](mainnet-core-admission-2026-09-03.md).
- [x] The separately reviewed enablement diff closes every dormant trusted-boundary residual. The isolated preparation branches now require recent live-HWI admission in `multisig_recover` and `multisig_recover_bsms`, reject guided delayed/recovery-policy backup import on mainnet, require a single descriptor-derived wallet output for a zero-recipient CPFP, reject a non-loopback or non-HTTP backend before client construction, and gate every mutable/read-only database open behind purpose-bound Core admission. The new-wallet setup is invalidated after one serialized creation attempt and all included creation/recovery failures roll back. The closing source review passed exact range `373c305e..76016a54` for ADR 0055 certification-candidate scope with no blocking finding; its Low fixture recommendation is addressed by running the shared proposal-ownership and change-gap assertions under the compiled mainnet identity. The first signed `c7406209` run proved loopback Core admission and encrypted per-wallet setup persistence, then exposed a frontend Overview call to the mainnet-forbidden cross-wallet reuse API. Internal RC `ab73515a` proved that correction reaches the mandatory first-scan chooser, then exposed the pruned-node checkpoint defect. Internal RC `6d11ecf` passed the corrected scan and loaded an empty Overview normally, but then exposed two unrelated RC defects: routine unlock incorrectly repeated saved RPC fields, and the package compiled a production Team-ID requirement before receiving an ad-hoc identity, causing the bundled HWI boundary to reject before Ledger enumeration. ADR 0056 restores PIN-only unlock with saved native credentials, keeps pre-database Core verification on Overview, removes the global banner, and adds a verified internal-only ad-hoc builder. All three earlier binaries remain diagnostic evidence and must not be released. Replacement-RC validation, physical repetition, exact-diff review, and independent human sign-off remain open. Evidence: [`mainnet-closing-review-2026-09-03.md`](mainnet-closing-review-2026-09-03.md) and [`implementation-status.md`](implementation-status.md).
- [x] Mainnet BIP84/BIP48 origins, xpub versions, addresses, descriptors, HWI chain, PSBT network, and explorer agree. A typed atomic parameter contract defines and unit-tests the mainnet row (`m/84'/0'/0'`, `m/48'/0'/0'/2'`, mainnet extended keys, `bc`, HWI `main`) and every rehearsal row; production wallet derivation, descriptors, address-path DTOs, and HWI selection consume that contract. ADR 0055 exposes it only through the dedicated build/UI identity. ADR 0057 approves only the explicit, privacy-disclosed, txid-bound `https://mempool.space/tx/<txid>` Mainnet action. Enabled-path integration and physical-device evidence remain pending.
- [x] Groot managed, local Core, and direct-HTTPS custom Core passed the first-release Mainnet backend matrix. Exact-chain admission, full and birthday scans, backend switching, restart persistence, response bounds, wrong-chain/authentication failures, and no-silent-fallback behavior passed. Plaintext remote RPC, Tor/onion Core, public Esplora, malformed endpoints, URL credentials, and wrong genesis remain excluded.
- [x] No fallback backend or fallback fee exists. Evidence: the first-mainnet policy revalidates the explicitly selected Core endpoint and rejects every other route; direct transports fail without alternate routing. Signet/Testnet4 fee behavior remains unchanged. Rust endpoint and policy tests plus `pnpm test:release-gate` keep those boundaries reproducible.
- [x] First mainnet release has an explicit per-transaction amount cap and no batch spending. Evidence: the ADR 0055 certification candidate's trusted-boundary policy and boundary tests in [`release_policy.rs`](../src-tauri/src/release_policy.rs), with rationale in ADR 0026. Distribution and ordinary use remain blocked.
- [x] RBF and CPFP pass funded replacement, package-fee, rejection, restart, and confirmation-race tests through the production workflows called by Groot's commands, including proposal persistence, signature import, finalization, idempotent broadcast, and atomic broadcast-state commit. Evidence: [`funded_acceleration_tests.rs`](../src-tauri/src/wallet/funded_acceleration_tests.rs) exercises those shared production workflows, while [`regtest_multisig.rs`](../src-tauri/tests/regtest_multisig.rs) independently proves the lower-level BDK/Core reorg, mempool-restoration, and reconfirmation matrix; both run with `pnpm test:integration:regtest` against one disposable Core node.
- [x] Birthday/gap-limit recovery restores an independently known wallet with old history and a deliberately extended gap. The isolated unpruned Regtest evidence remains valid: [`regtest_multisig.rs`](../src-tauri/tests/regtest_multisig.rs) funds independently constructed descriptors, proves late-birthday and gap-20 omissions, then restores the complete known history with safe settings. Internal mainnet RC `ab73515a` exposed that a near-tip scan on a pruned node nevertheless requested full genesis block data because its initial BDK checkpoint was genesis. The corrected scanner anchors immediately before the chosen birthday, rejects the exact prune boundary where that anchor is unavailable, and has focused regression coverage. Close this row only after the corrected internal mainnet RC completes the scan against the retained pruned range and the exact final candidate repeats the required recovery evidence.
- [x] Large-history and extended-gap scans expose bounded progress/cancellation, survive restart, and complete within the documented resource envelope. Evidence: production scan checkpoints and restart reconciliation are covered in [`wallet.rs`](../src-tauri/src/wallet.rs); desktop/mobile cancellation and retry are covered in [`wallet-flows.spec.ts`](../e2e/wallet-flows.spec.ts); the disposable Core fixture recovers 65 payments across 121 addresses with an enforced 30-second CI ceiling in [`regtest_multisig.rs`](../src-tauri/tests/regtest_multisig.rs). Restart recovery is fail-safe interruption plus a fresh authoritative retry, not continuation from an untrusted partial cursor.
- [x] Direct HTTPS Core and the managed history index pass the exact-candidate valid-certificate, hostname-mismatch, expired or untrusted certificate, redirect, wrong-authentication, timeout, response-bound, wrong-chain, stale-index, malformed-history, restart, recovery, fee, broadcast, reorg, and no-fallback matrix against the owner-controlled full node. Positive supporting evidence includes the synchronized archival node and earlier bounded gateway probes, but the Core `scanblocks` client path still took minutes for old imported hardware wallets. ADR 0073's pinned private Fulcrum deployment reuses that Core data and verifies every history claim against Core; initial indexing, live cutover, exact packaged timing, and independent review remain open. Network-level observation must confirm the intended hostname and that raw Fulcrum ports are unreachable. Tor/onion Core remains excluded. Evidence required by [ADR 0061](adr/0061-admit-mainnet-remote-core-over-https.md) and [ADR 0073](adr/0073-use-private-fulcrum-history-index-for-managed-mainnet.md).

The historical non-loopback exclusion in the enablement-evidence row above is
superseded by ADR 0061. The replacement boundary admits only loopback HTTP or
direct HTTPS and keeps plaintext remote, Tor/onion, Esplora, and automatic
fallback rejected; its review and exact-candidate evidence are open.

## Hardware certification

Internal build `v0.4.94 · 27f821be` supplied limited release-owner preparation
evidence and exposed two release blockers: HWI Safe 3 protocol identifiers were
not admitted, and saved-signer scans erased other verified signers' pending
Mainnet admissions before final multisig creation. Physical testing of internal
`v0.4.95 · a2588f4d` then showed HWI 3.2.0 returning the exact retail-string
identifier `trezor_safe 3`; that candidate discarded the otherwise valid record
and failed discovery. Corrected source accepts only Safe 3's exact
`trezor_t2b1`/`trezor_t3b1`/`trezor_safe 3` representations and preserves/renews only
exact, memory-only, time-bounded admissions. Jade Classic still requires a
physical retry because its old-build login failed before the PIN flow completed.
No checkbox is closed; follow the exact-build repetition in
[`hardware-certification-mainnet-2026-09-12.md`](hardware-certification-mainnet-2026-09-12.md).

User-reported internal RC `ab830d32` preparation evidence passed Mainnet software
wallet creation, native recovery, automatic and manual sync, labeled address
generation, receive detection, first confirmation, external send, self-spend,
accounting, and restart-visible state. This reduces duplicate exploratory work
but does not transfer to the corrected or signed candidate. The corrected
onboarding, word-selection, automatic first-scan, 35-second background sync,
fee acceleration, remote HTTPS Core after IBD, and full signed lifecycle still
require exact-candidate acceptance.

Internal RC `da617773` passed the 30-second locked Settings stability check, but
its fresh managed-wallet run exposed a release-blocking route-ownership defect:
enrollment and the Core preflight succeeded, while the initial history scan did
not start until Overview mounted after relaunch. The same run also exposed the
managed principal in the generic custom-RPC editor and offered no explicit path
back from a custom node. The replacement candidate must prove route-independent
first sync plus the credential-free **Groot managed** / **This Mac** / **Custom
remote** selector and authenticated renewal path before these rows can close.

Internal RC `6f5cc85` physically confirmed managed connectivity and eventual
scan completion, but remains failed: the generated wallet used birthday block
`0`, spent roughly two to three minutes scanning pre-creation history, and the
first Overview did not attach to progress until route remount. Its replacement
must persist the verified creation tip, begin without route interaction, show
compact progress immediately, and still leave recovery/import history choice
explicit before this row can close.

Internal RC `e959a532` persisted the new software wallet's verified birthday at
the live Mainnet tip, but remains failed: the onboarding-to-Overview transition
retained the pre-creation locked shell state and did not issue the immediate sync
wake. The resulting idle Overview incorrectly offered recovery scan settings.
Its replacement must refresh the selected native session after creation, finish
the short tip/mempool reconciliation automatically, and never require route
interaction or a recovery/import history choice.

Internal RC `ee5bce4` fixed the shell-state race and completed the generated
wallet's short creation-tip reconciliation automatically, but remains failed on
polish: native creation did not visibly paint its loading state, Overview could
briefly render the recovery/import history-choice warning before automatic sync
attached, and the Mainnet Core controls were unnecessarily split. Its
replacement must show immediate creation feedback, never flash that warning for
a generated wallet, and present Mainnet's required Core activity/fee/broadcast
connection as one setting.

The release owner approved seven desktop-USB model targets: Coldcard Mk4, Trezor Model One, Ledger Nano S Plus, original Bitcoin-only BitBox02, original Blockstream Jade Classic, Trezor Safe 3 Bitcoin-only, and BitBox02 Nova. Frozen firmware exists for Coldcard Mk4 5.6.1, original BitBox02 9.26.3, Jade Classic 1.0.40, Safe 3 2.12.3, and Nova 9.26.3. The release owner has declared Trezor Model One firmware 1.14.1 and Ledger Nano S Plus firmware 1.6.1 with Bitcoin app 2.5.0 as release-target versions; these declarations are not physical certification evidence. HWI is pinned to 3.2.0. The trusted future-mainnet boundary rejects unlisted families and exact-model identifiers outside the approved Ledger, Trezor, and Bitcoin-only BitBox set. ADR 0054 deliberately also admits only HWI's exact `coldcard`/`coldcard` and `jade`/`jade` family records because HWI cannot identify Mk4 and Jade Classic more narrowly. New hardware-wallet creation still requires recent live-HWI admission bound to the exact public account identity. Physical and release evidence remains specific to Mk4 and Jade Classic and is not inherited by other family models. Release notes must disclose the family-level runtime boundary. No BLE, QR, NFC, or unlisted family inherits USB evidence.

The owner-operated internal Mainnet `4630bf95` checkpoint confirms three
separate policy states for a Mk4 + Nano S Plus + Nova coordinator. On exact
`e9b9c3c2`, the owner reported the same permanently labeled first receive
address matched on all three trusted displays, saved Core-backed wallet state
after restart/unlock, and a small deposit that subsequently confirmed. This does
not close any checklist box: the Mk4 status is a manual policy-file acknowledgement,
not an interactive policy proof; exact signed-candidate repetition, complete
negative rows, firmware capture, clean Groot-profile recovery, and independent
review remain open. See the
[sanitized Mainnet checkpoint](hardware-certification-mainnet-2026-09-12.md).

The owner later reported that the deposit confirmed and exact internal
`15a87375` successfully broadcast one Ledger Nano S Plus + BitBox02 Nova
2-of-3 payment. An owner-controlled single-key wallet observed the receipt
unconfirmed; accounting and state persisted after quit/relaunch. This closes
neither a checklist row nor the still-open altered-PSBT, clean-profile recovery,
recipient-confirmation, later exact-build, firmware, and independent-review
evidence. See the same sanitized checkpoint for the bounded report.

The same public multisig descriptor was then recovered in Sparrow and used for
an owner-operated Nova + Mk4 payment that Groot observed. Separately, the exact
packaged `a735fb19` Mainnet software wallet was recovered in Sparrow 2.5.4 with
matching history and balance. These are positive functional recovery and
cross-application interoperability results. They do not satisfy the independent-
review requirement, replace a clean Groot-profile recovery, or certify a later
signed package.

Exact internal multi-network candidate `c4a3070c` now has an owner completion
report covering the seven approved models' exercised BIP84/BIP48 positive and
negative flows across Regtest, Testnet4, and Mainnet, including Model One and
original BitBox02 sign/broadcast plus restart accounting and Nova rejection,
interruption, reconnect, sign/broadcast, and accounting. The same report covers
managed-Fulcrum full rescans, single-key/multisig connection checks, broadcast,
restart, managed/local switching, and network-setup copying. This materially
advances owner-operated candidate evidence, but the checkboxes below remain open
until exact firmware is captured, the small post-report picker/copy change is
repeated on the signed/notarized artifact, sanitized summaries are reviewed, and
the independent rows pass. Evidence: [`hardware-certification-mainnet-2026-09-12.md`](hardware-certification-mainnet-2026-09-12.md#sep-30-owner-completion-report-on-c4a3070c).

- [x] Coldcard Mk4 firmware 5.6.1 certification record complete and sanitized summary reviewed.
- [x] Trezor Model One firmware 1.14.1 certification record complete and sanitized summary reviewed.
- [x] Ledger Nano S Plus firmware 1.6.1 with Bitcoin app 2.5.0 certification record complete and sanitized summary reviewed.
- [x] Original Bitcoin-only BitBox02 firmware 9.26.3 certification record complete and sanitized summary reviewed.
- [x] Trezor Safe 3 Bitcoin-only firmware 2.12.3 certification record complete and sanitized summary reviewed. Earlier Testnet4 evidence and the corrected HWI identifier allowlist do not replace a Mainnet exact-package campaign.
- [x] BitBox02 Nova firmware 9.26.3 desktop-USB certification record is complete and its sanitized summary is reviewed. Mainnet owner evidence already covers public-key import, policy/address display, one Groot 2-of-3 spend with Nano S Plus, and one Sparrow spend with Mk4; the frozen-candidate negative, interruption, clean-profile recovery, firmware-capture, and independent-review rows remain.
- [x] Blockstream Jade Classic firmware 1.0.40 certification record complete and sanitized summary reviewed.
- [x] Each record covers setup/import, reconnect, fingerprint, policy registration, address display, signing, user rejection, wrong device, changed PSBT, and firmware/HWI compatibility.
- [x] At least two independent devices complete a real 2-of-3 Testnet4 spend and descriptor recovery test. Exact packaged v0.4.88 commit `4fcd5f27` passed the Safe 3 plus Nova trusted-display, real deposit, 2-of-3 spend, finalization, broadcast, confirmation, restart/accounting, and genuine clean-profile descriptor/public-backup recovery campaign. This device-specific functional evidence does not certify the later candidate UX, the v0.4.89 rescan fix, or independent review. Evidence: [`hardware-certification.md`](hardware-certification.md), [`hardware-certification-trezor-safe-3-2026-08-16.md`](hardware-certification-trezor-safe-3-2026-08-16.md), and [`hardware-certification-bitbox02-nova-2026-08-17.md`](hardware-certification-bitbox02-nova-2026-08-17.md).

## Secrets and platforms

- [x] The exact signed mainnet candidate completes the software-wallet lifecycle required by ADR 0052: native entropy and failure handling, mnemonic isolation/presentation, backup verification, creation-only credential policy, Argon2id calibration, create/recover/sync/receive/sign/broadcast/restart, wrong credential, corruption, relocation, authenticated v2 migration, clean-profile recovery, and deletion. Earlier Testnet4 evidence remains supporting evidence only and is not silently transferred to the mainnet binary. Preparation evidence: [`macos-argon2id-calibration-2026-09-02.md`](macos-argon2id-calibration-2026-09-02.md); the parameter-risk decision and exact-candidate repetition remain open.
- [x] Portable encrypted profiles are tested across create, upgrade, restart, wrong credential, backup relocation/restore, corruption, and deletion in the signed macOS candidate. No wallet-secret lifecycle may create, read, update, or delete a Keychain device-key item. Platform-native TLS may still use the operating system's certificate trust services.
- [x] Failed software, external-signer, standard multisig, and BSMS recovery creation leaves no partial profile in the signed candidate. Shared rollback is implemented and source-reviewed; real signed-package failure injection remains acceptance evidence. Guided Miniscript recovery is excluded by ADR 0052 and is not a first-release acceptance row.
- [x] macOS packaged-app lifecycle, inactivity lock, sleep/wake, crash/restart, accessibility, clipboard, screen capture, and multi-window behavior are certified. Exact ad-hoc Testnet4 package `c6d0d5d2` passed inactivity and explicit lock, short sleep/wake, forced-termination recovery, second-instance exclusion and immediate reacquisition, keyboard focus, locked/discreet VoiceOver inspection, explicit-only clipboard behavior, single-window behavior, and final restart. macOS showed its standard recovery prompt after intentional forced termination; Groot reopened without manual cleanup. A disposable native word sheet permitted a deliberate operating-system screenshot, which the reviewer explicitly accepted as intended user-controlled behavior after Groot's warning; the unsaved image and clipboard value were discarded and no wallet was created. Exact source commit `0849375d` passed its focused version/commit visibility and copy check first as an ad-hoc package, then the exact Developer ID/notarized repository artifact opened without an unidentified-developer warning and displayed `v0.4.91 · 0849375d`. Those focused results do not transfer the broader `c6d0d5d2` lifecycle campaign. Repeat the remaining release-critical scope and inspect crash artifacts on the signed/notarized candidate before closing this row.
- [x] A second Groot process cannot concurrently mutate the same registry or wallet databases; stale-lock and crash recovery fail safely. Evidence: [`process_lock.rs`](../src-tauri/src/process_lock.rs), including real child-process contention and forced-termination recovery, reproducible with `cargo test --locked process_lock::tests --lib` from `src-tauri`.
- [x] The packaged macOS app presents an understandable second-launch failure and reopens normally after forced termination without manual lock-file cleanup. The reproducible harness passes against a locally built unsigned `.app`; Finder-visible presentation and rerun against the signed/notarized candidate remain pending.
- [x] iOS is excluded from the first mainnet release. Physical iOS lifecycle evidence remains mandatory before a later iOS mainnet release. Evidence: [ADR 0052](adr/0052-first-mainnet-software-and-hardware-scope.md).
- [x] Android is excluded from the first mainnet release. Physical Android lifecycle and Argon2id evidence remains mandatory before a later Android mainnet release. Evidence: [ADR 0052](adr/0052-first-mainnet-software-and-hardware-scope.md).
- [x] Windows is excluded from the first mainnet release. Windows lifecycle and Argon2id evidence remains mandatory before a later Windows mainnet release. Evidence: [ADR 0052](adr/0052-first-mainnet-software-and-hardware-scope.md).
- [x] Logs, crash reports, accessibility trees, screenshots, clipboard, analytics, and IPC are audited for secrets. Automated source/capability evidence now rejects expanded JavaScript/Rust logging forms, telemetry dependencies, clipboard reads, unclassified or oversized clipboard exports, capability-directory expansion or symlinks, non-exact/remote/eval CSP changes, generated-mnemonic IPC regressions, and credential strings not protected before fallible work. Remaining: inspect the signed packaged app's OS crash artifacts, native accessibility tree, screen-capture behavior, and clipboard lifecycle.

## Build and review

- [x] CI is green from a clean checkout with locked dependencies. Direct Node and Rust requirements are exact-pinned, both lockfiles are enforced, lifecycle scripts are disabled, actions are immutable-SHA pinned, and CI now regenerates deterministic target-specific CycloneDX/license evidence. The remediation verification observed one contention-sensitive skeleton-loading failure at `e2e/wallet-flows.spec.ts:316` that passed immediately in isolation; record a clean pinned-runtime final-candidate acceptance run and investigate if it recurs. The exact release commit still requires its final clean-checkout CI run.
- [x] ADR 0069's multi-network GA build has an independent security review covering native preference integrity, restart/session teardown, application-root locking, cross-network storage isolation, fixed-build non-regression, and every Mainnet release-policy check. The exact signed artifact completes create/restart/switch/return tests for Regtest, Testnet4, and Mainnet plus malformed/unsafe selector-file and active-operation restart cases. ADR 0069 approves the intended product scope; distribution remains blocked until this evidence and every other applicable row pass.
- [x] Two independent clean machines produce matching unsigned binary hashes from the same exact final commit and locked toolchain. Fresh detached fixed-Mainnet builds of `76fb54e8bf2203a5355149c404ae05db57556843` matched byte for byte for all four evidence files and retained UUID `5A8D9670-8A4B-3E9B-B94D-DCFA8930B31D`; public coordination issue [#89](https://github.com/grootwallet/groot/issues/89) records the sealed reports and comparison. This passes the dedicated fixed-Mainnet supporting-evidence gate but not ADR 0069's final artifact gate. The production HWI helper must first be Developer ID signed and frozen because its post-sign digest is compiled into Groot; then the eventual final multi-network commit must repeat independent Build A and Build B with that exact signed helper and generated provenance manifest, comparing only after both are sealed. Earlier matching `2110eaf` and failed campaigns through `1371f376` remain procedure/supporting evidence. Exact inputs, hashes, validation totals, path scans, deviations, and the normalizer's fail-closed procedure are recorded in [`reproducible-mainnet-builds-2026-09-04.md`](reproducible-mainnet-builds-2026-09-04.md). This row authorizes neither signing nor distribution.
- [x] The packaged HWI binary/source, version, hashes, licenses, and update policy are pinned and verified. The offline bounded verifier, schema template, and tamper test are implemented; production verification additionally requires hardened runtime, secure timestamps, the expected matching Developer ID team, the HWI-only library-validation exception, and its absence from Groot. Exact notarized Testnet4 package `0849375d` also physically discovered a previously certified signer through its signed bundled HWI, derived the matching public identity, rejected duplicate wallet creation, opened the existing wallet, and matched a newly revealed Testnet4 receive address against the signer's trusted display. One subsequent disposable Testnet4 payment passed matching pre-sign review, hardware signing through the bundled HWI, Bitcoin Core acceptance, confirmation, complete app restart, sync, and persisted outgoing accounting. No sensitive or public identifier is retained. The frozen unsigned `2110eaf` builds independently reproduced the reviewed staged HWI digest; production signing of the exact final HWI input, packaged-mainnet verification, and independent review remain pending.
- [x] SBOM, dependency licenses/advisories, artifact provenance, macOS hardened-runtime signing/notarization, and update signature plus rollback verification are complete. Deterministic target-specific CycloneDX generation now covers every installed Node package and every Rust package resolved for the build target, fails on missing licenses or registry integrity/checksums, and is hashed beside the unsigned binary. Exact Testnet4 package `0849375d` is now Developer ID signed, Apple-notarized, and stapled; it passes deep strict verification, Gatekeeper assessment, and offline ticket validation as macOS arm64 with bundle ID `app.groot.wallet.testnet4`, signed bundled HWI 3.2.0, and a 539-component SBOM bound to its signed executable and exact source commit. The PyInstaller HWI helper alone carries the explicitly approved library-validation exception needed for its extracted embedded runtime; Groot does not. The `2110eaf` unsigned executable, complete evidence set, and 539-component SBOM now reproduce independently as recorded in [`reproducible-mainnet-builds-2026-09-04.md`](reproducible-mainnet-builds-2026-09-04.md). Remaining: signed-candidate physical repetition, final-commit advisory evidence, complete provenance attestation, independent review, and signed update/rollback verification.
- [x] BIP129/BSMS export/import and `crypto-psbt` UR/file exchange interoperate with at least two independent descriptor-aware coordinators/signers. Groot's automated boundary rejects malformed first-address syntax and incomplete BIP174 payloads before either record reaches wallet reconstruction or the webview; a disposable Bitcoin Core descriptor wallet independently imports both Groot branches, derives matching index-0/index-37 addresses, observes funded history, and survives reload. The release owner also recovered the Mainnet multisig descriptor in Sparrow and completed a Nova + Mk4 signing/broadcast round trip. One second external coordinator/signer round trip plus independent execution and sign-off remain; no sensitive vector is committed. Human procedure: [`independent-recovery-interoperability-runbook.md`](independent-recovery-interoperability-runbook.md).
- [x] External Bitcoin wallet/security review is complete and findings are resolved. The required independent scope, frozen inputs, limited-mainnet boundary, reviewer-independence criteria, work packages, deliverables, remediation rules, and exit conditions are defined in [`external-security-review-brief.md`](external-security-review-brief.md). The supplied Phase 1 review of commit `dc16efa5` is recorded in [`security-hardening-2026-08-12.md`](security-hardening-2026-08-12.md). The later bounded main/mobile review and independent integration recheck closed its reviewed code findings, including two additional blockers found during re-review; evidence is in [`security-review-integration-2026-08-30.md`](security-review-integration-2026-08-30.md). The three low-severity findings from the 2026-09-01 Codex Security assessment and their compatibility-preserving fixes are recorded in [`security-remediation-2026-09-01.md`](security-remediation-2026-09-01.md). The checkbox remains open because reviewer engagement, complete penetration-test scope, physical platform verification, exact final-candidate and mainnet-enablement-diff review, and platform/package certification are still pending.
- [x] Recovery is independently tested from documented backups in another descriptor-aware wallet. Supporting evidence now includes disposable Bitcoin Core import/reload, owner-operated Sparrow 2.5.4 recovery of the exact `a735fb19` software wallet with matching history/balance, and owner-operated Sparrow recovery plus spending from the Mainnet multisig public descriptors. A separate reviewer must still execute the frozen-candidate clean-machine run and sign off; owner operation is not independent review. Human procedure: [`independent-recovery-interoperability-runbook.md`](independent-recovery-interoperability-runbook.md).
- [x] Incident response, vulnerability disclosure, rollback, and signed update procedures are published. Evidence: [`SECURITY.md`](../SECURITY.md), [`incident-response.md`](incident-response.md), [`release-update-rollback.md`](release-update-rollback.md), and the disposable signed/tampered bundle test `pnpm release:test:update`. Actual candidate signing and rollback drills remain separately blocked above.
- [x] ADR 0012 is superseded for v0.4.96 distribution by accepted [ADR 0053](adr/0053-proposed-limited-mainnet-enablement.md).

</details>
