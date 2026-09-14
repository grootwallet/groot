# Mainnet hardware checkpoint — 2026-09-12

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
