# Physical hardware certification

Virtual devices prove coordinator behavior, not vendor compatibility. Run this only with disposable Regtest, Signet, or Testnet4 wallets until the mainnet checklist is approved.

Release-target declarations, not certification evidence: Trezor Model One
firmware 1.14.1; Ledger Nano S Plus firmware 1.6.1 with Bitcoin app 2.5.0.
Existing results below are not retroactively bound to these versions unless the
applicable sanitized certification record documents them.

## Hardware certification matrix

| Exact model                                 | Primary transport                                                                   | Credential rule                                                                                  | Local Regtest                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Open work                                                                                                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coldcard Mk4, firmware 5.6.1                | HWI USB; BIP-380 policy and PSBT over Virtual Disk/microSD                          | PIN/passphrase remains entirely on Coldcard                                                      | **PASS — local core campaign; packaged Testnet4 BIP84 campaign substantially complete.** Local cable/microSD signing, policy review, rejection, restart, interruption, wrong-proposal handling, threshold/broadcast, and shared clean-profile recovery passed. Packaged v0.4.61 passed identity, health, and exact receive-address verification. Packaged v0.4.67 passed cable signature discard, Virtual Disk and microSD import, restart persistence, broadcast, and accounting. Packaged v0.4.68 passed focused USB interruption/rescan, restored activity ordering, and a signed/broadcast CPFP child. Packaged v0.4.69 passed a reviewed, signed, broadcast RBF replacement and retained the old **Replaced** row plus the active replacement; a foreign signed PSBT was rejected without mutation. Packaged v0.4.77 rejected a bounded one-byte partial-signature mutation without changing the proposal or signature count, retained that state across restart, and then accepted the untouched signature exactly once.                                                                                                                                                                                           | Independent clean-profile recovery; independent review.                                                                                                                 |
| Blockstream Jade Classic, firmware 1.0.40   | HWI USB while logged in                                                             | Select wallet/passphrase on Jade; never send it through the webview                              | **PASS — local USB campaign.** BIP84 and BIP48 policy/address, health, rejection, restart, interruption, wrong-device, hostile-PSBT, threshold/broadcast/accounting, and local backup self-test passed. A focused packaged v0.4.28 Testnet4 follow-up also passed locked-device login, trusted address display, Groot-close/on-device rejection, and successful unchanged retry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Independent clean-profile balance/history recovery, complete public-network/package campaign, independent review. QR/BLE are separate transports.                       |
| Blockstream Jade Plus                       | Candidate HWI USB; QR/BLE separate                                                  | Select wallet/passphrase on Jade Plus                                                            | **NOT CERTIFIED.** Family-path implementation is not physical evidence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Exact-model enumeration, USB/QR/BLE capability discovery, full physical campaign. No Jade Classic evidence is inherited.                                                |
| BitBox02 Bitcoin-only, firmware 9.26.3      | HWI USB; BitBoxApp only for required first pairing; public export through BitBoxApp | Device password/pairing remains vendor-controlled                                                | **PASS — local campaign.** BIP84 and BIP48 policy/address, rejection, interruption, restart, threshold/broadcast, wrong-device, foreign-PSBT, and independent descriptor recovery passed. Packaged Testnet4 BIP84 import, trusted receive-address display and approval, saved-identity reconnect health, and focused close/on-device rejection/unchanged-retry passed after repairing the BitBoxApp pairing state. Packaged v0.4.31 additionally passed BIP48 import, live health, policy registration, and exact first-address proof. Packaged v0.4.57 passed the funded BIP48 partial-PSBT merge/removal, restart, signed export, threshold, and broadcast campaign with Ledger Nano S Plus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Complete the remaining packaged BIP84 single-key signing rows; independent review.                                                                                      |
| BitBox02 Nova                               | HWI 3.2.0 desktop USB; Whisper/BLE remains separate                                 | Device password and initial pairing remain vendor-controlled; HWI reuses BitBoxApp pairing state | **LOCAL REGTEST USB CORE PASS WITH LIMITATIONS / PACKAGED TESTNET4 FUNCTIONAL PASS WITH OPEN REVIEW.** Exact-model BIP84 and BIP48 policy/address proof, funded rejection/retry, canonical signing, restart, wrong-device and hostile-PSBT rejection, interruption/retry, threshold broadcast/accounting, and clean-profile public-backup recovery passed. Packaged v0.4.84 passed the focused BIP84 negative/persistence campaign. Packaged v0.4.85 repaired the stale-checkpoint boundary and passed shared BIP48 receive proof, deposit, signing, finalization, and broadcast. Exact packaged v0.4.88 commit `4fcd5f27` additionally passed Nova RBF and the shared Safe 3 plus Nova BIP48 trusted-display, real deposit, 2-of-3 spend, confirmation, restart/accounting, and genuine clean-profile descriptor/public-backup recovery campaign. The RBF result is functional evidence for that exact candidate only; it does not certify the later send-review UX or v0.4.89. Exact packaged v0.4.89 commit `c9309d3` passed full-history rescans for every exercised wallet with Core fully synchronized; this is wallet-sync evidence, not additional device interaction. No original BitBox02 result is inherited. | Independent tester/reviewer run remains open. Whisper/BLE and the separately deferred clean-profile recovery procedure remain open.                                     |
| Trezor Safe 3 Bitcoin-only, firmware 2.12.3 | HWI 3.2.0 USB                                                                       | PIN/passphrase entry stays on the Trezor Safe 3 touchscreen                                      | **PASS — local Regtest USB/recovery and packaged Testnet4 functional campaigns; release review open.** Regtest initialization/backup, identity, trusted display, funded signing, threshold completion, broadcast, confirmation, accounting, restart, negative/wrong-device/interruption handling, and clean-profile recovery passed. Packaged v0.4.84 passed first BIP84 sync, trusted display, persistence, and public exports but failed its explicit full rescan. Exact packaged v0.4.88 commit `4fcd5f27` passed funded BIP84 review/sign/broadcast and wrong-device rejection. The same exact candidate passed truthful BIP48 **No setup needed** status, independent Safe 3 and Nova display of the same receive address, a real Testnet4 deposit and 2-of-3 spend, threshold finalization, broadcast, confirmation, restart/accounting, and genuine clean-profile descriptor/public-backup recovery. Exact packaged v0.4.89 commit `c9309d3` then passed full-history rescans for every exercised wallet with Bitcoin Core fully synchronized, closing the candidate-bound rescan regression. See the [sanitized Safe 3 checkpoint](hardware-certification-trezor-safe-3-2026-08-16.md).                          | The separately deferred clean-profile recovery procedure and independent tester/reviewer run remain open.                                                               |
| Other Trezor Safe models / Model T          | HWI USB                                                                             | Prefer passphrase entry on the trusted device                                                    | **NOT CERTIFIED.** Generic implementation is not exact-model evidence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Independent record for every exact model/firmware.                                                                                                                      |
| Trezor Model One                            | HWI USB plus PIN matrix                                                             | Standard wallet requires explicit confirmation; hidden-wallet host passphrase entry is blocked   | **PASS — core and packaged BIP48 campaign.** Unlock, policy/review, rejection, signing, restart, threshold/broadcast, and shared recovery passed. Packaged v0.4.31 Testnet4 BIP48 import and live saved-identity health passed. Packaged v0.4.57 then passed complete transaction review, signature discard/re-sign, restart persistence, signed export, threshold, and broadcast. The v0.4.58 focused package passed authoritative self-transfer disclosure, a greater-than-six-minute device review, successful signing, immediate post-review automatic lock, and persisted one-signature recovery after unlock.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Remaining limitations include same-family mismatch, BIP84 single-key package evidence, file/QR signing, hidden wallets, per-model acceleration, and independent review. |
| Ledger Nano S Plus                          | HWI USB; Bitcoin Test on test chains                                                | Configure/select any passphrase-attached PIN only on Ledger                                      | **PASS — core campaign.** Single-key cable, BIP48 policy/review/sign/broadcast, and shared clean-profile recovery passed. A focused packaged v0.4.28 Testnet4 follow-up also passed trusted address display, repeatable blocked-dismissal feedback, on-device rejection, safe modal exit without verification, and successful unchanged retry. Packaged v0.4.31 then passed BIP48 import, live health, policy registration, exact first-address proof, locked-device fail-closed review, and successful unlocked retry. Packaged v0.4.57 passed the funded BIP48 locked-device retry, retained policy reference, close-request guidance, independent signature, partial-PSBT merge/removal, signed export, threshold, and broadcast campaign.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Complete the remaining packaged BIP84 single-key signing rows and independent review.                                                                                   |
| Passport Core                               | QR or microSD only                                                                  | Passphrase remains on Passport                                                                   | **NOT CERTIFIED.** Offline path exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Physical QR/microSD interoperability and complete exact-model campaign.                                                                                                 |
| Passport Prime                              | No cable claim without a documented compatible protocol                             | Passphrase remains on Prime                                                                      | **NOT CERTIFIED.** Offline parser exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Protocol discovery and complete exact-model campaign.                                                                                                                   |

