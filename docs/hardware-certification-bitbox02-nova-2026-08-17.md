# BitBox02 Nova physical certification checkpoint

This sanitized checkpoint tracks the dedicated BitBox02 Nova campaign. It
contains evidence metadata only. The sensitive worksheet remains under the
gitignored `hardware-certification.local/` directory.

Never add a seed, PIN, password, passphrase, backup content, address, xpub,
fingerprint, descriptor, PSBT, transaction identifier, RPC credential, or USB
device path to this file.

## Campaign identity

- Exact device/model: BitBox02 Nova
- Firmware: 9.26.3
- Host OS/version: macOS 26.1
- Groot candidate: 0008f74 plus the preserved intentional working-tree changes
- HWI version: 3.2.0 reviewed boundary
- Network: Regtest
- Transport: desktop USB
- Test date: 2026-08-17 local Regtest USB execution complete
- Local reviewer: local implementer (self-review)
- Independent reviewer: pending

Original BitBox02 evidence is not inherited. Whisper/BLE is excluded and
requires a separate authenticated mobile-transport review.

## Process and profile isolation

| Check                                                | Status | Sanitized evidence note                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intentional Safe 3 working-tree changes preserved    | Pass   | Existing uncommitted UI, i18n, test, and documentation work was identified before the Nova campaign and remains outside Nova evidence.                                                                                                                                                                    |
| Original funded certification profile preserved      | Pass   | A read-only end-of-campaign audit found exactly one unbroadcast proposal still present across the saved certification profile, consistent with the unrelated Safe 3 proposal remaining untouched and out of scope throughout Nova execution. No proposal content or identifier was inspected or retained. |
| Clean-recovery profile lock clear before Nova launch | Pass   | No open Groot process lock was observed before Nova preparation.                                                                                                                                                                                                                                          |
| Existing process and port ownership respected        | Pass   | A different temporary-profile Groot instance was identified and left untouched until the reviewer quit it. Its lock and port were then confirmed clear before the standard saved certification profile was launched; exactly one Groot profile lock now exists.                                           |
| Sensitive local evidence remains gitignored          | Pass   | Public documentation contains only sanitized status and limitations.                                                                                                                                                                                                                                      |

## BIP84 exact-model USB campaign

