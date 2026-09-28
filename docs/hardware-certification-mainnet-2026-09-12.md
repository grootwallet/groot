# Mainnet hardware checkpoint — 2026-09-12

## Sep 28 owner-reported focused retest

Reported after the ab92d31d handoff; attached crops do not independently display
the package commit. No new firmware versions were reported.

- False address-reuse warning is gone after the correction.
- Original BitBox02 policy re-verification and address verification passed.
- Owner reports the same successful policy/address and cancel/reject/unplug/replug
  handling for Nova. Keep the two exact models separate in certification.
- Model One receive-address verification passed.
- Mixed non-wallet devices were correctly identified except an unlocked Ledger
  Nano S Plus was missing. Source inspection found receive's family filter;
  removing that filter is a candidate UI fix, not a new physical Ledger pass.
- Discovery remains approximately 2–4 seconds by owner report, not instrumented
  timing evidence or a closed performance issue.
- Original-confirmation-during-RBF-signing observation is still pending. No
  transaction, signing-pair, confirmation, recovery, or GA completion is inferred.

Next: verify concise policy copy, Ledger visibility, and exact discard target;
report the pending RBF race outcome, then continue C's missing signing pairs.

The [Sep 26 HWI investigation](hwi-performance-investigation-2026-09-26.md)
adds no physical pass: only no-device startup measurements and a fixture-tested
BitBox policy reconnect candidate. Original BitBox02 and Nova require separate
packaged policy/address/cancel/retry retests; discovery latency remains open.

This sanitized checkpoint records release-owner testing performed with the
internal Mainnet application shown as `Groot v0.4.94 · 27f821be`. It does not
transfer evidence to a later source commit or package. Firmware versions were
not re-reported during this checkpoint, so the release-target versions in the
canonical matrix remain targets rather than evidence for this run.

No seed, credential, fingerprint, account key, descriptor, address,
transaction identifier, or device path is retained here.

## Reported results

| Scope                                         | Result                    | Exact observation                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ledger Nano S Plus BIP48 public-key sharing   | Pass                      | The release owner reported successful Mainnet BIP48 public-account-key sharing.                                                                                                                                                                                                                                      |
| BitBox02 Nova BIP48 public-key sharing        | Pass                      | The release owner reported successful Mainnet BIP48 public-account-key sharing.                                                                                                                                                                                                                                      |
| Trezor Safe 3 public-key sharing              | Blocked                   | Groot rejected HWI's hardware record before PIN/passphrase interaction. Source review found that HWI 3.2.0 derives its model string from Trezor's protocol model code: Safe 3 revision A reports `trezor_t2b1` and revision B reports `trezor_t3b1`; Groot's Mainnet allowlist incorrectly expected `trezor_safe_3`. |
| Blockstream Jade Classic public-key sharing   | Blocked                   | The device was discovered, but account-key import failed before the expected PIN login completed. No error code or firmware version was captured, so this remains an exact-candidate physical retest rather than a claimed source fix.                                                                               |
| Coldcard Mk4 wrong-network handling           | Pass                      | A Mk4 configured for Testnet4 was rejected as wrong-network. After the owner changed the device to Mainnet, public-key sharing succeeded.                                                                                                                                                                            |
| 2-of-3 policy with Mk4, Nano S Plus, and Nova | Pass through registration | Policy construction and every requested device-policy registration/first-address check were reported successful.                                                                                                                                                                                                     |
| Final 2-of-3 wallet creation                  | Blocked                   | Creation failed after the coordinator PIN with a request to scan/import an already approved signer again. Source review found that every saved-signer lookup invalidated the other signers' still-valid, exact Mainnet admissions.                                                                                   |
| Detailed public-key dialog                    | UI failure                | Opening the complete xpub from an already open verification dialog misplaced the nested dialog, split the backdrop, and left background scrolling available.                                                                                                                                                         |
| Loading indicator                             | UI failure                | The loading glyph appeared to restart or stop instead of rotating continuously.                                                                                                                                                                                                                                      |

## Corrections awaiting exact-build physical repetition