“Implemented” means the Groot/HWI or bounded-file path exists; it is not a physical certification claim. Record firmware, HWI version, OS, import fingerprint, first-address match, PSBT sign, broadcast, cancellation, and wrong-device rejection for every certified row.

The current campaign, reconciled 2026-08-28, supersedes the hardware-status statements in the dated 2026-08-08 execution snapshot. Sensitive row-level results remain in the gitignored `hardware-certification.local/` records. Completed physical checks must not be repeated unless a later code change directly affects that behavior and creates a named regression requirement.

### Campaign reconciliation — 2026-08-28

- **Documented complete evidence:** Coldcard Mk4 local core campaign; original Jade Classic local BIP84/BIP48 USB campaign and focused packaged trusted-display regression; original BitBox02 local core plus packaged BIP48 campaign; BitBox02 Nova local desktop-USB core campaign; Trezor Safe 3 local USB and clean-profile recovery campaign; Trezor Model One packaged BIP48 campaign; and Ledger Nano S Plus local core plus packaged BIP48 campaign.
- **Latest shared Testnet4 campaign:** the original BitBox02 and Ledger Nano S Plus passed rejection/retry, partial-signature restart, signed-PSBT merge and local removal, locked-device retry, signature-count export naming, threshold, and broadcast across sealed v0.4.53, v0.4.54, and v0.4.57. Trezor Model One passed the corresponding packaged signing lifecycle in v0.4.57 and the self-transfer, extended-review, immediate post-review automatic-lock, and persisted-signature regressions in v0.4.58 candidate `101177a`. The detailed sanitized sequence is retained below.
- **Still open and not inherited from another model:** Coldcard Mk4 independent clean-profile recovery and independent review; the remaining Jade Classic public-package campaign; BIP84 single-key packaged signing for original BitBox02, Ledger Nano S Plus, and Trezor Model One; the explicitly deferred clean-profile-recovery procedure and independent tester/reviewer runs; all Jade Plus evidence; file/QR/BLE transports where separately listed; other per-model acceleration where required; and independent review.
- **Exact notarized candidate checkpoint:** Developer ID signed and Apple-notarized Testnet4 v0.4.91 commit `0849375d` used its bundled HWI 3.2.0 with a previously certified signer for one disposable payment. The reviewer confirmed the pre-sign review, valid hardware signature, Bitcoin Core acceptance, confirmation, complete Groot restart, sync, and persisted outgoing activity, fee, remaining balance, label, and accounting. This candidate-wide packaging checkpoint does not identify or add coverage to any model row, transfer earlier lifecycle evidence, provide independent review, or authorize mainnet. No wallet, signer, transaction, address, or node identifier is retained.

## Interactive trusted-display cancellation — HWI 3.2.0 source audit

The exact packaged HWI 3.2.0 adapters have no common remote-cancel command for an
in-flight address display. Jade, Ledger, Trezor, and BitBox02 block for a vendor
decision and map rejection to a host error. Coldcard is explicitly different:
firmware returns the displayed address immediately and offers display/dismiss,
not an approve/reject authorization decision.

