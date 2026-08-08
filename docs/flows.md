# Wallet and coordinator flows

This document describes user-visible state transitions. The product specification owns behavior; Rust owns wallet truth; these flows own presentation and navigation.

## Single-key onboarding

`welcome → Generate software wallet → private recovery-word reveal → reconstruct all 24 words in order → wallet passphrase → created → overview`

The generated words remain hidden until the user confirms their surroundings are private. After writing them down, creation cannot continue until all 24 words have been reconstructed from a shuffled pool in the exact original order. The deterministic browser fixture supports tap/click and drag-and-drop. Production macOS performs the same challenge in a native sheet so recovery words never cross Tauri IPC or enter webview state.

- The wallet-type chooser uses three equal decision cards: software, hardware, and shared/recovery. Each card keeps its icon, title, one consequence-focused subtitle, and complexity cue inside the same target; helper copy is not detached below the action.
- Software onboarding keeps a persistent, labeled three-stage progress indicator visible on every step: **Generate → Back up → Protect**. Completed, current, and upcoming stages are distinct, so users can estimate what remains before beginning.
- Software create uses 256 bits of OS randomness to generate exactly 24 BIP39 words and one credential as BIP39 passphrase plus app unlock/signing PIN.
- **Use hardware signer** is a separate single-key path. It imports only public account data and never generates or accepts the hardware device's seed.
- Recover requires exactly 24 words and the original credential.
- Generated words stay in a zeroized Rust pending session. A secret-free native privacy gate first requires confirmation that no person, camera, or screen sharing can observe the display; only then does the attached native sheet reveal the words. The three columns read vertically as 1–8, 9–16, and 17–24. Browser fixture words exist only for deterministic UI testing and follow the same concealed-first interaction.
- Failure stays on the current step with an inline error. A successful operation clears credential/recovery input before navigation.
- When any wallet already exists, every add-wallet step has a close action that returns to the selected wallet without consuming the pending onboarding session.

## Multiple wallets

`current wallet → Add wallet → create/recover → selected and unlocked`

`wallet selector → choose profile → reuse its unexpired session or unlock that profile → kind-appropriate home`

Each profile owns a UUID-isolated directory and unlock session. Switching never lets one wallet authorize another, but it also does not revoke the wallet being left. Returning before that wallet's independent inactivity deadline opens it directly; an expired or never-unlocked wallet shows its own credential screen. The duration is one global preference for every wallet, defaults to five minutes, and is configurable under **Settings → Security → Automatic lock**. Activity in one wallet does not refresh another. Background polling does not count as activity. Deleting the selected profile chooses another remaining profile and returns to that profile's unlock state, or returns to onboarding if no wallets remain.

Wallet is the common top-level container. Software-key, hardware-key, shared multisig, and recovery/inheritance policies all use the same Overview, Activity, and Coins destinations. Policy is an additional detail destination for wallets with multiple signing paths; it is not a separate balance-bearing vault.

## Unlock and deletion

`wallet list → select wallet → focused unlock card → credential check in Rust → wallet` or `invalid_credential → focused unlock card`

The locked screen's central card names only the selected profile. The persistent desktop sidebar retains the wallet list, **Add wallet**, theme, and network status so another profile can be selected without carrying credential state. Wallet-scoped navigation and Settings remain absent until unlock. Hover, focus, or activation of network status shows only data Satchel can verify: public fee policy is available while locked, while node height, backend, and transport are checked after unlock. There is no Back or second add-wallet action inside the unlock card; **Add wallet** in the sidebar is the sole creation entry when profiles exist. Direct fresh-install onboarding redirects back to unlock unless that explicit add-wallet route is active. Software-key wallets call the credential **Wallet passphrase** and explain that it is the BIP39 passphrase that must remain with the recovery words. External-hardware and multisig wallets call it **App PIN** and explain that it protects local Satchel data only, not the hardware seed or hidden wallet. Credential fields across onboarding, unlock, signing, descriptor export, recovery, and deletion have explicit show/hide controls.

`unlocked wallet → Settings → Lock now / backup information / recovery controls / wallet node / appearance`

Settings clearly labels scope. **Lock now** is first and affects only the selected wallet. **Automatic lock** is global and sets the shared duration used by every wallet's independent inactivity clock. Appearance is also global. Backup, credential, and node controls apply to the selected wallet; backup rows explain requirements only because Satchel never re-displays recovery words or a wallet passphrase after creation. Wallet switching and **Add wallet** stay in the persistent wallet list, and policy creation/recovery starts from that add-wallet flow rather than a generic Settings section.