- Mainnet admits only HWI's exact Trezor Model One identifier `trezor_1` and
  Safe 3 revision identifiers `trezor_t2b1`/`trezor_t3b1`; other Trezor model
  identifiers remain rejected.
- A successful live signer policy/address proof renews that exact signer's
  memory-only admission. Subsequent device scans preserve other unexpired exact
  approvals gathered during the same setup, without an additional PIN-step
  signer checklist. Explicit cancellation, leaving setup, app restart, and the
  15-minute timeout still clear admissions. The earlier requirement to recheck
  every admission at final creation was superseded by ADR 0065 after saved-draft
  restart testing showed it could never survive a normal relaunch.
- Shared dialogs are portaled to the document body while retaining the shared
  reference-counted scroll lock, preventing a nested identifier dialog from
  inheriting a transformed parent or creating a second partial backdrop.
- The shared loading class uses one namespaced continuous rotation animation.

## Required retest on the new exact build

1. Record the displayed Groot version/commit, macOS version, HWI 3.2.0 package
   verification, exact model, firmware, transport, and reviewer.
2. Repeat Safe 3 BIP48 import for the connected hardware revision and its
   on-device PIN/passphrase path. Do not credit the source-level identifier fix
   as physical evidence.
3. Repeat Jade Classic discovery, login, BIP48 import, policy/address proof,
   rejection, and retry. Capture only Groot's stable error code if it fails;
   do not retain raw HWI output or device identifiers.
4. Rebuild the Mk4 + Nano S Plus + Nova 2-of-3 wallet, register every policy,
   set the coordinator PIN, create the wallet, restart, unlock, sync, and verify
   the first permanently labeled receive address on each capable signer.
5. Repeat wrong-network, wrong-device, disconnect/reconnect, user rejection,
   changed-PSBT, signature merge/removal, threshold finalization, broadcast,
   confirmation, restart/accounting, and clean-profile descriptor recovery.
6. Open and close every complete fingerprint/path/xpub view while a parent
   dialog is open. Confirm one centered dialog, one complete backdrop, no page
   scroll, restored parent scroll, keyboard focus containment, and Escape/close.

This checkpoint does not close any Mainnet distribution gate.

## 2026-09-13 saved-draft follow-up (new source candidate; no physical pass yet)

The 2026-09-12 correction above did not solve a draft reopened after Groot
restarted: all memory-only admissions had expired by design. ADR 0065 now
allows that public draft to create an offline watch-only coordinator without
adding a PIN-page live-device checklist. Native Mainnet address creation is
blocked until enough distinct Ledger/BitBox02/Jade signers have persisted an
exact first-address policy proof to reach the spending threshold, and every
Coldcard policy file has its separate acknowledgement. Coldcard and Trezor do
not count toward that interactive quorum in this candidate. No signing,
recovery, node, or device-specific certification evidence is inherited.

The release owner must test the **same saved draft**, not only a fresh setup:
close Groot at the coordinator PIN step, relaunch, resume, create with the PIN,
and confirm the new wallet opens without rescanning merely for creation. Before
the required policy proofs, attempt a labeled receive address and confirm the
native denial plus Policy-page recovery action; after verifying Nano S Plus and
Nova's complete first address and acknowledging the Mk4 policy, create and
independently verify the first receive address. Repeat restart, sync, PSBT
signing, recovery, and the ordinary wrong-device/wrong-network checks on the
exact packaged commit. Do not fund the test wallet until the trusted displays
match the intended descriptor and address.

## 2026-09-13 `08f45e1` observed follow-up and retest requirement

The reviewer reports that the exact internal `08f45e1` app created the Mk4 +
Nano S Plus + Nova 2-of-3 coordinator, but it opened without the expected
copied Core setup. Coldcard policy acknowledgement was rejected by the node
permit; the Policy page displayed multiple offline warnings and potentially
misleading “Saved signer not found” states for Nano S Plus and Nova.
This does **not** establish that HWI stopped detecting either device: the
previous UI conflated a missing policy-address reference with a missing HWI
result. No device-policy pass is recorded for this build.

