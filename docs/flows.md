# User flows

Desktop state transitions from the shipped 5.2.0 baseline. The [5.3 mobile plan](mobile-5.3-plan.md) owns mobile candidate flows; internal iOS Testnet4 key and QR signer flows are enabled under ADR 0096 for acceptance testing, while other mobile platforms/networks, USB signing and multisig broadcast remain blocked. [Product behavior](product-spec.md) owns policy; [design system](design-system.md) owns presentation; [status](implementation-status.md) owns availability. Do not append historical overrides here.

ADR 0093 requires phone software create/restore and desktop-led multisig phone pairing/recovery/signing as distinct mobile flows. They are wired in the RC2 candidate; complete physical acceptance remains pending. QR shares public policy and PSBTs, never private keys; the [RC2 record](testing/5.3.0-rc2-mobile-keys.md) records what is actually verified.

## Create and restore

| Flow             | Transition                                                                                                                                 | Failure/cancel                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Software create  | Add wallet → native privacy gate → 24 words → verify now/later → name + confirmed passphrase + backup acknowledgement → fingerprint → open | Entropy/credential/storage errors create no partial wallet; deferred verification remains visible    |
| Software restore | Recover → name/passphrase → native word entry → exact descriptor reconstruction → open                                                     | Wrong credential does not select another wallet; cancellation retains no words                       |
| Hardware add     | Public file/text/QR or selected device → network/origin validation → full account proof → fingerprint comparison → name + app PIN → open   | Private/ambiguous/mismatched data fail closed; reconnect requires fresh selection                    |
| Multisig create  | Standard policy → name/threshold → independent public signers → policy/first-address proof → backup/recovery drill → app PIN → open        | Draft persists public state only; Recovery and Assisted recovery cards are disabled with Coming soon |
| Multisig restore | Select BSMS/JSON/descriptor → parse actual policy/signers → derive/compare first address → app PIN → open                                  | Never substitute default 2-of-3/2-of-4 for the imported model; PDF is not importable                 |

No creation form copies another wallet's network setup. Timelocked restoration is not what **restore a backup** means.

## Open, sync and configure

`unlock selected wallet → paint committed state → history consent if needed → approve genesis scan OR open Bitcoin Core connection directly`

Consent names managed-service privacy. Approval pauses automatic sync, persists the selected wallet's genesis settings and starts the scan. Error returns a durable standard notice with retry; targeted genesis retry remains possible after partial observations. Decline does not silently choose a network.

`Settings → Bitcoin Core connection → Groot managed / local / custom remote → validate exact network/genesis → protect per-wallet settings → scan`

Settings reuse is a separate explicit source-wallet action; its source must be unlocked. Copy connection/sync preferences only. Mainnet managed renewal is explicit. Test networks may separately select compact-filter confirmed activity; no Mainnet or silent fallback.

`Settings → birthday/gap draft → credential → save → full scan → atomic completion OR cancel/failure`

Show retained-history facts for pruned nodes. Keep old committed state distinct from current progress. Resume after lock/restart when possible; cancelled run progress is discarded. Normal automatic sync is selected-wallet, single-flight and 35-second post-attempt. Explicit activity/actions pause it; unavailable refresh keeps existing data with retry.

`global Settings → Bitcoin network → warning/confirmation → process restart → isolated selected-network profiles`

Global appearance/network/build identity stays available while locked or without a wallet. Wallet node settings and protected data require unlock.

## Receive

`New receive address → up to five label tokens → native atomic reveal → QR/copy → optional hardware verification/address details → payment observed`

Tab commits a label in the shared editor. Labels are permanent; text may be reused. Policy-verification failure uses WarningNotice plus the blue outlined Open Policy action. Verify the required signers, return, then generate.

`address/policy verification → passive device scan → explicitly select candidate → fresh account proof → device display → exact address comparison → optional Address details`

All devices use the same comparison and derivation rows. **Select to identify** is amber and never claims membership. A selected device may need unlock; fresh proof precedes display. Historical evidence is dated and not live readiness. Trezor PIN/reconnect and BitBox retry remain model-specific. Unsupported delayed-policy USB actions stay unavailable.

`unused awaiting request → discard exact address/labels → confirm → retire from presentation, continue monitoring`

`eligible unlabeled multisig received output → Add first permanent label → shared token editor → native ownership/eligibility → one atomic assignment`

## Send and acceleration

`recipient or parsed QR → amount/labels → eligible coins + fee → native persisted PSBT → authoritative review → software credential OR verified hardware/file signatures → final validation → broadcast → durable result`