`settings → delete warning → credential + type DELETE → Rust verification/deletion → unlock next wallet / welcome`

For a selected locked disposable regtest wallet: `locked → delete warning → type RESET REGTEST → Rust deletion → next wallet or welcome`. This works for either profile kind and is unavailable on public networks.

Deletion is device-local. It never implies that transaction history disappeared from Bitcoin. Multisig deletion additionally requires an in-session successful recovery drill for the exact current descriptor, the wallet PIN, and its exact name.

## Receive

`no awaiting address → mandatory permanent label → atomic reveal+label → QR/copy`

Any number of unused addresses may await payment concurrently. Each may transition independently to `discarded` and remains monitored. Any observed payment transitions that address to `used`, after which discard is impossible.

## Single-key send

`recipient+permanent label+amount+fee → persist Rust PSBT+label → authoritative review → credential → sign+broadcast → durable labeled success`

The review is derived from the persisted PSBT, while Rust normalizes and persists the mandatory outgoing label alongside that proposal. The recipient is shown as `prefix…suffix` and opens a complete grouped, copy-safe detail modal. A wrong credential clears the field and leaves the reviewed proposal available for retry. Restart reloads the exact proposal; it does not rebuild transaction intent from UI fields. PSBT export opens the native file picker, validates a bounded PSBT at the Rust boundary, and reports a durable success or failure. Canceling first opens a destructive review of the payment and collected signatures; only the modal's confirmation calls the cancellation boundary. **Back to overview** opens a separate leave confirmation and preserves the proposal and signatures for later resumption. Broadcast emits a toast and returns an updated snapshot whose activity record uses the permanent outgoing label.

`pending transaction → Increase fee (RBF) or Spend output (CPFP) → persisted acceleration PSBT → normal review/sign/broadcast`

Acceleration never bypasses review or signer thresholds. Confirmed, non-replaceable, missing-output, insufficient-value, and confirmation-race states fail explicitly and remain retryable after sync.

## Multisig setup

`name+recipe or advanced M-of-N → add 3–7 cosigners → Rust validation/descriptor preview → signer policy registration when required → descriptor backup acknowledgment+app PIN → persisted coordinator`

Cosigner import paths:

- Desktop USB: Rust invokes Bitcoin Core HWI, enumerates a device, and requests the fixed BIP48 test-network account xpub.
- Mounted file: bounded Satchel or compatible Coldcard-style JSON containing only a test-chain public origin, fingerprint, and BIP48 account tpub. Private/recovery material, wrong-network paths, and extended private keys are rejected. Manual entry remains available. PSBT signing also supports bounded `crypto-psbt` UR v2 animation/camera through a bundled local QR decoder, with file/text fallback.
- Virtual device: deterministic browser/CI fixture only; it must be visibly identified as a test device.

Selecting a draft or saved cosigner opens public device details. For USB/virtual sources, **Run health check** enumerates devices through `WalletPort` and passes only when a connected device has the saved fingerprint. QR/file/manual sources can only validate that the saved public fingerprint, account path, and xpub record are complete; the result explicitly says physical presence was not checked. The latest result, timestamp, and bounded recent log are presentation state for the current app session, not a durable certification record.

Before a USB scan, the UI says that the hardware signer must already be initialized with a seed and backed up offline. Vendor companion apps must be fully quit because their USB session is not transferable to Satchel. Most devices must also be unlocked and ready in their vendor-specific Bitcoin mode. A locked Trezor Model One is the exception: selecting its detected card starts HWI's scrambled PIN matrix in Satchel. The Trezor screen alone shows shuffled digits; Satchel shows nine blank spatial cells. For each PIN digit, the user taps the blank Satchel cell in the same location, so neither PIN digits nor the shuffled matrix are reproduced in the webview. Satchel's blank grid never changes; requesting a fresh layout changes only the shuffled digits shown on Trezor. The single-use challenge expires after two minutes and a rejection requires a fresh device layout. A compact help view gives basic Coldcard, BitBox02, Ledger, Trezor, and Jade preparation steps. Detected-but-not-ready devices remain visible with a typed action. A Trezor warning that HWI selected its empty-passphrase standard wallet cannot be imported until the user explicitly chooses **Use standard wallet**; this does not alter any hidden wallet and the resulting fingerprint is bound to the cosigner. Host entry for a Trezor Model One hidden-wallet passphrase remains unsupported. BitBox02 requires a one-time pairing-code confirmation in BitBoxApp. The UI tells the user to enter the device password, wait until the wallet itself is visible rather than stopping at “See the BitBoxApp,” and only then quit BitBoxApp completely so Satchel can own USB. Satchel passes HWI only the canonical home directory needed to reuse that pairing cache. Ledger import keeps the network-matching app open—Bitcoin Test on Regtest, Signet, and testnet; Bitcoin on mainnet—and reopens the exact enumerated device by fingerprint. BIP48 may request on-device public-key export approval while a standard BIP84 read may complete without a prompt. A failed read stays in a compact retry state with a stable device-specific explanation rather than raw HWI output. Jade login remains on-device. Satchel never offers device initialization or asks for a hardware-wallet seed. When HWI returns no device, Satchel cannot safely infer that an attached USB peripheral is a Coldcard; the empty state tells the user to sign in, enable the Coldcard USB port, reconnect, and rescan.