Retest the replacement candidate in this order: unlock the source wallet and
verify its exact Mainnet Core connection; return to the existing offline
coordinator and adopt that saved setup in Settings; reopen Policy and confirm
one status message at most; import and explicitly compare the Mk4 policy file
using microSD or enabled Virtual Disk, then record it; verify Nano S Plus and
Nova policy and first address on-device; close and reopen Groot, check the
durable per-signer states and Core-backed overview, and only then attempt a new
labeled receive address. A fresh multisig creation must separately exercise
both a ready copied source and a deliberately locked or failing source, proving
that selected reuse never silently publishes an offline wallet. Continue the
existing funding, signing, backup, recovery, and adversarial gates afterward.
No Mainnet release or physical certification gate is closed by this source fix.

## Reviewed source-policy snapshot

This correction refreshes the Mainnet source-policy tripwire for only three
reviewed files: multisig profile creation (`1972d5b689e5…`), network setup
adoption (`17c0f29438ee…`), and the multisig onboarding route
(`35bed610371d…`). These changes fail closed on a requested but unsuccessful
network copy, retain the checked Core session after adoption, and expose a
saved source even when it must first be unlocked. HWI and device identity code
is unchanged. The full hashes remain executable policy in
`verify-mainnet-source-policy.mjs`; this shortened documentation is not a second
authority. The release gate must pass after any later byte change.

## 2026-09-13 exact `4630bf95` owner-operated checkpoint

The release owner tested the internal Mainnet app displaying `v0.4.94 ·
4630bf95`. The existing Mk4 + Nano S Plus + Nova 2-of-3 coordinator opened with
an admitted Core connection. Its Policy page showed the Mk4 policy file as
**Policy imported**, and the Nano S Plus and exact BitBox02 Nova Bitcoin-only
policies as **Policy verified**. These are three separately reported outcomes:
the Mk4 status is a manual on-device import acknowledgement, not a
cryptographic USB address proof. The owner then generated a permanently labeled
first receive address and reported a complete match on the Nano S Plus trusted
display; Groot showed **Verified on hardware** and retained the verification
time. The submitted screen recording shows the shared loading indicator
rotating during a long Nova operation, although its previous near-uniform ring
looked stalled to the owner. The package's visual policy status and Ledger
receive evidence are not a funded-spend, restart, recovery, or independent
certification pass. No firmware version was reported for this exact session.

Next on this wallet: compare that same saved receive address in full on the
exact Nova and Mk4 displays, recording separately what each device can prove;
repeat the Policy and Receive states after quit/relaunch and correct-PIN unlock;
confirm Core sync and permanent label retention. Do not fund until the
descriptor backup and every intended device display agree. After that, run a
minimal-value receive, confirmation, 2-of-3 PSBT review/signature combinations,
rejection and wrong-device/changed-PSBT checks, broadcast, restart/accounting,
and independent clean-profile public-backup recovery. The exact replacement
build must first pass its own spinner and policy-copy UI checks; none of the
physical `4630bf95` outcomes automatically transfer to it. Mainnet GA remains
blocked by the release checklist.

## 2026-09-13 exact `e9b9c3c` owner-operated receive checkpoint

The release owner tested the internal Mainnet app displaying `v0.4.94 ·
e9b9c3c2`. The same saved, permanently labeled multisig receive address was
independently compared on the Nano S Plus, Mk4, and Nova trusted displays and
reported matching on all three. The owner also confirmed the saved policy and
Core-backed wallet state after restart and unlock. A small deposit sent from
another Groot single-key wallet appeared in the 2-of-3 coordinator as
unconfirmed. This proves Mainnet receive observation for this exact build; it
does **not** prove confirmation, multisig spending, fee correctness, recovery,
or broader model certification. Exact addresses, keys, fingerprints, and
transaction identifiers remain out of this checkpoint.

During the source-wallet send, the owner observed a macOS beachball while
entering the amount, selecting a fee, and preparing the PSBT. The detailed
transaction review also compressed three derivation paths and misaligned the
input count with its satoshi total. These are implementation follow-ups, not
physical passes. The replacement build must be checked for responsiveness
under repeated amount/fee changes and for readable review rows on both
confirmation and signing screens. Continue with on-chain confirmation, then
the planned 2-of-3 spend, failure/rejection, restart/accounting, and
clean-profile recovery checks. Mainnet GA remains blocked.

