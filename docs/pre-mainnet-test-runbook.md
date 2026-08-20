# Pre-mainnet test runbook

This runbook produces test evidence; it does not enable mainnet. Use disposable regtest, Signet, or Testnet4 funds and never paste secrets, xpubs, fingerprints, device paths, RPC passwords, addresses, or PSBTs into issues or commits.

## 1. Clean automated gate

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
corepack enable
corepack prepare pnpm@11.13.1 --activate
pnpm install --frozen-lockfile
pnpm validate
pnpm test:e2e
pnpm test:regtest
```

Rust must also pass directly:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let/src-tauri
cargo fmt --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked --all-features
```

### 1A. Security-review remediation acceptance

Run the locked Rust suite under every compiled test-network identity; none of these commands enables mainnet:

```sh
cd /absolute/path/to/groot/src-tauri
cargo test --locked --all-features
GROOT_BUILD_NETWORK=signet cargo test --locked --all-features
GROOT_BUILD_NETWORK=testnet4 cargo test --locked --all-features
```

Then perform these failure-first checks with disposable profiles and sanitized pass/fail notes only:

1. In both Signet and Testnet4 builds, create a v3 software wallet and a multisig wallet, restart, relocate a backup copy, unlock with the correct credential, and confirm a wrong credential remains `invalid_credential`. A secure-store filesystem denial must fail closed and normal lifecycle operations must never consult or create a platform keystore record.
2. Repeatedly enter a wrong credential for external-signer descriptor export. Confirm the same per-wallet `rate_limited` behavior used by unlock/signing, including after restart. While one process remains open, moving the wall clock backward must not shorten the retry delay. Do not treat repeated restart plus clock manipulation as closed; ADR 0028 records that residual.
3. Import a signed PSBT whose ECDSA signature byte has been altered without changing the unsigned transaction. Confirm `invalid_signature`, unchanged signature progress, and byte-identical persisted proposal state. Then import a valid signer PSBT and confirm normal progress/finalization.
4. Lock a saved multisig wallet and request its saved descriptor/cosigner metadata through the normal UI/command harness. Confirm the data is unavailable until that exact wallet is unlocked.
5. Inject a failure after each encrypted-profile creation path (software, external signer, standard multisig, recovery, BSMS, and Miniscript recovery). Confirm no partial profile directory remains. Run the final portable create/restart/relocate/restore/delete lifecycle against the signed macOS candidate before release and confirm wallet-secret operations never create, read, update, or delete a Keychain device-key item. Do not confuse platform-native TLS certificate trust with wallet-secret storage.
6. Inspect direct and Tor RPC failure paths with a disposable password under a debugger or memory tool appropriate to the signed platform. Confirm Groot-owned credential/request buffers have bounded lifetimes and are cleared; record third-party HTTP/TLS buffer behavior as the ADR 0028 residual rather than claiming guaranteed process-wide erasure.

The canonical finding-to-fix map is [`security-hardening-2026-08-12.md`](security-hardening-2026-08-12.md). Attach only sanitized command versions, pass/fail outcomes, exact commit identity, and reviewer sign-off to release evidence.

## 2. Local manual regtest

Terminal 1:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm regtest:start
```

Terminal 2:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
test_app_data="$(mktemp -d /tmp/groot-regtest-native.XXXXXX)"
GROOT_REGTEST_APP_DATA_DIR="$test_app_data" \
GROOT_HWI_PATH=/opt/homebrew/bin/hwi \
bash scripts/dev/tauri-regtest.sh
```

Keep the generated path for the entire restart drill. Verify it begins with the canonical system temporary directory and `groot-regtest-`; remove only that exact disposable directory after Groot exits. Never point the override at an existing application-data directory.

Run these stories in order:

1. Create a 24-word software wallet, record its credential offline, restart, unlock, then recover it into a second disposable profile.
2. Generate three differently labeled receive requests; inspect path/large QR, discard one unused request, fund another, mine, sync, and verify the used request cannot be discarded.
3. Freeze/unfreeze coins; compare automatic and exact coin selection; reject wrong-network and malformed recipients.
4. Send, reject a wrong PIN, sign with the correct PIN, broadcast, mine, restart, and inspect activity/details/notifications.
5. Create an unconfirmed replaceable payment, use **Increase fee**, review the changed fee, sign/broadcast, mine, and confirm only the replacement wins.
6. Create an unconfirmed payment with wallet change, use **Spend output (CPFP)**, review the child/package fee, sign/broadcast, mine, and confirm the package.
7. Create a 2-of-3 wallet, export BSMS and Groot JSON, reconstruct the same first address from each, and complete a two-signer file/UR PSBT round trip.
8. Set a known recovery birthday and gap, perform full rescan, restart, and verify history/balance/labels. Repeat with a deliberately too-late birthday and confirm the documented omission warning.