| Family   | HWI 3.2.0 address operation                                       | HWI `close()` behavior     | Groot v0.4.28 rule                                                                  | Current physical evidence                                                                                      |
| -------- | ----------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Jade     | `get_receive_address`                                             | Serial disconnect          | Keep the modal open after Groot close; wait for rejection on Jade and drain reply   | **PASS:** packaged Testnet4 Jade Classic rejection closed both device prompt and modal; unchanged retry passed |
| Ledger   | `get_wallet_address(..., display=true)`                           | Stop client transport      | Same conservative on-device rejection rule                                          | **PASS:** packaged Testnet4 Nano S Plus rejection closed both device prompt and modal; unchanged retry passed  |
| Trezor   | `btc.get_address(..., show_display=True)`                         | Close client transport     | Same conservative on-device rejection rule                                          | Focused regression required separately for Model One and Safe 3                                                |
| BitBox02 | `btc_address(..., display=True)`                                  | Close HID transport        | Same conservative on-device rejection rule                                          | **PASS:** original BitBox02 packaged v0.4.31; focused Nova regression remains separate                         |
| Coldcard | `show_address` / `show_p2sh_address`; address returns immediately | Close USB device transport | Compare exact returned address; no fictional approve/reject or rejection-drain step | **PASS:** Mk4 firmware 5.6.1 packaged v0.4.61 exact Testnet4 equality, restart, and repeat verification        |