| Check                                                                                  | Status  | Sanitized evidence note                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact Nova model, firmware, host, candidate, HWI, network, date, and reviewer recorded | Pass    | The local implementer physically operated the exact BitBox02 Nova on the recorded firmware, host, HWI boundary, network, transport, and date. This is self-review only; independent review remains pending.                                                                                                                                                                                                                                                                  |
| Device is already initialized and has an offline backup                                | Pass    | The reviewer reported that the exact Nova is initialized and its offline backup is complete. Groot did not initialize the signer or handle backup content.                                                                                                                                                                                                                                                                                                                   |
| Companion-owned, disconnected, locked, and ready states are accurate and actionable    | Pass    | BitBoxApp ownership produced one stage-accurate `Could not scan hardware` result with one retry, and releasing BitBoxApp returned the exact Nova to ready. The reviewer later disconnected and reconnected Nova, unlocked it on-device, and completed a saved-identity check. Focused tests, full validation, and responsive checks passed.                                                                                                                                  |
| HWI enumeration preserves the exact Nova label                                         | Pass    | After BitBoxApp released USB, HWI displayed the exact `bitbox02_nova_btconly` model as ready. No identifier was copied into this record.                                                                                                                                                                                                                                                                                                                                     |
| Pairing behavior and pairing-cache lifecycle are accurate                              | Limited | With only Nova connected and unlocked, the first warm-cache scan did not detect it; the reviewer rescanned and the saved-identity health check passed without a pairing code. HWI 3.2.0 reuses BitBoxApp's shared cache, which contained three opaque device entries that cannot be safely mapped to wallet fingerprints, so the campaign did not delete a host entry or risk disturbing other BitBox pairings. Cold-cache repair remains the vendor flow through BitBoxApp. |
| BIP84 test-chain public account imported through HWI                                   | Pass    | The exact ready Nova reached public-data review with the expected BIP84 test-chain origin. No public identifier was copied into this record.                                                                                                                                                                                                                                                                                                                                 |
| Identity confirmation is stated only to the level Nova exposes                         | Pass    | Physical regression confirmed the corrected exact-label branch: Groot explained that Nova does not expose a fingerprint comparison during import and presented `Use this Nova wallet`. The BIP84 wallet was created and synced successfully.                                                                                                                                                                                                                                 |
| Permanent labeled receive address verified on trusted display                          | Pass    | The reviewer created a permanently labeled BIP84 receive entry, displayed it on the exact Nova, compared the complete value, and reported an exact match. Groot persisted the hardware-verification result. No address or other public identifier is retained here.                                                                                                                                                                                                          |
| Disposable Regtest funding, sync, history, and accounting                              | Pass    | Exactly 100,000 disposable Regtest sats were sent to the permanently labeled, hardware-verified Nova BIP84 receive entry and one confirmation was mined. An independent chain scan confirmed the amount, Groot persisted the address as observed and used, and the reviewer later observed Groot's post-payment balance accounting. No public identifier is retained here.                                                                                                   |
| First signing attempt rejected                                                         | Pass    | After discarding the accidental first signature, the reviewer retried the unchanged proposal and rejected it on the exact Nova. Groot reported that the action was cancelled on the hardware wallet, retained the reviewed transaction for retry, accepted no signature, and did not broadcast. No public identifier is retained here.                                                                                                                                       |
| Unchanged BIP84 proposal approved by exact Nova signer                                 | Pass    | Following the deliberate rejection, the reviewer retried the unchanged proposal and approved it on the exact Nova. Groot verified exactly one valid signature from the saved signer and presented the unchanged signed transaction for final review. The proposal remains unbroadcast. No public identifier is retained here.                                                                                                                                                |
| BIP84 completion, broadcast, mining, and accounting                                    | Pass    | The reviewer finalized and broadcast the exact signed Regtest proposal, mined one confirmation, synced Groot, and reported the wallet up to date. Groot showed the confirmed outgoing activity, zero pending balance, and the expected remaining balance after the payment and fee. The transaction identifier is intentionally omitted.                                                                                                                                     |

## BIP48 2-of-3 policy campaign

