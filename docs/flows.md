# Wallet and coordinator flows

This document describes user-visible state transitions. The product specification owns behavior; Rust owns wallet truth; these flows own presentation and navigation.

## Single-key onboarding

`welcome → choose create → native recovery-word backup → credential → created → overview`

- Create uses 24 BIP39 words and one credential as BIP39 passphrase plus app unlock/signing PIN.
- Recover requires exactly 24 words and the original credential.
- Generated words stay in a zeroized Rust pending session and are acknowledged in a platform-native sheet attached to Satchel. Browser fixture words exist only for deterministic UI testing.
- Failure stays on the current step with an inline error. A successful operation clears credential/recovery input before navigation.
- When any wallet already exists, every add-wallet step has a close action that returns to the selected wallet without consuming the pending onboarding session.

## Multiple wallets

`current wallet → Add wallet → create/recover → selected and unlocked`

`wallet selector → choose profile → clear unlocked state → unlock selected profile → kind-appropriate home`

Each profile owns a UUID-isolated directory. Switching never reuses the prior wallet's unlocked state. Deleting the selected profile chooses another remaining profile and returns to unlock, or returns to onboarding if no wallets remain.

## Unlock and deletion

`locked → select wallet → credential check in Rust → wallet` or `invalid_credential → locked`

The locked screen names the selected profile, can switch profiles without carrying credential state, and can return to the wallet chooser. Passphrase/PIN fields across onboarding, unlock, signing, descriptor export, recovery, and deletion have explicit show/hide controls.

`settings → delete warning → credential + type DELETE → Rust verification/deletion → unlock next wallet / welcome`

For a selected locked disposable regtest wallet: `locked → delete warning → type RESET REGTEST → Rust deletion → next wallet or welcome`. This works for either profile kind and is unavailable on public networks.

Deletion is device-local. It never implies that transaction history disappeared from Bitcoin. Multisig deletion additionally requires an in-session successful recovery drill for the exact current descriptor, the wallet PIN, and its exact name.

## Receive

`no awaiting address → mandatory permanent label → atomic reveal+label → QR/copy`

Any number of unused addresses may await payment concurrently. Each may transition independently to `discarded` and remains monitored. Any observed payment transitions that address to `used`, after which discard is impossible.

## Single-key send

`recipient+amount+fee → persist Rust PSBT → authoritative review → credential → sign+broadcast → durable success`

The review is derived from the persisted PSBT. A wrong credential clears the field and leaves the reviewed proposal available for retry. Restart reloads the exact proposal; it does not rebuild transaction intent from UI fields. Broadcast emits a toast and returns an updated snapshot.

## Multisig setup

`name+recipe or advanced M-of-N → add 3–7 cosigners → Rust validation/descriptor preview → descriptor backup acknowledgment+app PIN → persisted coordinator`

Cosigner import paths:

- Desktop USB: Rust invokes Bitcoin Core HWI, enumerates a device, and requests the fixed BIP48 test-network account xpub.
- QR/file/manual: portable public origin, fingerprint, and account xpub import. Private material is rejected.
- Virtual device: deterministic browser/CI fixture only; it must be visibly identified as a test device.

Selecting a saved cosigner opens public device details. For USB/virtual sources, **Run health check** enumerates devices through `WalletPort` and passes only when a connected device has the saved fingerprint. QR/file/manual sources can only validate that the saved public fingerprint, account path, and xpub record are complete; the result explicitly says physical presence was not checked. The latest result and timestamp are presentation state for the current app session, not a durable certification record.

The default recipe is 2-of-3; 3-of-5 is the larger-group recipe. Advanced mode permits 2 ≤ M ≤ N with 3 ≤ N ≤ 7. 1-of-N is excluded because it has no multisig theft protection. Duplicate fingerprints/xpubs, invalid origins, invalid test-network keys, private descriptors, and unsafe thresholds block review. Creation stores checksummed public descriptors, public cosigner metadata, a watch-only BDK database, and an encrypted app-PIN marker.

## Multisig payment target flow

This flow is implemented for regtest; see `docs/implementation-status.md` for certification limits.

`payment details → persisted unsigned PSBT → review → collect any k signatures → Miniscript satisfaction/finalization → broadcast`

Each cosigner is `ready`, `awaiting`, `signing`, `signed`, `rejected`, or `unavailable`. USB, QR, and file signatures converge on one Rust PSBT merge function. Imported data must match the proposal's unsigned transaction and descriptor identity. The app PIN unlocks coordinator data; it never substitutes for a hardware signature.

## Notifications

- Broadcast: immediately after accepted broadcast, including updated balance.
- Payment received: first observation only, including updated balance.
- First confirmation: zero-to-one confirmation transition only, including updated balance.

The page/list is durable truth. Unique markers persist in Rust until explicitly acknowledged. Delivery is at-least-once across a crash before acknowledgement and consumers use stable IDs idempotently; background/resume scheduling remains a platform integration gate.