This table is a protocol/source claim, not inherited physical evidence. The
source references are the tagged HWI 3.2.0 adapters under
[`hwilib/devices`](https://github.com/bitcoin-core/HWI/tree/3.2.0/hwilib/devices).
Every exact model with an address decision must still prove close, rejection,
no-persistence, and unchanged retry. Coldcard instead proves canonical network
selection, exact returned/displayed equality, host cancellation without a fake
on-device rejection instruction, restart persistence, and repeat verification.

## Local preflight

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm hardware:preflight
```

The command prints only device model and readiness. Fingerprints, xpubs, and device paths are deliberately omitted.

Detected-but-not-ready devices are not equivalent to missing devices:

- **Trezor Safe 3:** the reviewed minimum is HWI 3.2.0. HWI 2.3.1 reports code `-13` / unsupported model even after a successful on-device PIN; that is a host compatibility failure, not a bad PIN or incomplete backup. Keep Trezor Suite fully quit, enter the PIN on the Safe 3 touchscreen, and rescan after Groot is restarted against the reviewed boundary.
- **HWI 3.2.0 scan latency:** physical Safe 3 testing and isolated host timing measured one all-backend `enumerate` at roughly 9–12 seconds, including large standalone HWI startup/import cost. HWI 3.2.0 ignores its `--device-type` selector for enumeration, so v0.4.28 invokes exactly one aggregate `enumerate` per explicit scan even when three or seven saved families are eligible. Packaged testing with a locked original BitBox02 additionally showed that the BitBox adapter can start device-password entry inside `enumerate`, before returning a path-only row; the former 30-second bound therefore terminated a successful human unlock. Rust validates the bounded response, rejects conflicting non-empty paths, caches all valid paths behind opaque short-lived capabilities, and filters each caller afterward. Aggregate discovery now has an absolute 90-second bound; selected-device review has five minutes. Packaged Nova follow-up then reached the selected path but surfaced only sanitized `hardware_unavailable` during account-key handoff. Initial BitBox single-key import retries only HWI's typed `-3`, `-9`, `-12`, or `-15` responses on that same capability, for at most three total attempts; rejection, malformed output, and identity/path/network failures remain terminal. A native coordinator prevents scans during interactive prompts and rejects excess work. Scans and non-interactive work are canceled with acknowledged process-tree cleanup; an active trusted-display decision instead remains bound to the modal until the user rejects or approves it on-device because HWI transport closure is not a device-screen cancellation guarantee. Every health, display, policy, and signing operation treats the cached path only as a hint and freshly proves the type, fingerprint, derivation, and full saved account xpub under the same exclusive lease as the action. Dynamic selectors, paths, descriptors, and PSBTs use HWI's stdin protocol rather than process argv. Process isolation remains intentional; migration to an in-process hardware library requires a separate ADR.
- **Packaged BitBox discovery correction:** follow-up showed that the five-minute aggregate bound looked like an endless scan and that the isolated selected-device connection may request the BitBox password again. Aggregate discovery is now capped at 90 seconds; selected-device review retains five minutes. A fingerprint-less BitBox row is described as detected, and Groot explicitly tells the user to enter the password again on BitBox if requested. Packaged v0.4.29 then disproved four candidates in sequence: retrying HWI's overloaded unavailable-action result, custom-path `getkeypool`, canonical BIP84 keypool arguments sent to Groot's cached HID path, and HWI-owned type/fingerprint rediscovery through global `--stdin`. Both original BitBox02 and Nova failed while Trezor and Ledger imports passed in the same package. Source archaeology showed that the last certified Nova build already used HWI 3.2.0, a cleared environment, and process isolation; the later global `--stdin` conversion was the remaining shared boundary. Initial BitBox single-key import now requires one scanned BitBox family row and uses HWI's documented argv mode for a fixed BIP84 command. No path, fingerprint, address, descriptor, key, PSBT, password, or device identifier enters argv; the response must still atomically prove fingerprint, exact BIP84 origin, and account key. Physical import retest remains open separately for both models.
- **BitBox pairing prerequisite:** the documented-argv package still failed for both models, disproving that invocation mode as the active cause. Sanitized inspection established that HWI's BitBoxApp cache retained an app Noise key but no paired-device public-key list. HWI can enumerate USB in that state but intentionally refuses first pairing in external-GUI mode. Groot now maps HWI's fixed unpaired-device response to localized BitBoxApp pairing guidance, skips futile transient retries, and never forwards raw HWI text. After the pairing state was repaired with BitBoxApp and BitBoxApp was fully quit, packaged v0.4.29 Testnet4 BIP84 import passed independently on the original BitBox02 and Nova. This proves account-key import only; the remaining exact-model package rows stay open.
- **Localized readiness rows:** packaged French testing exposed an English Trezor PIN-readiness message originating at the native boundary. Every native hardware-device row message now has explicit French and Spanish catalog entries, backed by a source-contract test that fails if new Rust status copy is uncatalogued. Packaged visual retest remains required.
- **Focused regression after the bounded-read change:** each previously passed USB model needs one focused account-import or saved-identity health-check smoke test at the relevant BIP84/BIP48 path before release. Existing receive, signing, interruption, and hostile-PSBT evidence remains valid unless that focused identity check fails.
- **Trezor Model One / KeepKey:** quit Trezor Suite or other companion software completely before scanning; an unlock session created by the companion app is not shared with Groot. Choose the locked device in Groot and start the scrambled PIN matrix. For every PIN digit visible in the shuffled device matrix, tap the blank Groot cell in the same spatial location; never enter the digit itself. If passphrase support is enabled, Groot may import the seed-only standard wallet only after the user explicitly confirms that choice. A hidden wallet requiring host passphrase entry remains blocked.
- **Coldcard invisible while locked:** HWI may return no device before the Coldcard exposes its USB wallet interface. Groot cannot truthfully identify a device from an empty HWI result. Sign in on Coldcard, ensure its USB port is enabled, reconnect, and scan again.
- **BitBox02:** connect and scan directly in Groot, then enter the device password when prompted. If BitBoxApp is open, quit it so Groot can use USB.
- **Ledger:** quit Ledger Live, unlock the device, and open the app matching Groot's network: **Bitcoin Test** for Regtest, Signet, or testnet; **Bitcoin** for mainnet. HWI enumeration can expose a fingerprint from either Ledger app, so Groot labels that state **Detected**, not ready; only the subsequent account-key read verifies that the network-matching app is open. A BIP48 multisig key may request on-device public-key export approval; a standard BIP84 single-key read may complete without one. Groot reopens the exact recently enumerated device path and derives the fingerprint and account key in that session, but every Ledger model/firmware combination still requires the physical import, reconnect, wrong-device, cancellation, address, and signing evidence below.
- **Jade:** a PIN-saved wallet is bound to either Jade's production or test network family. Groot Regtest and Testnet4 require a **Testnet-configured** Jade; a Mainnet-configured wallet fails with actionable network-mismatch guidance. HWI 3.2.0 does not map its Testnet4 chain enum inside the Jade adapter, so Groot uses HWI's `test` selector only for exact-device Jade operations while retaining Testnet4-authoritative derivation and identity checks. Log in directly over USB with the PIN on Jade and leave it connected. A canceled login remains locked and is reported as retryable without exposing the raw HWI code. **Temporary Signer** is the non-destructive alternative for a Mainnet-configured device, but its wallet is forgotten on logout or reboot.
- **Coldcard:** unlock and enable USB communication.

For an already-paired BitBox02, connect it and scan directly in Groot; enter the device password when prompted. Use BitBoxApp only when Groot explicitly reports that first-time pairing is required, then quit it and rescan after pairing.

Start Bitcoin Core regtest and Groot in separate terminals:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm regtest:start
```

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
bash scripts/dev/tauri-regtest.sh
```

Each explicit scan must execute one aggregate HWI `enumerate`, regardless of
the number of saved signer families. Rust filters the validated result for the
active wallet; conflicting non-empty paths fail closed as `hardware_ambiguous`,
and selecting a uniquely path-addressable locked BitBox02, Jade, or Ledger row
redeems its existing capability into a full live-identity proof rather than a
retry scan. Multiple unresolved same-family paths fail closed as ambiguous;
Coldcard readiness still requires preparation and an explicit rescan.
Keep unrelated device families attached during the focused regression and
confirm that only eligible saved identities are offered. After selection, the
health, address, policy, or signing operation must freshly prove the exact
device type, fingerprint, derivation, and complete account key under the same
exclusive lease as its action, then prove the returned address or PSBT against
the authoritative wallet context. Closing the modal must cancel the native
operation, release the lease, and prevent any late prompt or persistence. If an
address decision is already visible on the trusted device, Groot must keep the
modal open, ask for on-device rejection, drain that response, and only then
close without persisting verification. Navigation or process exit retains
bounded process-tree termination as a cleanup fallback but is not certified as
a way to dismiss the device screen.

## Per-device acceptance story

### Delayed Recovery and Inheritance campaign

Finish each exact model's Standard Testnet4 rows before opening delayed-policy
certification. No device currently has a supported delayed-policy USB row under
the pinned HWI 3.2.0 boundary. BitBox02 (original and Nova separately), Ledger,
and Jade are future firmware candidates only. After a reviewed adapter exists,
each exact model must independently prove descriptor registration or complete
policy delivery, first-address equality, normal 2-of-3 signing, one mature
delayed-key spend, protection renewal, rejection with an unchanged proposal,
restart/reconnect, wrong-device rejection, hostile/foreign PSBT rejection, and
relative-lock/reorg fail-closed behavior in the packaged Testnet4 app. Until
then, only offline PSBT transport may be exercised, and it must not be recorded
as USB hardware certification.

### Completed local checkpoint — BitBox02 Nova

The exact-model BitBox02 Nova HWI 3.2.0 desktop USB campaign is recorded in the
[sanitized BitBox02 Nova checkpoint](hardware-certification-bitbox02-nova-2026-08-17.md).
Its local Regtest BIP84 and BIP48 USB core journeys passed under local
self-review, including policy/address proof, funded signing, restart, negative
PSBT and wrong-device checks, interruption/retry, broadcast/accounting, and
independent clean-profile Groot JSON recovery with the funded source preserved
and subsequently reopened intact. The remaining local limitation is that the
shared three-device BitBoxApp cache was not destructively reset. Original
BitBox02 evidence is not inherited.
Testnet4, packaged-candidate, independent-review, and Whisper/BLE rows remain
open.

Packaged v0.4.65 Testnet4 later passed a focused Bitcoin Core sync-lifecycle
regression while this Nova-named watch-only profile was selected: the initial
history scan survived Activity/Overview navigation, completed without a
progress restart, retained a truthful last-successful-sync age across repeat
sync and app restart, and showed the corrected warning spacing. This is not
hardware evidence because the signer is not contacted during descriptor sync;
it does not close Nova receive, health, policy, signing, pairing-cache,
Whisper/BLE, or independent-review rows.

Packaged v0.4.81 Testnet4 then passed exact-Nova single-key identity use,
trusted-display receive-address comparison, an explicit birthday-and-gap Core
history scan, and physical review, signing, validation, and broadcast of a
fee-only CPFP child. Confirmation was not reported. The review, Activity row,
and wallet balance counted the child fee once, but Overview's pending annotation
counted that same self-spend debit twice. The affected pending presentation is
therefore failed evidence for v0.4.81 and is corrected for focused retest in
v0.4.83. No address, transaction identifier, fingerprint, account key, device
path, PSBT, credential, or label is retained.

Packaged v0.4.83 Testnet4 at commit `12cf1714` then passed that focused
presentation retest against the preserved Nova wallet and existing fee-only
child. The reviewer reported a successful sync, confirmed self-spend
classification, the network fee counted once in Overview, Activity, transaction
detail, and wallet accounting, and the same state after a complete quit and
relaunch. This is read-only package evidence; it does not repeat or inherit the
earlier physical signature. The same candidate physically passed Nova BIP48
public-account import. Its setup header incorrectly said **Regtest · Native
SegWit**; source inspection confirmed hardcoded presentation copy while the
frontend, Rust trusted boundary, HWI chain, bundle identifier, and running shell
remained Testnet4. The reviewer later continued on that exact candidate,
imported the Safe 3 BIP48 public account, and completed Nova policy registration
and first-address proof. The first wallet-creation attempt failed when the
preselected network-setup source was no longer unlocked; turning reuse off
created the same policy as an offline Testnet4 wallet. Safe 3's saved-identity
health check then passed. These observations close only those setup rows. The
network-label and stale-reuse fallback rows fail for v0.4.83, the new wallet has
never synced, and no funded proposal, signature, or broadcast is claimed.
Screenshots containing public signer identifiers and node details were excluded
from evidence. No address, transaction identifier, fingerprint, account key,
device path, PSBT, credential, RPC detail, or label is retained.

Independent review remains explicitly deferred until all Testnet4 hardware
device campaigns are finalized; it is neither passed nor failed.

Packaged v0.4.84 Testnet4 at commit `8ff4e7da` subsequently passed the focused
Nova BIP84 negative and persistence campaign. The reviewer reported an
authoritatively reviewed self-transfer proposal, explicit on-device rejection
with zero signatures and an unchanged retry, USB interruption with a clean
retry, wrong-device refusal, exactly one verified signature from the correct
Nova, and persistence of that ready-to-broadcast proposal after a complete quit
and relaunch. It was deliberately left unbroadcast. This closes those BIP84
package rows without duplicating the earlier Nova broadcast evidence. The same
candidate's shared offline multisig coordinator accepted a copied Testnet4
network setup but later stopped during synchronization while preserving its
last verified checkpoint. That unresolved setup/sync regression blocks funded
BIP48 execution and is not hardware evidence. Screenshots containing public
signer or transaction metadata were excluded; no prohibited identifier,
credential, RPC detail, PSBT, or label is retained.

Packaged v0.4.85 Testnet4 at commit `5ba40001` then repaired the stale active-chain
checkpoint boundary and completed the previously blocked shared Nova/Safe 3
BIP48 campaign. The reviewer reported successful sync, independent receive
display on both devices, the first disposable deposit, explicit rejection and
cable-interruption recovery on each signer, independent Safe 3 and Nova
signatures reaching 2-of-3, local-signature discard and signed-PSBT restoration,
finalization, broadcast, and self-transfer fee-only accounting. The subsequent
RBF quote failed before proposal construction or hardware interaction because
the package requested Core replacement policy through `getnetworkinfo`, which
the documented least-privilege RPC configuration intentionally omitted. RBF is
therefore open as an application defect rather than failed hardware evidence.
Submitted screenshots exposed public wallet, signer, or transaction metadata
and were excluded; no prohibited identifier, credential, RPC detail, amount,
PSBT, or label is retained.

Packaged v0.4.88 Testnet4 at exact commit `4fcd5f27` received a bounded shared
presentation regression on 2026-09-01. The reviewer reported that permanent-label
behavior in light and dark modes, single-key and multisig coin-selection
presentation, provenance and privacy warnings, all exercised app-to-device
amount comparisons, and toast presentation passed. Five long labels exposed
insufficient review-row spacing and crowded Overview signing-progress alignment;
one BTC send-signing summary also overflowed and did not toggle denomination.
Those presentation findings keep this exact package limited and require a new
candidate-bound retest after correction. No physical result is inferred for the
correcting source branch, and no address, transaction identifier, fingerprint,
account key, descriptor, PSBT, device path, credential, node detail, amount, or
label is retained.

The reviewer subsequently completed additional functional hardware rows on that
same exact v0.4.88 package. Safe 3 passed funded BIP84 review, signing,
broadcast, and wrong-device rejection. Nova passed an RBF replacement. In the
shared BIP48 policy, Groot truthfully showed **No setup needed** for Safe 3;
Safe 3 and Nova independently displayed the same receive address; a real
Testnet4 deposit and 2-of-3 spend completed; and finalization, broadcast,
confirmation, restart, and accounting passed. A genuinely empty profile then
recovered the BIP48 wallet from its public descriptor/backup and reproduced the
expected wallet state. This satisfies the worksheet's packaged clean-profile
public-backup recovery criterion for the BIP48 campaign, so that criterion is
not left open under a second name. The separately deferred recovery procedure
the reviewer was unsure how to execute remains open, as does an independent
tester/reviewer run. These functional results belong only to `4fcd5f27`: later
send-review UX fixes and the v0.4.89 Core-rescan correction require their own
candidate-bound evidence.

The same exact v0.4.88 package later exposed a Bitcoin Core catch-up race while
the Safe 3 BIP84 profile was selected after its saved network configuration was
changed. A full-history attempt stopped with the prior verified checkpoint
preserved and only the generic wallet-reconciliation error visible. After Core
advanced, a birthday scan from a reviewer-selected height with the standard gap
limit completed, recovered the expected pending wallet state, and a subsequent
normal sync also completed. The later successes do not convert the earlier
failure into a pass: they are consistent with Core catching up to the saved
checkpoint. This is public wallet-sync evidence only—the device does not
participate in descriptor synchronization—and requires a focused retest on the
candidate that introduces explicit node-catch-up and retained-history errors.
No address, transaction identifier, fingerprint, account key, descriptor,
PSBT, device path, credential, endpoint, RPC detail, amount, or label is
retained.

Exact packaged v0.4.89 commit `c9309d3` was then exercised with Bitcoin Core
fully synchronized. The reviewer reported that full-history rescans completed
successfully for every exercised wallet. This closes the candidate-bound rescan
regression and confirms that the prior verified wallet state remained usable;
it does not imply a clean-profile recovery or independent-review pass, and no
device interaction is inferred from descriptor synchronization.

### Completed checkpoint — BitBox02

On 2026-08-15, the original Bitcoin-only BitBox02, firmware 9.26.3, passed the Regtest receive-address comparison and an independent BIP48 2-of-3 flow: account-key import, policy registration, first-address review, explicit signing rejection with a retryable unchanged proposal, successful retry, one-signature restart persistence, threshold completion with Trezor Model One, and broadcast. It then passed wrong-device rejection without collecting a signature, USB interruption during signing with a clean retry, rejection of a signed PSBT from another proposal without changing signatures, and an independent BSMS descriptor-recovery test reproducing the same first receive address. The sanitized host record is macOS 26.1 Tahoe with HWI 2.3.1, tested 2026-08-15 in Europe/Andorra (UTC+2). This evidence applies only to the original Bitcoin-only BitBox02; it does not cover Nova. Do not publish addresses, fingerprints, xpubs, PSBTs, or device paths.

Packaged Testnet4 v0.4.29 follow-up repaired the local BitBoxApp pairing state and then passed initial BIP84 import independently on the original Bitcoin-only BitBox02 and Nova. Nova subsequently passed one BIP84 trusted receive-address display. The original model was discovered as ready but returned an unlock-required failure when trusted display began; Groot persisted no verification. Packaged v0.4.30 then passed trusted receive-address display and approval on the original model through the corrected saved-device boundary, followed by a disconnect/reconnect saved-identity health check against the live signer. Packaged v0.4.31 passed the focused close/on-device rejection/no-persistence/unchanged-retry flow on the original model. The same focused evidence remains open separately for Nova.

In a separate packaged v0.4.31 standard 2-of-3 Testnet4 wallet, the original BitBox02, Ledger Nano S Plus, and Trezor Model One each passed BIP48 account-key import and live saved-identity health. BitBox02 and Ledger then independently passed their device-specific policy registration and exact first-address proof; Trezor correctly required no persistent policy setup. Ledger also failed closed with an actionable hardware alert when locked and completed the unchanged review after being unlocked. Packaged v0.4.32 subsequently passed exact receive-address display on all three signers. This evidence covers setup and address proof only, not funded signing or the remaining negative rows.

On 2026-08-27, a funded standard Testnet4 2-of-3 flow with an original BitBox02 and Ledger Nano S Plus passed explicit BitBox rejection with zero signatures, unchanged BitBox retry with exactly one accepted signature, Ledger policy-and-transaction approval as the second signature, threshold finalization, and broadcast of a reviewed 10,000-sat payment with a 190-sat fee. The exact packaged version of that earlier signing session remains open. The reviewer subsequently opened sealed v0.4.53 and its Overview retained the unconfirmed outgoing activity, 10,190-sat total debit, and 670,926-sat unconfirmed wallet change; the Settings footer independently showed Groot 0.4.53 on BDK Testnet4. After confirmation, Coins showed exactly one 670,926-sat wallet-change output with one-wallet-input lineage and the preserved source payment intent, while the spent funding input was absent from the unspent set. This passes v0.4.53 post-broadcast activity, accounting, confirmed coin-state, and lineage persistence, not partial-signature persistence because finalization had already occurred. The locked-Ledger signing failure was not performed in this flow and remains open. No address, fingerprint, xpub, PSBT, device path, or transaction identifier is retained in this checkpoint.

The sealed v0.4.53 follow-up then completed a second funded 5,000-sat standard 2-of-3 proposal with a 190-sat fee. The reviewer directly reported successful denomination toggling, on-device cancellation without destructive mutation, a first Ledger signature, complete Groot restart with the partial signature and exact proposal preserved, a clear locked-Ledger failure without lost progress, compact and expanded policy-address review, the explicit Ledger policy-to-transaction transition, a second independent BitBox02 signature, signed-PSBT export, threshold finalization, and Testnet4 broadcast. The post-broadcast balance was 665,736 sats. This closes the funded v0.4.53 partial-signature restart and locked-Ledger negative rows for the original BitBox02/Ledger standard-wallet combination. No sensitive identifiers are retained.

The reviewer then exercised a separate packaged v0.4.54 21,000-sat standard 2-of-3 proposal specifically for partial-PSBT merge and local-signature removal. The original BitBox02 signature was added and removed; importing the same one-signature PSBT restored it; a complete Groot quit and reopen preserved that one-signature proposal; an unsigned copy contributed no new signature; and a foreign-wallet PSBT was rejected without changing the proposal. Ledger Nano S Plus supplied the independent second signature, its local signature was removable, and importing the previously fully signed copy restored both signatures. After removing Ledger again, a new Ledger signing attempt exposed a UI defect when the device re-locked: Groot remained on **Check your hardware device**, did not retain an accessible policy reference, and gave no close-request feedback while Ledger advanced through policy and transaction review. Testing stopped there. No second Ledger re-sign, finalization, or broadcast is claimed for this proposal. No address, transaction identifier, fingerprint, xpub, device path, PSBT, or credential is retained.

The sealed packaged v0.4.57 follow-up resumed that standard-wallet campaign after correcting the locked-device interaction. The reviewer reported that the policy reference remained accessible, the close path gave explicit on-device cancellation guidance without mutating the proposal, and retrying with the unlocked Ledger added the independent second signature. Groot reached 2 of 2, exported the signed PSBT with its signature-count suffix, finalized at threshold, and broadcast the reviewed transaction on Testnet4. This closes the packaged BIP48 partial-PSBT merge/removal, locked-Ledger retry, signed-export, threshold, and broadcast rows for the original BitBox02/Ledger combination. It does not certify either device's remaining packaged BIP84 single-key rows or provide independent review. No address, transaction identifier, fingerprint, xpub, device path, PSBT, or credential is retained.

The packaged v0.4.57 Trezor Model One follow-up then completed the standard BIP48 Testnet4 transaction campaign: PIN unlock, complete on-device recipient/amount/fee/locktime review, one accepted Trezor signature, local signature discard, unchanged re-signing, full Groot restart persistence, independent Ledger threshold completion, fully signed PSBT export, modal-close attention behavior, finalization, and broadcast all passed. One deliberately slow first review exceeded Groot's five-minute host deadline and left Trezor on a loading screen until reconnect; a later hardware action begun after idle-session expiry showed an inline lock error instead of routing to unlock. The transaction was a wallet-owned recipient, and Trezor correctly displayed recipient and change derivation paths while Groot did not identify the self-transfer. The packaged v0.4.58 focused retest then passed authoritative self-transfer classification and disclosure, preserved the exact active device review for more than six minutes without an error or proposal/signature mutation, and accepted the Trezor signature after that extended review. Candidate `101177a` subsequently kept the active Trezor review open beyond the configured one-minute idle deadline, accepted the signature, routed immediately to the lock screen when review finished, and restored the same proposal with one signature after unlock. This closes the focused Model One automatic-lock regression without repeating or broadening the other model and transport rows. No address, transaction identifier, fingerprint, xpub, device path, PSBT, or credential is retained.

On 2026-08-28, the reviewer installed and verified Coldcard Mk4 firmware 5.6.1, then used packaged Groot v0.4.59 for a Testnet4 BIP84 single-key import. USB unlock, public account-key extraction, on-device master-fingerprint comparison, wallet creation, and saved-identity health check passed. The first address attempt returned `bcrt1` because the Mk4 was configured for Regtest; v0.4.60 incorrectly treated that configuration mismatch as a compatibility encoding. After the reviewer switched the Mk4 to Testnet4, the physical device displayed the canonical `tb1` address matching Groot and confirmed that Coldcard address display has no approve/reject decision. v0.4.60 still presented its synthetic `bcrt1` alias in the comparison modal, so that package is not certification evidence. v0.4.61 removed the alias, required exact Testnet4 equality, and added accurate display-and-dismiss instructions. The reviewer then physically passed exact receive-address verification, a complete Groot restart, and repeat verification in packaged v0.4.61. This closes the focused identity/address checkpoint only; funded payment signing, interruption, negative-PSBT, broadcast/accounting, recovery, and independent-review rows remain open. No address, fingerprint, account key, device path, or other identifier is retained.

The subsequent packaged v0.4.67 funded Testnet4 BIP84 run exercised a reviewed Coldcard payment across cable, Virtual Disk, and microSD. The reviewer added a cable signature and explicitly discarded it, then completed independent signed-PSBT import through both Virtual Disk and microSD; signature verification, complete app restart with the ready proposal preserved, final broadcast, and wallet accounting passed. A close request while the Coldcard decision was active correctly waited for on-device cancellation and returned to the unchanged signing page. The run exposed two package defects: a later cable rescan reused the old USB discovery after disconnection, and the newly broadcast outgoing payment appeared below an older unconfirmed receipt because that receipt's missing BDK observation time was regenerated. Packaged v0.4.68 then passed the focused physical retest: USB interruption followed by a fresh rescan/reconnect restored the Mk4, and the most recent outgoing activity retained the correct position. The same package signed and broadcast a CPFP fee-only child through the Mk4. Its automatic RBF attempt did not establish an RBF pass: Bitcoin Core's sparse Testnet4 estimate was below BDK's required replacement minimum, but Groot mislabeled that condition as insufficient balance. v0.4.69 gave that case its accurate error and the reviewer reran it with a qualifying manual rate. The original paid a 153-sat fee at about 1 sat/vB; 2 sat/vB correctly failed against BDK/Core's exact 2.004 sat/vB absolute-plus-incremental minimum. Entering 2.5 sat/vB produced a 458-sat replacement displayed at 3.01 sat/vB because v0.4.69 silently rounded the requested rate up to 3 sat/vB before BDK constructed the whole-satoshi fee. The physical Mk4 review, signature, broadcast, active replacement, and retained old **Replaced** row all passed, so the packaged RBF row is closed while the target/effective-rate mismatch is a product defect corrected in v0.4.70. The same packaged campaign rejected a foreign signed PSBT without changing the proposal, closing that row. Mutated-signature PSBT rejection, independent clean-profile recovery, and independent review remain open. No address, transaction identifier, fingerprint, account key, PSBT, device path, or credential is retained.

The sanitized v0.4.69 screenshots are evidence only for successful RBF lineage presentation: one new active replacement plus the prior transaction retained as **Replaced**. They contain no retained identifier and do not close mutation, recovery, or review rows.

Packaged v0.4.74 Testnet4 then passed the focused canonical-chain-winner presentation retest. The reviewer directly reported that Overview and Activity each showed the RBF conflict set as exactly one normal, non-struck payment row without double-counting; opening that row retained the complete original-to-higher-fee-replacement timeline, compact transaction references, available fee-rate context, and an honest chain-winner state without clipping or overflow. The reviewer reported no profile or transaction mutation. Because the sanitized report did not name which permitted winner state appeared, this checkpoint does not infer whether the replacement confirmed, the original confirmed first, or the replacement remained pending. It does not close the mutated-signature, independent clean-profile recovery, or independent-review rows. No address, transaction identifier, fingerprint, account key, PSBT, device path, credential, or node detail is retained.

Packaged v0.4.77 Testnet4 then passed the bounded hostile-signature row with the exact Coldcard Mk4 campaign proposal. The reviewer reported that the valid one-signature PSBT first imported successfully, its local signature was explicitly discarded, and the repository helper's one-byte partial-signature mutation was rejected as an invalid signature without changing the zero-signature proposal. A complete Groot quit and reopen retained that unchanged state. Importing the untouched signed copy afterward advanced the proposal exactly once to one accepted signature. The proposal remains unbroadcast, so this checkpoint closes only the packaged mutated-signature rejection and restart/no-mutation row; independent clean-profile recovery and independent review remain open. No address, transaction identifier, fingerprint, account key, PSBT, device path, credential, node detail, or file location is retained.

### Completed BIP84 checkpoint — Blockstream Jade

The exact physical target is an original Blockstream Jade, firmware 1.0.40, on macOS 26.1 Tahoe with HWI 2.3.1 and Regtest. Its lifecycle and complete funded BIP84 USB flow passed. Its funded BIP48 2-of-3 flow also passed policy/address proof, rejection/retry, partial-signature restart, interruption/retry, duplicate and foreign PSBT rejection, wrong-device rejection, saved-identity health, threshold completion, broadcast/accounting, and local backup self-test. The sanitized evidence and defects corrected during the run are in [`hardware-certification-jade-2026-08-15.md`](hardware-certification-jade-2026-08-15.md). This completes the local Regtest USB campaign; release certification remains in progress until independent clean-profile recovery and release-environment rows pass. This campaign does not certify Jade Plus, QR, or BLE.

Record only vendor/model, firmware, host OS, HWI version, date, and pass/fail/limitation. Keep the report under `hardware-certification.local/`, which is gitignored.

1. Use a device that is already initialized with a seed and offline backup. Connect and unlock it; keep it ready over USB (and open its Bitcoin app when that vendor requires one). Groot must never initialize a signer or request its seed.
2. Create a 2-of-3 wallet and import its BIP48 public account key through HWI.
3. Confirm the on-device fingerprint matches the locally saved record.
4. Disconnect/reconnect and run the health check. Confirm Groot reads the connected device's BIP48 account xpub and matches both the full key and fingerprint against the saved signer, including when that signer was originally imported by file, QR, or manual entry.
5. Generate a labeled receive address and verify it on-device where supported.
6. Fund it on regtest and prepare a PSBT.
7. Reject signing once; confirm Groot remains retryable and records no signature.
8. Sign the unchanged PSBT; confirm exactly that signer advances.
9. Connect a different device and confirm identity mismatch fails closed.
10. Import a PSBT with changed recipient, amount, input, sighash, origin, or final scripts; every mutation must fail.
11. Complete the threshold with an independent signer, broadcast, mine, restart, and verify proposal/history state.
12. Export the descriptor backup and reconstruct the same first receive address independently.

Repeat for every model intended for release. The current implementation has explicit readiness handling for Coldcard, Trezor/KeepKey, Ledger, BitBox02 including an exact Nova label, and Jade; this is code-path coverage, not physical compatibility evidence. The named first-release targets are Coldcard Mk4, Trezor Model One, Ledger Nano S Plus, original BitBox02, and original Jade. Safe 3 and BitBox02 Nova now have independent local exact-model records with explicit release-open limitations; Jade Plus still requires its own record, and no model may inherit same-family results. Nova's desktop USB path has captured real HWI enumeration, warm pairing-cache reuse, xpub, display, multisig registration, signing, negative-PSBT, interruption, broadcast, and functional recovery behavior. Whisper/BLE requires a separate authenticated-transport and mobile lifecycle review. Legacy Digital BitBox and any HWI model not listed here remain unsupported until they receive their own row and physical report. Vendor-specific policy-registration/address-display limitations must be visible in the UI and release notes; they must never be represented as successful verification.

## Mounted SD-card public-key story

1. Export only the test-chain public multisig record from the signer. Never export or select a seed, mnemonic, xprv, tprv, or private descriptor.
2. In **Add a cosigner**, choose **Import public-key file** and select the JSON file from the mounted card.
3. Groot must reject files over 256 KiB, private/recovery fields, extended private keys, malformed fingerprints, non-test-chain tpubs, and any origin other than `m/48'/1'/0'/2'`.
4. Confirm the imported fingerprint and complete account tpub against the hardware device or an independently trusted export.
5. Complete preview/create so Rust parses the tpub and descriptor; a presentation-only import is not acceptance evidence.

Groot JSON (`fingerprint`, `accountXpub`, `derivationPath`, optional `label`) and compatible Coldcard-style JSON (`xfp`, `p2wsh`, `p2wsh_deriv`) are currently parsed. Other vendor formats require captured disposable test vectors and a dedicated parser before they may appear in the UI.

## QR status

Groot now implements bounded Blockchain Commons UR v2 `crypto-psbt` animation and camera ingestion. Rust enforces payload, fragment, frame-size, frame-count, duplicate, and out-of-order constraints; Apple camera permission copy is packaged. This is **not yet platform-certified**. Each supported desktop/mobile target still needs camera permission, denial/retry, interruption, malicious frame, vendor-vector, and complete offline signing evidence. File/text fallback remains mandatory wherever the system webview cannot decode QR symbols.

Use [`hardware-certification-template.md`](hardware-certification-template.md) for every sensitive local device/model/firmware/host record. After the record is complete, use [`hardware-certification-summary-template.md`](hardware-certification-summary-template.md) to create the sanitized review artifact attached to the candidate commit. Original Jade is a required pre-mainnet row alongside Coldcard Mk4, Trezor Model One, Ledger Nano S Plus, and original BitBox02. Safe 3 and BitBox02 Nova retain separate exact-model local records with open release rows; Jade Plus still requires one. Nova's desktop USB evidence does not make it a release-certified alias of original BitBox02.