| Check                                                           | Status | Sanitized evidence note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh BIP48 public account imported through HWI                 | Pass   | The reviewer imported a fresh Nova BIP48 public account through HWI at the expected test-chain policy origin. No original BitBox02 evidence or public identifier was inherited.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Fresh 2-of-3 policy built from independently recorded signers   | Pass   | The reviewer independently imported three fresh BIP48 signers into a new 2-of-3 draft and confirmed the intended native-SegWit sorted-multisig policy with all three expected signer labels. The public descriptor backup was saved before wallet creation. No original BitBox02 evidence or public identifier was inherited.                                                                                                                                                                                                                                                                                 |
| Policy registration supported and completed                     | Pass   | The reviewer approved the new, uniquely named policy on the exact Nova. Groot accepted the result only after matching the saved Nova account identity and validating the returned first address against the draft descriptor.                                                                                                                                                                                                                                                                                                                                                                                 |
| First policy address verified on Nova                           | Pass   | The reviewer reported that Nova displayed the first policy address and that it matched Groot in full. The Regtest display alias was accepted only after Rust proved that it decoded to the identical output script. No address is retained here.                                                                                                                                                                                                                                                                                                                                                              |
| Saved-identity health passes after disconnect/reconnect         | Pass   | Nova first passed after a physical disconnect, reconnect, and unlock. After the mixed-family filtering correction, the reviewer kept Nova, Trezor Safe 3, and Blockstream Jade connected and independently reran each saved BIP48 signer health check; all three passed against their own saved identities. Unrelated devices were ignored, while exact type, fingerprint, derivation, and full-account-key matching remained enforced.                                                                                                                                                                       |
| Watch-only 2-of-3 coordinator created                           | Pass   | After the descriptor backup and required policy checks were complete, the reviewer set the local coordinator app PIN and created the intended watch-only 2-of-3 wallet with the three independently imported signer roles. No credential or public identifier is retained here.                                                                                                                                                                                                                                                                                                                               |
| Permanently labeled BIP48 receive address verified              | Pass   | The reviewer synced the newly created coordinator, created a new permanently labeled BIP48 receive request, compared its complete address with the exact Nova trusted display, and reported a match. Groot persisted address-specific hardware-verification evidence. No label, address, derivation detail, or signer identifier is retained here.                                                                                                                                                                                                                                                            |
| Disposable Regtest funding, sync, history, and accounting       | Pass   | Two independently labeled and hardware-verified Regtest receive requests each received 100,000 disposable sats. After synchronization, the reviewer confirmed both incoming activity entries and the expected 200,000-sat coordinator balance. The second receipt resulted from the earlier ambiguous RPC retry; no public identifier is retained here.                                                                                                                                                                                                                                                       |
| Signing rejection leaves exact proposal unchanged and retryable | Pass   | The reviewer compared the controlled proposal on the exact Nova and deliberately rejected it. Groot surfaced the hardware-wallet cancellation, retained the same recipient, amount, fee, input selection, and permanent label for retry, remained at zero collected signatures, and did not broadcast. No public identifier is retained here.                                                                                                                                                                                                                                                                 |
| Exact Nova signature advances only the expected signer          | Pass   | The reviewer rechecked and approved the unchanged controlled proposal on the exact Nova. Groot validated and persisted exactly one canonical signature, advanced only the Nova signer, displayed one of two signatures collected, retained the reviewed transaction unchanged, and did not finalize or broadcast. No public identifier is retained here.                                                                                                                                                                                                                                                      |
| Partial signature survives restart                              | Pass   | The reviewer fully quit and reopened Groot without adding another signature. The exact controlled proposal returned with the Nova signature still persisted as one of two collected signatures; it remained unfinalized and unbroadcast. No signer or transaction identifier is retained here.                                                                                                                                                                                                                                                                                                                |
| Wrong physical device is rejected                               | Pass   | With the exact Nova signature already persisted, the reviewer connected an initialized Ledger that was not part of this policy. Groot rejected the device identity, accepted no signature, retained one of two collected signatures, and left the canonical proposal unchanged and unbroadcast. The exact Ledger model and public identifiers are not retained here.                                                                                                                                                                                                                                          |
| Duplicate signed PSBT is idempotent or rejected safely          | Pass   | The reviewer exported the partially signed canonical proposal and immediately reimported that exact payload. Groot explicitly rejected the already-counted signer with no signature changes, retained one of two collected signatures, and left the proposal unchanged and unbroadcast. No PSBT or public identifier is retained here.                                                                                                                                                                                                                                                                        |
| Foreign proposal is rejected                                    | Pass   | A genuine signed but unbroadcast PSBT from an unrelated disposable Regtest transaction was imported into the active proposal. Groot rejected it because it did not match the reviewed transaction, accepted no signatures, retained the Nova signature at one of two, and left the canonical proposal unchanged and unbroadcast. No PSBT or public identifier is retained here.                                                                                                                                                                                                                               |
| Bounded hostile PSBT mutation is rejected                       | Pass   | A local ignored fixture changed one unsigned transaction output by exactly one satoshi while leaving the persisted source untouched. Groot rejected the changed transaction, accepted no signature, retained the Nova signature at one of two, and left the canonical proposal unchanged and unbroadcast. The temporary fixture was removed after the test; no PSBT or public identifier is retained here.                                                                                                                                                                                                    |
| USB interruption leaves a safe unchanged retry                  | Pass   | The reviewer disconnected the valid Trezor Safe 3 while its physical transaction review was visible and before approving or rejecting. Groot returned a hardware failure, accepted no signature, retained the Nova signature at one of two, and did not broadcast. After reconnecting and unlocking the same Safe 3, the reviewer approved the exact unchanged proposal; Groot reached the expected Nova plus Safe 3 threshold at two of two without finalizing or broadcasting.                                                                                                                              |
| Threshold completion, broadcast, mining, and accounting         | Pass   | After Nova and Trezor Safe 3 supplied the intended two distinct signatures, the reviewer finalized and broadcast the exact reviewed Regtest proposal. One block was mined, the reviewer synced Groot, and confirmed the labeled outgoing payment, zero pending balance, and the expected 145,980-sat remaining balance after the 50,000-sat payment and reviewed 4,020-sat fee. No transaction identifier is retained here.                                                                                                                                                                                   |
| Clean-profile public-backup recovery                            | Pass   | After the earlier destructive recovery attempt, the reviewer repeated the test correctly: the current funded source coordinator was preserved and quit, a distinct empty Regtest application profile recovered from a fresh Groot JSON backup, and the reviewer reported the same 2-of-3 policy, signer identities, first receive address, 145,980-sat balance, zero pending balance, two incoming and one outgoing Activity entries, and permanent labels. The clean profile was quit and the preserved source reopened with the same state intact. No backup content or public identifier is retained here. |