## 2026-09-13 exact `15a87375` owner-operated spend checkpoint

The release owner reports that the earlier multisig deposit confirmed. With the
internal Mainnet app displaying `v0.4.94 · 15a87375`, the owner then prepared
and broadcast one standard 2-of-3 multisig payment signed by the Ledger Nano S
Plus and BitBox02 Nova Bitcoin-only. Groot displayed broadcast success; the
owner-controlled Ledger single-key receiving wallet observed the payment as
unconfirmed, with accounting matching expectations. After quitting and
relaunching, the owner reported the wallet state and accounting persisted. This
is an exact-build, owner-operated funded-send result, not a confirmed outgoing
transaction, an adversarial-PSBT pass, clean-profile recovery, firmware-specific
certification, independent review, or a pass for the later replacement build.
No amount, address, fingerprint, descriptor, PSBT, or transaction ID is retained.

The owner also reported that the shared button spinner's decorative dot is
unwanted; a BSMS export could not switch to Groot JSON without leaving the
flow; the receive-descriptor QR did not expand; Policy briefly showed a false
single-key state; and the standard multisig Recovery policy lab link was
confusing. The last link is already guarded by `hasMiniscriptPolicy` in the
current source and must remain absent for standard sortedmulti; source/browser
checks of the UI changes do not transfer any physical result. Continue with
bounded altered/foreign/stale PSBT rejection, rapid amount/fee changes,
confirmation and restart reconciliation, and independent clean-profile public
descriptor recovery before advancing any Mainnet release checklist row.

## 2026-09-14 remote-Core rescan follow-up (owner report)

The owner reports that steps 1–4 of the replacement-build checklist passed,
including the cleaned-up cancel dialog. A trusted remote Mainnet Core
connection then reported full block history at height 966,930. The wallet
rescan configured at birthday 966,900/gap 20 appeared to freeze and Overview
remained at 100% loading. The remote connection check alone does not certify
wallet-history reconciliation or a usable remote wallet. Step 6 and the
separately clean Groot-profile descriptor recovery were not performed.

The next candidate changes native rescan scheduling, between-RPC cancellation,
progress phase, and Activity's manual sync only. Do not transfer the earlier
device, signing, or interoperability pass to the replacement binary. Retest
responsive cancellation and completed remote scan, then compare history,
balance, and labels through relaunch before considering another spend. Do not
put the endpoint, credentials, descriptors, or PSBTs in this record.

## 2026-09-14 owner-operated Sparrow interoperability checkpoint

The release owner reports that the same Mainnet 2-of-3 coordinator was recovered
from its public descriptors in Sparrow, then a payment was signed with the exact
BitBox02 Nova and Coldcard Mk4 and broadcast through Sparrow. Groot subsequently
observed the outgoing payment and an empty spendable balance. This is a positive
owner-operated descriptor-recovery and cross-application signing/broadcast
checkpoint, not a separately isolated empty Groot profile restore, negative
PSBT campaign, fresh-build hardware certification, confirmation/reorg proof,
or Mainnet distribution approval. Do not store the descriptor, PSBT, signer
fingerprints, pairing code, transaction ID, or node credentials in this record.

The owner observed that Groot retained a different unsigned, zero-signature
proposal referencing the now-spent coins. Do **not** sign that proposal: sync,
inspect the unavailable-input warning, then cancel it explicitly. A later
candidate must prove that neither hardware signing, signed-PSBT import, nor
broadcast accepts missing standard-proposal inputs, while normal RBF/CPFP
replacement paths still use their own original-transaction checks. An
outgoing transaction created in Sparrow without a Groot proposal naturally
has Groot's generic outgoing display label; no guessed permanent label should
be attached to it.