Opening the USB picker performs two bounded enumeration passes separated by a short settling interval and merges device identities, which catches signers that become ready just after the first pass without starting an unbounded monitor. A visible **Scan again** action remains available after results appear. Closing or replacing the dialog invalidates pending presentation updates, and nested dialog transitions use reference-counted page scroll locking so the underlying page is always restored.

When a Trezor reports both PIN and passphrase requirements, Satchel must resolve them in that order: PIN matrix, fresh enumeration/fingerprint, then explicit standard-wallet selection if applicable. Both multisig and external single-key setup implement the same sequence. A later hardware passphrase does not mutate an imported standard wallet; it derives an independent hidden wallet with a different fingerprint, xpub, descriptors, and addresses, which can be added as a separate Satchel wallet.

The default recipe is 2-of-3; 3-of-5 is the larger-group recipe. Advanced mode permits 2 ≤ M ≤ N with 3 ≤ N ≤ 7. 1-of-N is excluded because it has no multisig theft protection. Duplicate fingerprints/xpubs, invalid origins, invalid test-network keys, private descriptors, and unsafe thresholds block review. Creation stores checksummed public descriptors, public cosigner metadata, a watch-only BDK database, and an encrypted app-PIN marker.

Coldcard cosigners are marked during USB import. Before creation, Satchel exports the public BIP-380 wallet policy and requires acknowledgment that it was imported from **Settings → Multisig Wallets → Import** and that the name, threshold, and fingerprints matched on-device. This registration lets Coldcard verify change instead of signing an unknown multisig wallet. Devices that do not require policy registration do not receive this gate.

The guided recovery and inheritance recipes require exactly four independent keys. Keys 1–3 are the immediate 2-of-3 primary set; key 4 is recovery-only and is never counted in the immediate branch. The creation UI labels these roles before review, while Rust rejects any recovery template whose delayed signer overlaps the immediate signer set. The V2 policy lab cannot retrofit a recovery-only key onto a three-key wallet; it blocks compilation and directs the user to create a new four-key recovery wallet.

The V2 policy lab is analysis-only: compiling does not mutate, upgrade, or replace the selected wallet. Activating a compiled policy requires creating a distinct wallet, reviewing its complete descriptor, and backing it up.

While the draft is incomplete, setup presents neutral progress such as “1 of 3 cosigners added.” Validation failures appear only after **Review wallet** is attempted, then update as the draft is corrected. Each imported cosigner card labels the device fingerprint and connection/import source explicitly and wraps the complete public account key without truncating it.

## Multisig payment target flow

This flow is implemented for regtest; see `docs/implementation-status.md` for certification limits.

`payment details → persisted unsigned PSBT → review → collect any k signatures → Miniscript satisfaction/finalization → broadcast`

Each cosigner is `ready`, `awaiting`, `signing`, `signed`, `rejected`, or `unavailable`. USB, bounded `crypto-psbt` UR v2 QR, and file signatures converge on one Rust PSBT merge function. Imported data must match the proposal's unsigned transaction and descriptor identity. The app PIN unlocks coordinator data; it never substitutes for a hardware signature.

The hardware-signing modal always offers an in-place rescan. A signer outside the wallet quorum, an unavailable fingerprint, or a rejected signing request remains as a durable inline modal error; the page behind the overlay is never the sole error surface. Existing wallets with a Coldcard cosigner can export the same public registration descriptor directly from this modal, so an unknown-wallet failure is recoverable without rebuilding the coordinator.