### Mixed-family saved-signer regression found during policy setup

With Nova, Trezor Safe 3, and Blockstream Jade connected, all three saved BIP48
health checks passed after the targeted-scan filtering correction. The subsequent
Jade policy lookup then remained busy indefinitely; the modal did not close until
Groot was quit, and a fresh launch reported that the connected, unlocked saved
signer was not found. No wallet was created and no funded proposal was mutated.

Diagnosis showed that HWI 3.2.0 can initialize an unrelated hardware backend even
when enumeration is supplied a device-type filter. The first corrective attempt
used HWI's type-only account-key form, but physical retry proved that upstream
still performs global enumeration before applying that type filter: with the
other signers attached, an unrelated Trezor backend failed during USB cleanup and
Jade was reported as unavailable. The modal remained cancellable and the draft
was unchanged.

After every other signer was disconnected, the reviewer retried with only the
logged-in, unlocked Jade attached. Jade registered the wallet policy, displayed
the first policy address, and the reviewer reported a complete match with Groot;
Groot persisted the policy-verification result. This is a pass for Jade policy
registration and first-address proof, but a limitation for mixed-device lookup.
It does not prove that type-only HWI lookup avoids unrelated backends. No wallet
had been created when this result was recorded.

## Separate release rows

| Release criterion                                       | Status       | Sanitized evidence note                                                          |
| ------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------- |
| Real 2-of-3 Testnet4 participation and package behavior | Pending      | Local Regtest USB evidence cannot satisfy this row.                              |
| Packaged-candidate evidence                             | Pending      | Development execution cannot satisfy this row.                                   |
| Independent review                                      | Pending      | The local implementer cannot self-approve it.                                    |
| Whisper/BLE mobile transport                            | Out of scope | Requires a separate authenticated-transport threat review and physical campaign. |

### Packaged v0.4.80 Testnet4 identity-routing checkpoint

The reviewer reopened the exact packaged v0.4.80 Testnet4 candidate at short
commit `d5133f59` and attempted to add the same physical Nova BIP84 identity
again. Groot rejected the genuine duplicate without creating another profile.
The offered **Open wallet** action selected the already-imported Nova profile,
not the previously selected Coldcard profile, and the visible wallet count
remained unchanged. This passes only the packaged exact-descriptor duplicate
detection and authoritative existing-profile routing regression. It does not
close the remaining packaged receive, health, policy, signing, recovery, or
independent-review rows. No public wallet or signer identifier, credential, or
transaction material is retained here.

### Packaged v0.4.83 Testnet4 accounting and BIP48 stop checkpoint

The reviewer opened the exact packaged v0.4.83 Testnet4 candidate at short
commit `12cf1714` against the preserved Nova wallet and its existing fee-only
child. Synchronization completed, the child was confirmed and classified as a
self-spend, and Overview, Activity, transaction detail, and wallet accounting
each counted the network fee once. A complete Groot quit and relaunch retained
the same confirmed presentation. This closes the focused v0.4.83 pending
self-spend accounting regression without creating or broadcasting another
transaction. It does not repeat the earlier physical signature and does not
upgrade that earlier package's evidence to this candidate.

The reviewer then reported that the Testnet4 BIP48 Nova public-account step
worked and reached signer enrollment. The multisig setup header contradicted the
running Testnet4 shell by displaying **Regtest · Native SegWit**. Source
inspection confirmed a hardcoded presentation string: the packaged frontend
configuration, Rust compiled network, HWI chain, and bundle identifier remained
Testnet4. This is a display-only defect rather than a Regtest policy draft, but
it fails the reviewable-network presentation row.