The owner's next ordered test on the replacement internal build is: (1) sync
the recovered wallet and confirm the exact external payment, balance,
notifications, and prior labels persist across quit/relaunch; (2) open the
saved proposal, confirm the unavailable-input message, ensure there is no
sign/import/broadcast action, and cancel it, retaining transaction history;
(3) exercise rapid custom-fee changes with MAX and Review payment on a
**funded, unspent** test wallet, observing responsiveness and an exact
reviewed amount/fee; (4) check the cancel dialog has spacing before its first
row and no outer table borders; (5) on a separately safe amount, test a
foreign/altered PSBT rejection and unchanged signature count, then a normal
two-signer retry; (6) separately test the remote Core connection's exact
Mainnet chain and full-history state before any spend. Keep the fresh Groot
profile recovery and hardware negative/interruption rows open.

This source change refreshed the exact Mainnet source-policy pins only for
`wallet.rs`, `hardware_commands.rs` (the shared proposal DTO),
`multisig_proposal_commands.rs`, and the Overview route after review. It did not alter the compiled
network allowlist, HWI pairing/identity logic, PSBT encoding, profile schema,
or release gate. Passing the source tripwire is not physical certification.

## 2026-09-16 cumulative certification status and GA resume point

The evidence above must be read cumulatively rather than treating the first
failed checkpoint as the current state. The release owner has completed these
positive Mainnet operations on named internal packages:

| Model or boundary              | Owner-observed Mainnet evidence                                                                                                                                                                                                      | Still required for GA                                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coldcard Mk4                   | Wrong-Testnet4 rejection before Mainnet import; BIP48 public-key import; policy-file acknowledgement; exact receive-address comparison; Sparrow descriptor-wallet spend with Nova                                                    | Record exact firmware on the frozen package; Groot-native rejection, disconnect/reconnect, wrong-device, altered/foreign/stale-PSBT, confirmation/restart, and clean Groot-profile recovery rows      |
| Ledger Nano S Plus             | BIP48 public-key import; policy verification; exact receive-address comparison; Groot 2-of-3 signing/broadcast with Nova; restart-visible accounting                                                                                 | Record firmware and Bitcoin app on the frozen package; explicit rejection, disconnect/reconnect, wrong-device, altered/foreign/stale-PSBT, final confirmation, and clean Groot-profile recovery rows  |
| BitBox02 Nova Bitcoin-only     | BIP48 public-key import; policy verification; exact receive-address comparison; Groot 2-of-3 signing/broadcast with Nano S Plus; Sparrow signing/broadcast with Mk4                                                                  | Record exact firmware on the frozen package; rejection, disconnect/reconnect, wrong-device, altered/foreign/stale-PSBT, final confirmation, clean Groot-profile recovery, and independent review rows |
| Trezor Safe 3 Bitcoin-only     | Earlier Testnet4 funded 2-of-3 and clean-profile recovery evidence exists; source now admits HWI's exact `trezor_t2b1`/`trezor_t3b1` identifiers                                                                                     | Complete the full Mainnet exact-package campaign; the identifier correction is not a physical pass                                                                                                    |
| Trezor Model One               | Release target is 1.14.1                                                                                                                                                                                                             | Complete the full Mainnet exact-package campaign                                                                                                                                                      |
| Original Bitcoin-only BitBox02 | Release target is 9.26.3                                                                                                                                                                                                             | Complete the full Mainnet exact-package campaign; Nova evidence does not transfer                                                                                                                     |
| Blockstream Jade Classic       | Earlier Mainnet attempt reached discovery but failed before the expected PIN/login flow                                                                                                                                              | Complete the full Mainnet exact-package campaign and retain only Groot's stable error code if it fails                                                                                                |
| BIP48 coordinator              | Same permanent receive address matched on Mk4, Nano S Plus, and Nova; funded deposit confirmed; Groot payment signed by Nano S Plus + Nova and broadcast; state/accounting persisted after relaunch                                  | Frozen signed-candidate repetition of critical rows, negative PSBT campaign, final confirmation/reconciliation, and clean Groot-profile recovery                                                      |
| External interoperability      | Public multisig descriptor recovered in Sparrow; Nova + Mk4 signed and broadcast from Sparrow; Groot observed the spend. Exact packaged `a735fb19` software wallet also recovered in Sparrow 2.5.4 with matching history and balance | A second external coordinator/signer round trip and execution/sign-off by a reviewer independent of the release owner                                                                                 |