## 2A. Testnet4 portable storage and Core rehearsal

This is the next public-network rehearsal after the isolated Regtest stories pass. Use only disposable Testnet4 bitcoin. A locally ad-hoc-signed build is useful development evidence, but it is not the signed/notarized release-candidate evidence required by the mainnet checklist.

1. Confirm the intended Testnet4 Core instance is running and fully synchronized without placing its RPC password in shell history:

   ```sh
   read -s "RPCPASS?RPC password: "; echo
   print -r -- "$RPCPASS" | bitcoin-cli \
     -rpcconnect=127.0.0.1 \
     -rpcport=48332 \
     -rpcuser=groot-testnet4 \
     -stdinrpcpass \
     getblockchaininfo
   unset RPCPASS
   ```

   Require `chain: testnet4`, equal `blocks` and `headers`, `verificationprogress: 1`, and `initialblockdownload: false`. Confirm this is the intended existing node and data directory; do not start another node merely because the default `bitcoin-cli -testnet4` port or data directory differs.

   If the node enables `rpcwhitelist`, compare it with the exact least-privilege method list in [Public test-network rehearsal](public-network-rehearsal.md#prerequisites). Groot does not require the compatibility-only `getnetworkinfo` probe. A missing required method is an RPC-permission failure, not a bad password or an offline node.

2. Build the explicit Testnet4 app and verify its bundle identifier before opening it:

   ```sh
   pnpm build:native:testnet4
   pnpm release:verify:packaged-hwi -- \
     'src-tauri/target/release/bundle/macos/Groot Testnet4.app'
   /usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' \
     'src-tauri/target/release/bundle/macos/Groot Testnet4.app/Contents/Info.plist'
   ```

   The identifier must be `app.groot.wallet.testnet4`. The builder must package the reviewed HWI and the verifier must report the exact manifest digest, HWI 3.2.0, and matching pre-1.0 app version. Record the binary hash, commit, host OS, architecture, and whether the signature is ad hoc or release-grade.

3. Create a fresh disposable software wallet. Verify the 24-word native sheet is aligned and unobscured, complete backup confirmation, then quit and reopen the app. Unlock with the correct wallet passphrase and confirm that no Keychain or platform-keystore prompt appears.

4. Enter a wrong wallet passphrase once and require the stable invalid-credential message with the wallet still locked. Retry with the correct passphrase and require a successful unlock. Never record either value.

5. Connect the already-synchronized local node using **This Mac**, RPC URL `http://127.0.0.1:48332`, username/password authentication, RPC username `groot-testnet4`, the existing RPC password, and the selected wallet's wallet passphrase. These are two different credentials. Require a successful exact-Testnet4 chain check and ensure raw JSON-RPC or transport errors never appear in the UI.

6. Restart Groot and unlock the same wallet. Confirm the saved node route and RPC credentials decrypt from the portable wallet envelope, the node reconnects, and no Keychain prompt appears. Lock and unlock once more to exercise session cleanup.

7. Generate a permanently labeled receive address, send a small disposable Testnet4 amount from an independent source, sync, and record only sanitized pass/fail evidence for mempool arrival, confirmation, balance, label, and activity persistence after restart.

8. Send part of the received amount to an independently controlled Testnet4 address. Exercise a Core fee preset when available and a validated custom sat/vB rate when it is not. Verify recipient, amount, fee, change, network, and inputs from the authoritative review; sign, broadcast, confirm, restart, and reconcile activity and balance. Never commit addresses, transaction IDs, PSBTs, or RPC credentials.

9. Using a separate disposable application-data copy, test portable relocation: quit Groot, copy the complete owner-only encrypted profile, open it under the same Testnet4 build on the destination environment, and unlock with the correct credential. Confirm wrong-credential and ciphertext-corruption copies fail closed and that the source profile remains unchanged. Do not run two processes against the same application-data directory.

10. Repeat the create/restart/relocate/corrupt/delete lifecycle for an app-PIN profile such as a disposable external-signer or multisig wallet. Record environment and pass/fail results only. Real hardware signing and a two-device 2-of-3 Testnet4 spend belong to the physical matrix below.

## 3. Physical hardware matrix

Prepare a local report per model:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
mkdir -p hardware-certification.local
cp docs/hardware-certification-template.md hardware-certification.local/coldcard.md
cp docs/hardware-certification-template.md hardware-certification.local/trezor-model-one.md
cp docs/hardware-certification-template.md hardware-certification.local/ledger.md
cp docs/hardware-certification-template.md hardware-certification.local/bitbox02.md
cp docs/hardware-certification-template.md hardware-certification.local/bitbox02-nova.md
cp docs/hardware-certification-template.md hardware-certification.local/jade.md
GROOT_HWI_PATH=/opt/homebrew/bin/hwi pnpm hardware:preflight
```

Regtest deliberately permits this explicit developer path while collecting physical evidence. A macOS Signet/Testnet4 package must bundle the exact reviewed HWI through the release builder; users must not install HWI separately. The package and runtime verify its compiled digest, internal signature, and containing app seal and never fall back to Homebrew. External public-network Unix installations retain the pinned-digest and root-owned-path rule. Record the packaged digest with certification evidence. Windows remains fail-closed until an authenticated packaged boundary is implemented.

Follow [`hardware-certification.md`](hardware-certification.md) for each model. Keep reports local because fingerprints and paths are sensitive. A model is supported for release only after all required rows pass on the exact firmware/OS/package combination.

BitBox02 Nova begins as a separate certification record, not a pass/fail alias for BitBox02. HWI 3.2.0 desktop USB is enabled only to run that Regtest campaign; record sanitized exact-model enumeration, pairing, identity, address, registration, signing, health, negative, restart, recovery, and broadcast outcomes without inheriting original BitBox02 evidence. For release review, create a separate summary from [`hardware-certification-summary-template.md`](hardware-certification-summary-template.md) without fingerprints, device paths, addresses, xpubs, or PSBTs; the sensitive local report remains gitignored.

## 4. Remote Bitcoin Core over TLS

Use a dedicated least-privilege RPC user, a valid hostname certificate, firewall allow-list/VPN, and a disposable test-chain node. Avoid literal passwords in shell history:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
export GROOT_RPC_URL='https://node.example.test:8332'
export GROOT_RPC_USER='groot-test'
export GROOT_EXPECTED_CHAIN='regtest'
read -s 'GROOT_RPC_PASSWORD?RPC password: '
export GROOT_RPC_PASSWORD
pnpm network:preflight
unset GROOT_RPC_PASSWORD GROOT_RPC_USER GROOT_RPC_URL GROOT_EXPECTED_CHAIN
```

Then save the same endpoint per wallet in Settings, unlock, sync, compare genesis/network/tip with an independent Core client, and repeat with an invalid certificate, wrong chain, wrong password, timeout, and unreachable host. Every failure must be explicit and must not fall back.

## 5. Remote Bitcoin Core through Tor

Start and independently verify a loopback Tor SOCKS5 listener, then:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
export GROOT_RPC_URL='http://examplehiddenservice.onion:8332'
export GROOT_TOR_PROXY='127.0.0.1:9050'
export GROOT_RPC_USER='groot-test'
export GROOT_EXPECTED_CHAIN='regtest'
read -s 'GROOT_RPC_PASSWORD?RPC password: '
export GROOT_RPC_PASSWORD
pnpm network:preflight
unset GROOT_RPC_PASSWORD GROOT_RPC_USER GROOT_RPC_URL GROOT_TOR_PROXY GROOT_EXPECTED_CHAIN
```

The preflight places authentication in an owner-only temporary curl configuration rather than the process argument list, requires the expected chain explicitly, caps time and response size, and accepts only a numeric loopback proxy plus a 56-character v3 onion. Capture only pass/fail evidence. Verify proxy loss, invalid onion, wrong chain, wrong credentials, timeout, and that no direct DNS/network request occurs.

## 6. Reproducible unsigned desktop build

Before building, verify the deterministic target dependency inventory:

```bash
pnpm test:sbom
```

The unsigned build emits `groot.cdx.json`, records the exact compiler, CLI, target, OS, SDK, network, commit, epoch, and lockfile identities in `BUILD-INFO`, and includes both the binary and SBOM in `SHA256SUMS`. The SBOM represents packages installed/resolved for that build target; packages locked only for other targets remain visible through the recorded lock count and appear when generated on those targets.

Run on two clean machines with the pinned Node, pnpm, Rust toolchain, target, OS, Xcode/SDK and dependency lockfiles:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm release:unsigned
```

Transfer only the two output directories to one verification machine, then:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm release:compare -- /absolute/path/to/build-a /absolute/path/to/build-b
```

The comparator rejects symlinks, unexpected or missing files, stale recorded digests, different build environments, different SBOMs, and different binaries. Resolve any mismatch before signing. `pnpm release:test:compare` exercises those fail-closed boundaries without producing a release. Signing/notarization requires the release owner's Apple identity and protected credentials. Verify the resulting package with:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm release:verify:macos -- /absolute/path/to/Groot.app
```

## 7. Independent review

Give the reviewer the exact commit, threat model, ADRs, dependency locks, build evidence, hardware reports, remote-node evidence, and mainnet checklist. Findings need severity, affected invariant, reproduction, fix commit, regression test, and reviewer closure. The implementer must not self-approve this gate.