The reviewer later continued on the exact same candidate and reported that Nova
registered the BIP48 policy and verified the first address. The first coordinator
creation attempt failed when the preselected network-setup source was no longer
unlocked. With reuse explicitly unchecked, the same policy was created as an
offline Testnet4 multisig wallet. This closes the Nova BIP48 public-account,
policy-registration, first-address, and policy-construction rows for this
candidate while failing the stale-source offline-fallback row. The wallet has
not synced and no funding, proposal, signature, negative/retry behavior,
threshold result, or broadcast is claimed.

The local record relies on the reviewer's sanitized written observations.
Screenshots containing public signer identifiers were excluded. No address,
transaction identifier, fingerprint, account key, descriptor, device path,
PSBT, credential, RPC detail, or label is retained here.

### Packaged v0.4.84 Testnet4 BIP84 negative and persistence checkpoint

On the locally ad-hoc-signed Testnet4 package at commit `8ff4e7da`, the reviewer
created one controlled BIP84 self-transfer proposal and completed the
authoritative transaction review. The exact Nova then passed an explicit
on-device rejection with zero signatures and an unchanged retryable proposal,
USB interruption with a clean unchanged retry, and wrong-device refusal without
collecting a signature. The correct Nova subsequently added exactly one verified
signature. A complete Groot quit and relaunch retained the same proposal ready
to broadcast with that one signature. The proposal was deliberately left
unbroadcast to avoid an unnecessary Testnet4 transaction.

This closes the packaged Nova BIP84 rejection/retry, USB interruption,
wrong-device, successful-signature, and restart-persistence rows for this
candidate. It does not close funded BIP48 participation, threshold broadcast and
accounting, or packaged clean-profile recovery. A separate attempt to reuse a
working saved Testnet4 network setup in the existing offline multisig
coordinator stopped during synchronization while preserving its last verified
checkpoint. That shared setup/sync regression remains unresolved and blocks the
funded BIP48 campaign; it is not a Nova hardware failure.

The reviewer repeated the operation after reusing a second known-working
Testnet4 setup. Each connection test passed against a full-history node, while
each explicit wallet sync failed at the same retained height. Sanitized
read-only diagnosis found that the coordinator's birthday-only checkpoints no
longer belonged to the active Testnet4 chain after a reorganization. v0.4.84 did
not remove those stale checkpoints before replaying from the saved birthday, so
BDK rejected the disconnected update. No wallet, proposal, signer, node, or
profile data was changed during diagnosis. This remains a failed v0.4.84 row
until a fixed packaged candidate both rewinds to active-chain agreement and
completes sync.

Submitted screenshots exposed public signer or transaction metadata and were
excluded from retained evidence. No address, transaction identifier,
fingerprint, account key, descriptor, PSBT, device path, credential, RPC detail,
or label is retained.

## Current decision

**LOCAL REGTEST USB CORE PASS WITH LIMITATIONS — NOT RELEASE CERTIFIED.**

The exact Nova passed the funded BIP84 and BIP48 USB core journeys, including
policy/address proof, rejection and retry, canonical signing, restart,
wrong-device, duplicate/foreign/mutated-PSBT rejection, cable interruption,
threshold broadcast, confirmation, accounting, and functional public-backup
recovery. An earlier destructive recovery attempt remains documented, but the
reviewer subsequently repeated the clean-profile test while preserving the
source and reproduced the same identity, balance, history, and labels; the
source then reopened intact. Cold pairing-cache reset was not isolated from the
shared three-device BitBoxApp cache. Packaged v0.4.83 closes the focused
confirmed self-spend accounting regression and the Testnet4 Nova BIP48
import/policy/first-address setup rows, but fails the multisig network-label and
stale-source reuse-fallback rows. Packaged v0.4.84 closes the Nova BIP84
rejection/retry, USB interruption, wrong-device, successful-signature, and
restart-persistence rows, but its copied-network sync regression blocks the
shared funded BIP48 campaign. Remaining funded Testnet4 BIP48 threshold,
broadcast/accounting, packaged clean-profile recovery, and Whisper/BLE remain
open. Independent review is deferred until the Testnet4 device campaigns are
finalized.