Firmware versions were not re-reported during the owner sessions above. The
release targets remain Mk4 5.6.1, Model One 1.14.1, Nano S Plus 1.6.1 with
Bitcoin app 2.5.0, original Bitcoin-only BitBox02 9.26.3, Jade Classic 1.0.40,
Safe 3 Bitcoin-only 2.12.3, Nova 9.26.3, and bundled HWI 3.2.0. A target version
is not a physical result until it is captured with the frozen package.

### Next physical session

Use the frozen ADR 0069 multi-network GA package with Mainnet selected. Record
the active network before every hardware operation and repeat it after restart;
the earlier fixed Mainnet packages remain supporting evidence only. Do not
recreate the already funded coordinator unless recovery itself is the row under
test.

1. Record package commit/hash, macOS version, signature/notarization result,
   bundled HWI digest/version, exact model, exact firmware, transport, and
   reviewer.
2. Reopen the existing Mk4 + Nano S Plus + Nova wallet. Confirm the permanent
   address/policy evidence, Core-backed balance/history/labels, and completed
   outgoing transactions survive unlock and restart.
3. On a disposable unspent output, exercise user rejection, cable interruption
   and retry, wrong device, wrong network where the device supports it, foreign
   PSBT, one-byte altered signature, stale/missing input, unchanged signature
   count after every rejection, then a normal two-signer retry, broadcast,
   confirmation, restart, and accounting.
4. Recover the public coordinator backup into a genuinely clean Groot profile,
   compare the first and a later receive address on hardware, rescan from a safe
   birthday/gap, and reconcile balance, history, labels, and replacement lineage.
   Restore and recheck the untouched source profile afterward.
5. Complete equivalent exact-package records for Safe 3, Model One, original
   BitBox02, and Jade Classic, or change the proposed first-release device scope
   through an explicit reviewed ADR before GA. No model inherits another model's
   pass.

This updates the test resume point; it does not mark the seven-model matrix or
Mainnet distribution gate complete.

## 2026-09-18 exact `a393a0e7` owner-operated 2-of-3 checkpoint

The release owner reports that internal Mainnet build `v0.4.95 · a393a0e7`
completed a standard 2-of-3 payment with Ledger Nano S Plus and BitBox02 Nova
Bitcoin-only. Groot collected both signatures and displayed successful Bitcoin
network broadcast. This closes the happy-path signing and broadcast row for
that exact package and signer pair only. It does not transfer to the pending
replacement build and does not close confirmation, restart reconciliation,
rejection, disconnect/reconnect, wrong-device, altered/foreign/stale-PSBT,
clean-profile recovery, exact-firmware capture, or independent-review rows.
No amount, address, transaction identifier, fingerprint, descriptor, PSBT,
device path, credential, or node detail is retained.

## 2026-09-19 exact `cb4e172a` owner-operated acceleration and interoperability checkpoint

The release owner reports that the internal Mainnet build displayed as
`v0.4.95 · cb4e172a` completed additional positive testing with Coldcard Mk4,
Ledger Nano S Plus, and BitBox02 Nova Bitcoin-only. The existing 2-of-3 wallet
received bitcoin, matched receive addresses on hardware, sent to an external
address, and exercised multiple RBF and CPFP flows. The owner also created a
PSBT in Groot, signed it with Ledger in Groot, imported it into Sparrow, added a
Ledger signature there, and broadcast it from Sparrow successfully. This adds
owner-operated positive evidence for the three-device coordinator and a second
Groot-to-Sparrow PSBT path; it does not substitute for frozen-package firmware
capture, negative or interruption tests, clean Groot-profile recovery, or
independent review.

An accounting concern raised during the same session was reconciled without
retaining transaction identifiers: the Ledger and multisig databases contained
two distinct shared 7,000-satoshi payments on different dates, and the CPFP was
a separate fee-only multisig entry. A confirmed payment could briefly remain
pending only inside an already-open detail modal even after the refreshed wallet
state and first-confirmation notification arrived. That stale-modal defect is a
presentation correction in the subsequent source and is not hardware evidence.