Unknown required payment parameters and unsupported Payjoin requests fail without conventional-payment fallback. Frozen coins remain ineligible. Hardware approval and imported signatures cannot replace the transaction or its intended outputs.

`pending payment → RBF/CPFP native quote → added cost → optional fee detail → reviewed persisted proposal → normal signing/broadcast`

Invalid/stale quotes disable continuation. Confirmed originals make saved proposals read-only; explicit discard preserves the payment. Final submission rechecks the configured node's original mempool state. Reopen resumes a proposal and collected signatures; navigation preserves it, destructive discard asks confirmation.

## Coins, activity and notifications

`Coins → inspect provenance/reuse → select or confirm freeze/unfreeze → native eligibility state`

Sorting never changes policy/history. Reuse describes canonical external outputs, not duplicate replaced versions. Privacy warnings explain linked sources without inventing ownership.

`Activity → committed page → search/sort → next page OR retain rows with retry`

Receipt, broadcast and first-confirmation results update durable state. Notifications are wallet/session-bound, persisted and acknowledged idempotently; switching/locking invalidates stale frontend delivery. No terminated-app push.

## Backup, labels, PIN and deletion

| Action         | Transition                                                                                        | Guard                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Public backup  | PIN → prepare BSMS/JSON → copy/save or printable PDF → first-address drill                        | Export reveals activity, cannot spend; changing format does not repeat PIN; clear memory on exit                   |
| Labels         | Settings → privacy warning → native JSONL picker → atomic import/export → inline result + toast   | Foreign/conflicting data changes nothing; matched xpub records keep current signer names                           |
| Change app PIN | Hardware/multisig Settings → current/new/confirm → rotation → lock → new PIN unlock               | Software passphrase cannot change; failures clear fields; interrupted writes roll back before authentication       |
| Delete         | Settings → credential → DELETE → spaced backup acknowledgement(s) → removal → next wallet/welcome | Funded software needs verified backup; software requires separate passphrase backup; multisig needs recovery drill |
| App logs       | Settings → immediate skeleton → sanitized records → filter/copy/export                            | No identifiers, labels, values, credentials or arbitrary backend messages                                          |

Delete and PIN work run off the native UI thread. Error/loading/cancel/retry remain explicit; no toast is the sole result.

## Release notes and updates

`first exact version open → localized offline notes → dismiss → exact-version app preference`

Settings exposes Updates beside build identity; the side menu exposes it only after detecting a newer stable release.

`Updates → manual check OR daily opt-in → newer stable offer / no update / offline / rate limit → signed-manifest verification → bounded installer download → digest verification → reveal → explicit user installation`

Closing in-flight work cancels it; failed/cancelled stages are removed. Missing owner trust key disables preparation with an inline reason. Wallet dialogs take precedence; corner actions and release toasts do not overlap them.

## Accepted payment with local recording pending

After Core accepts a payment, local storage failure keeps the accepted transaction ID visible with an inline warning and success notification. Do not offer another payment from that result. Sync repairs the existing saved proposal from exact canonical transaction identity; a missing snapshot is never replaced by an invented balance. Later refresh failure after a committed broadcast remains a separate pending-refresh state (ADR 0090).

Separate mobile setup (`/mobile/pair`, `/mobile/recover`, `/mobile/watch`) remains reachable when an existing selected wallet is locked, including direct startup and Add another wallet. These routes pause selected-wallet session redirects and background sync; they never unlock that wallet. Phone-key creation/recovery still requires its own native backup and credential/device authorization. Background locking and authenticated wallet/signing routes remain protected.

Phone-key pairing uses the same optional native backup verification as software creation. Cancelling word presentation creates no signer; Verify later stages the key with `backupVerified=false`, preserved through restart and final policy acceptance. Pairing and the shared-wallet policy page show the reminder. The latter offers native verification/reveal using a fresh app PIN and device authorization. Only a successful native word check clears the reminder. Existing staging and profile formats remain compatible.

After a QR is completely verified, release its camera stream and replace the preview with a compact success result before credential entry. Native mobile content scrolls between the fixed safe header and bottom controls, never beneath them. Keep setup copy brief; phone signer connections are QR. iOS uses Groot credentials without repeated platform prompts; an old key may need one final platform approval (ADR 0097).

Unlocked mobile screens omit the brand header and start below the system safe area. Sync and backup reminders use compact inline actions with 44px touch targets; recovery verification remains available. This presentation change has no BIP or persisted-format impact.

Watch-only QR import retains an explicit Back to wallet action when mobile branding is hidden; leaving before camera permission resolves releases the eventual stream.