## Descriptor backup and recovery scan

`app PIN authorization → BSMS recommended or Satchel JSON → copy/download/one-page printable QR backup → named file ready → first-address drill → offline storage`

BSMS is the interoperable public standard for a standard sortedmulti wallet. Satchel JSON retains custom recovery-policy metadata and labels. Both are parsed and verified in Rust. The app PIN authorizes export but is not a file-encryption password: the exported watch-only record cannot spend, yet should stay private because it reveals address derivation and wallet activity. Explicit export re-authentication accepts the correct vault PIN even after an idle-session timeout, then refreshes that session. The printable view is a single A4 sheet with wallet name, a legible UTC creation date, policy, network, cosigner fingerprints, and vertically stacked receive/change descriptor QR codes; the native print sheet provides PDF saving without a separate PDF dependency. Loading a drill file visibly retains its filename. A recovery drill against the currently selected vault must compare descriptor identity, not merely validate syntax, and its inline state, toast, and deletion gate all use that one authoritative comparison. Export, recovery-drill, and deletion failures render inside their own sections so one action cannot appear to fail another.

`Settings → birthday+gap draft → credential → persist → full Core rescan → durable balance/history`

Editing is draft-only until authenticated save. Height `0` is safest; a birthday after the first payment can omit history. Gap limits are bounded from 20 through 1,000.

## Coin privacy insight

`Coins → detect two or more UTXOs at one known address → mark each affected coin → optional linked-coin detail`

## Freeze or unfreeze a coin

`Coins → select Freeze or Unfreeze → confirm the named coin or selection → persist the new eligibility state → inline state + toast`

The confirmation explains only the practical effect: frozen coins cannot be selected for automatic or manual spending until unfrozen. It never shows the technical outpoint unless the user separately opens coin details.

Address reuse never blocks selection or spending. Every affected row inherits its immutable receive label and carries a compact amber reuse marker. Expanding that coin's details reveals its compact address/outpoint, explains the public link, and identifies the other linked coins by amount and shortened outpoint. Unknown or unavailable addresses are never treated as a reuse match.

## Notifications

- Broadcast: immediately after accepted broadcast, including updated balance.
- Payment received: first observation only, including updated balance.
- First confirmation: zero-to-one confirmation transition only, including updated balance.

The page/list is durable truth. Unique markers persist in Rust until explicitly acknowledged. Delivery is at-least-once across a crash before acknowledgement and consumers use stable IDs idempotently; background/resume scheduling remains a platform integration gate.

While an unlocked desktop session is open, a single ten-second foreground loop syncs only the selected wallet. Returning to the app wakes it immediately. The returned authoritative snapshot updates the current Overview, Activity, Coins, or Receive view, and durable notification markers produce the receipt/confirmation toast once. Sync and notification reads validate the five-minute session but never refresh its idle deadline; an expired session stops polling and returns to that wallet's unlock screen. Sync pauses on onboarding or lock and never overlaps a previous native sync. Fully terminated push/background execution remains a later platform gate.
### Add a single hardware signer

1. Choose **Use hardware signer**.
2. Initialize and unlock the device; select its hidden/passphrase wallet on-device if used.
3. Import over cable, or load/paste a public BIP84 descriptor/xpub export from SD/QR.
4. Satchel rejects private data and normalizes the test-chain account to `m/84'/1'/0'`.
5. Compare the master fingerprint with the device/export.
6. Name the wallet and set its independent Satchel app PIN.
7. To spend, review the PSBT, sign by exact-fingerprint USB or offline PSBT, then enter the app PIN to broadcast.

Passport Core uses QR or microSD. Trezor Model One host passphrase entry is unavailable; do not fall back to an empty passphrase.

### Configure Bitcoin Core

1. Open **Settings → Bitcoin Core node**.
2. Choose this machine (loopback), a trusted direct HTTPS endpoint, or an HTTP `.onion` endpoint through an explicit loopback SOCKS5 proxy.
3. Use the local regtest cookie or protected username/password fields; credentials in URLs are rejected.
4. Enter the selected wallet's app credential, then **Save & test**. Configuration and credentials are isolated per wallet.

## Sort coins

`Coins → compact sort control → newest/oldest, largest/smallest, or label A–Z/Z–A`

Newest source transaction is the default. Sorting is presentation-only and never changes selection, freeze state, labels, or spend eligibility. Date sorting leaves coins without a known source-transaction timestamp after dated coins.