### Updated signer resume matrix

| Model or boundary              | Positive owner evidence now recorded                                                                                                                                       | Essential rows still open                                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Coldcard Mk4                   | Mainnet BIP48 import, policy acknowledgement, hardware address comparison, multisig receive/external send, RBF/CPFP participation, and Sparrow signing/broadcast with Nova | Frozen-package firmware capture; Groot rejection, disconnect/retry, wrong-device, altered/foreign/stale-PSBT; clean Groot recovery; independent review |
| Ledger Nano S Plus             | Mainnet BIP48 import, policy/address verification, single-key and 2-of-3 payments, Groot broadcast with Nova, RBF/CPFP participation, and Groot-to-Sparrow PSBT signing    | Frozen-package firmware/app capture; rejection, disconnect/retry, wrong-device, altered/foreign/stale-PSBT; clean Groot recovery; independent review   |
| BitBox02 Nova Bitcoin-only     | Mainnet BIP48 import, policy/address verification, Groot 2-of-3 signing with Ledger, Sparrow signing with Mk4, external send, and RBF/CPFP participation                   | Frozen-package firmware capture; rejection, disconnect/retry, wrong-device, altered/foreign/stale-PSBT; clean Groot recovery; independent review       |
| Trezor Safe 3 Bitcoin-only     | Prior Testnet4 evidence only                                                                                                                                               | Full exact-package Mainnet campaign                                                                                                                    |
| Trezor Model One               | Target model only                                                                                                                                                          | Full exact-package Mainnet campaign                                                                                                                    |
| Original Bitcoin-only BitBox02 | Prior model-specific evidence only; Nova results do not transfer                                                                                                           | Full exact-package Mainnet campaign                                                                                                                    |
| Blockstream Jade Classic       | Prior discovery attempt only                                                                                                                                               | Full exact-package Mainnet campaign, including login retry                                                                                             |

No address, transaction identifier, amount beyond the reported accounting
comparison, fingerprint, descriptor, PSBT, credential, device path, or node
detail is retained.

## 2026-09-25 exact `b49d2a81` local-Core reconciliation failure

The release owner opened internal multi-network build `v0.4.95 · b49d2a81` with
Mainnet selected and connected an owner-controlled local Bitcoin Core node. Core
reported Mainnet at height 968,539, `initialblockdownload=false`, pruning only below
height 962,887, and no optional indexes. Two wallet transactions were independently
confirmed at heights 966,931 and 966,922 and Core still served both retained blocks,
yet Groot continued to present them as awaiting confirmation after repeated refreshes.

Sanitized database inspection established that both transaction anchors were already
persisted with the correct confirmation heights, while this wallet's sparse BDK chain
checkpoint omitted both anchor heights and jumped to the current tip. BDK therefore
treated the anchors as outside its active chain. The source correction verifies every
missing anchor against Core's active height/hash, verifies exact transaction inclusion
in the retained block, and restores the checkpoint atomically. Pruned-away history or
an anchor/block mismatch fails closed. No wallet identifier, address, descriptor,
fingerprint, credential, PSBT, or transaction identifier is retained here.

This is a release-blocking sync-correctness failure for `b49d2a81`; that build is not
eligible for further funded certification. The replacement build must refresh the
preserved affected profile, show both transactions confirmed with correct accounting,
and retain the repaired state after restart before physical testing resumes.

## 2026-09-26 A/B/C setup checkpoint

### Later Multi B payment and recovery follow-up

Owner-reported internal Mainnet v0.4.95 · f7855a45 (visible package identity):

- Receive-address comparison passed independently on Jade Classic, original
  BitBox02 Bitcoin-only, and Trezor Safe 3.
- First deposit was observed; confirmation remained pending at the report.
- CPFP signing succeeded with Jade and original BitBox02. No confirmation or
  post-restart accounting result is inferred.
- BSMS **Test recovery** reconstructed the same first address. This is an
  in-memory public-backup proof, not independent clean-profile recovery.
