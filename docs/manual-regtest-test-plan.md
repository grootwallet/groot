# Manual regtest acceptance plan

This plan is ordered from the fastest UI proof to the real Rust/BDK/Bitcoin Core boundary. Browser fixture success proves presentation and orchestration only. Native regtest success proves wallet persistence, BDK transaction construction, signing, and Core broadcast.

## 0. Automated acceptance first

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm install
pnpm validate
pnpm test:coverage
pnpm test:coverage:rust
pnpm test:e2e
```

Expected: TypeScript checks/build pass, policy coverage is 100%, the enforced Rust security core passes its thresholds, and all Playwright desktop/mobile cases pass.

Run the real isolated multisig PSBT integration:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm test:regtest
```

## 1. Browser prototype setup

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm dev:regtest
```

Open `http://127.0.0.1:5188`. Use `prototype-passphrase` anywhere the prototype asks for a passphrase/PIN.

### Story A — inspect both themes and empty states

1. Open Settings and switch between Light and Dark.
2. Open Overview, Activity, Coins, Receive, Send, Vault, and Settings.
3. Confirm text remains readable and no page scrolls horizontally on a narrow/mobile window.
4. Open `http://127.0.0.1:5188/activity?fixture-empty-activity=1` and confirm “No transactions yet.”

### Story B — Receive to single-key Send

1. Open Receive.
2. Copy the current awaiting address.
3. Open Send and paste it into Bitcoin address.
4. Confirm no network error appears.
5. Enter `25000` sats, review, and verify recipient, fee, and total.
6. Continue, enter `prototype-passphrase`, and broadcast.
7. Confirm the durable success screen, transaction ID, one broadcast toast, and reduced balance.

### Story C — labeled receive privacy

1. Open Receive and create two addresses with different permanent labels.
2. Enlarge each QR and reveal its derivation details.
3. Discard one awaiting address.
4. Confirm the other remains active and the discarded address remains in history.
5. Confirm the used address cannot be discarded.

### Story D — coins and exact-input Send

1. Open Coins and select an unfrozen coin.
2. Freeze it and confirm it cannot be selected for spending.
3. Unfreeze it, select it, and choose Send selected coins.
4. Confirm Send shows Manual selection and the correct selected total.
5. Return to Automatic selection and confirm frozen coins remain excluded.

### Story E — ready-made multisig spend

1. Open Vault. The pre-created wallet is `Family vault`, 2-of-3, with 2,481,240 fixture sats.
2. Confirm Coldcard, Trezor, and Offline backup cosigners are visible.
3. Select Coldcard, inspect its fingerprint/path/source, run its health check, and confirm the connected fingerprint matches.
4. Select Offline backup, run its check, and confirm Satchel explicitly says physical presence was not checked.
5. Choose Send and enter any displayed `bcrt1…` Receive address plus `50000` sats.
6. Review the authoritative amount, fee, and total.
7. Choose Sign with device twice and select Virtual Coldcard each time. The deterministic transport adds the next independent fixture signature.
8. Confirm progress reaches 2 of 2.
9. Enter `prototype-passphrase`, finalize, and broadcast.
10. Confirm one broadcast success toast, transaction ID, and balance 2,429,700 sats.

### Story F — build a new multisig policy

1. Open Vault → Create multisig wallet.
2. Compare recommended 2-of-3, 3-of-5, Recovery, and Inheritance recipes.
3. Choose Custom and verify M can be 2 through N and N can be 3 through 7.
4. Confirm 1-of-N is unavailable.
5. Add unique public fixture keys, inspect descriptor logic, acknowledge backup, and create with a test PIN.

Stop the browser prototype with `Ctrl+C` in its terminal.

## 2. Native single-key Rust/BDK flow

Start the isolated Core node:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm regtest:start
pnpm regtest:status
```

Start the native Tauri wallet in another terminal:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm tauri dev
```

### Story G — create, fund, sync, and receive notification

1. Create a native wallet, record its 24 words offline, and choose a unique passphrase/PIN.
2. Create a labeled Receive address and copy it.
3. Fund and confirm it:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm regtest:send -- bcrt1YOUR_SATCHEL_ADDRESS 1.25 --mine
```

4. Sync Satchel. Confirm balance, received transaction, label, UTXO, and first-confirmation state.

### Story H — real BDK send and Core acceptance

Create a Core-owned destination:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
bitcoin-cli -regtest -datadir="$PWD/.regtest" -rpcwallet=satchel-dev getnewaddress "Satchel send acceptance" bech32
```

1. Paste the returned address into Satchel Send.
2. Enter an amount in integer sats, choose a fee, and review.
3. Try a wrong PIN and confirm the proposal remains retryable.
4. Enter the correct PIN and broadcast.
5. Confirm Core sees the transaction:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
bitcoin-cli -regtest -datadir="$PWD/.regtest" getrawmempool
```

6. Mine and sync:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm regtest:mine
```

7. Confirm the first confirmation notification appears once.

### Story I — restart, recovery, and deletion

1. Close and reopen Satchel; unlock with the same passphrase/PIN.
2. Switch between any wallet profiles and confirm each requires its own credential.
3. Recover a test wallet from exactly 24 words plus its original passphrase.
4. Delete only the selected disposable wallet through Settings.
5. On a locked disposable regtest profile, verify `RESET REGTEST` is required exactly.

## 3. Physical desktop HWI acceptance

Check the external transport before opening Satchel:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
hwi --version
hwi enumerate
```

For each available Coldcard, Trezor, Ledger, or BitBox02, record model, firmware, HWI version, and host OS. In Vault setup, verify enumeration, fingerprint, BIP48 account xpub import, device reconnect, address display where supported, user rejection, signing, wrong-device rejection, and changed-PSBT rejection. A passing virtual-device run is not physical certification.

## 4. Cleanup

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm regtest:stop
```

Regtest chain state remains under `.regtest/`. Satchel profiles remain in the operating-system app-data directory until deleted through the wallet UI.