- Recovery scanning succeeded against the owner's local pruned Bitcoin Core.
- The owner reports unchanged device firmware from prior Regtest/Testnet4
  campaigns. This continuity statement does not replace exact-version capture
  for a frozen GA artifact or transfer certification between models.

Discovery presented unrelated or unidentified Model One/Ledger rows as available.
The replacement UI distinguishes non-matching fingerprints from unidentified
locked devices; account-key authority remains native. Physical regression on the
replacement package remains required, including the earlier BitBox reconnect stall.

Proceed to C's payment campaign; do not recreate C (setup already passed).
B's newly evidenced pair is Jade/BitBox02; BitBox02/Safe 3 and Safe 3/Jade remain
unreported here. A retains earlier exact-build evidence, not a blanket complete
claim. The checklist below still governs confirmation/restart, remaining pairs,
negative cases, BIP84, clean recovery, and independent GA review.

### Additional B/C follow-up on f7855a45

The owner's next screenshots still identify v0.4.95 · f7855a45, not e0162d6f.
Multi B RBF with original BitBox02 and Jade succeeded without reported friction.
Multi C's first deposit confirmed in Groot. Model One receive verification failed
immediately after PIN unlock, then passed after fresh discovery showed it ready.
Record the successful display and the failed chained interaction separately; this
does not close Model One unlock-handoff reliability or any C signing-pair row.
The RBF screen failed to announce an original confirming during review. The new
event-driven UI correction needs packaged physical retesting. No identifiers or
payment amounts are retained here, and no replacement confirmation is inferred.

### Original setup report

Owner-reported Mainnet results, not an independently witnessed hardware run.
Group C's screenshot identifies internal v0.4.95 · 81409c14. Exact package
identity was not re-reported for every A/B operation; firmware versions were not
captured here. Do not infer them from target versions or earlier results.

| Group | Reported models                                 | New evidence                                                                                                                                                                                   |
| ----- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | Coldcard Mk4, BitBox02 Nova, Ledger Nano S Plus | Existing 2-of-3 wallet; all three health checks passed. Earlier policy/payment results retain their original scope.                                                                            |
| B     | Jade Classic, original BitBox02, Trezor Safe 3  | Imports and all health checks passed; wallet created. Jade policy passed; original BitBox02 registration passed after unplug/replug following a stalled lookup.                                |
| C     | Trezor Model One, Jade, BitBox02 Nova           | Wallet created; applicable Jade/Nova policy verifications passed. Model One correctly reports **No setup needed**, not registration. No separate C health-check or payment result is inferred. |

BitBox02 reconnect success adds a positive registration observation but does not
close the discovery stall. Removing redundant renderer lookups is not proof that
HWI latency or the reconnect defect is resolved. Retest one/multiple devices,
locked/unlocked, on the replacement package; record timings without raw HWI data.

### Next physical steps

1. Capture exact package commit, firmware, and Ledger Bitcoin app version. Confirm
   preserved Core-backed wallet accounting survives restart.
2. Before funding each group, compare its labeled receive address on a capable
   signer. Policy verification is not proof for every later receive address.
3. Exercise all three signer pairs: A Mk4/Ledger, Ledger/Nova, Nova/Mk4;
   B Jade/original BitBox02, original BitBox02/Safe 3, Safe 3/Jade;
   C Model One/Jade, Jade/Nova, Nova/Model One. Check recipient, amount, fee,
   change and input labels; require both valid signatures before broadcast.
4. Include partial-signature restart/resume, normal change and sweep, confirmation
   and restart accounting. Cover rejection, wrong device, disconnect/retry, and
   foreign/altered/stale PSBTs; never broadcast negative fixtures.
5. Complete each model's BIP84 receive/sign/broadcast/restart rows separately.
   Multisig health/registration does not satisfy single-key transaction rows.
6. Verify public-backup reconstruction and independent recovery/reviewer rows on
   the frozen candidate. Preserve the owner's existing profiles.

No new transaction, clean recovery, exact-firmware certification, or GA pass is
claimed. No wallet IDs, fingerprints, addresses, descriptors, PSBTs, credentials,
device paths, or node details are retained.
