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

## 2. Local manual regtest

Terminal 1:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm regtest:start
```

Terminal 2:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
test_app_data="$(mktemp -d /tmp/satchel-regtest-native.XXXXXX)"
SATCHEL_REGTEST_APP_DATA_DIR="$test_app_data" \
SATCHEL_HWI_PATH=/opt/homebrew/bin/hwi \
bash scripts/dev/tauri-regtest.sh
```

Keep the generated path for the entire restart drill. Verify it begins with the canonical system temporary directory and `satchel-regtest-`; remove only that exact disposable directory after Groot exits. Never point the override at an existing application-data directory.

Run these stories in order:

1. Create a 24-word software wallet, record its credential offline, restart, unlock, then recover it into a second disposable profile.
2. Generate three differently labeled receive requests; inspect path/large QR, discard one unused request, fund another, mine, sync, and verify the used request cannot be discarded.
3. Freeze/unfreeze coins; compare automatic and exact coin selection; reject wrong-network and malformed recipients.
4. Send, reject a wrong PIN, sign with the correct PIN, broadcast, mine, restart, and inspect activity/details/notifications.
5. Create an unconfirmed replaceable payment, use **Increase fee**, review the changed fee, sign/broadcast, mine, and confirm only the replacement wins.
6. Create an unconfirmed payment with wallet change, use **Spend output (CPFP)**, review the child/package fee, sign/broadcast, mine, and confirm the package.
7. Create a 2-of-3 vault, export BSMS and Groot JSON, reconstruct the same first address from each, and complete a two-signer file/UR PSBT round trip.
8. Set a known recovery birthday and gap, perform full rescan, restart, and verify history/balance/labels. Repeat with a deliberately too-late birthday and confirm the documented omission warning.

## 3. Physical hardware matrix

Prepare a local report per model:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
mkdir -p hardware-certification.local
cp docs/hardware-certification-template.md hardware-certification.local/coldcard.md
cp docs/hardware-certification-template.md hardware-certification.local/trezor.md
cp docs/hardware-certification-template.md hardware-certification.local/ledger.md
cp docs/hardware-certification-template.md hardware-certification.local/bitbox02.md
cp docs/hardware-certification-template.md hardware-certification.local/jade.md
SATCHEL_HWI_PATH=/opt/homebrew/bin/hwi pnpm hardware:preflight
```

Follow [`hardware-certification.md`](hardware-certification.md) for each model. Keep reports local because fingerprints and paths are sensitive. A model is supported for release only after all required rows pass on the exact firmware/OS/package combination.

## 4. Remote Bitcoin Core over TLS

Use a dedicated least-privilege RPC user, a valid hostname certificate, firewall allow-list/VPN, and a disposable test-chain node. Avoid literal passwords in shell history:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
export SATCHEL_RPC_URL='https://node.example.test:8332'
export SATCHEL_RPC_USER='satchel-test'
read -s 'SATCHEL_RPC_PASSWORD?RPC password: '
export SATCHEL_RPC_PASSWORD
pnpm network:preflight
unset SATCHEL_RPC_PASSWORD SATCHEL_RPC_USER SATCHEL_RPC_URL
```

Then save the same endpoint per wallet in Settings, unlock, sync, compare genesis/network/tip with an independent Core client, and repeat with an invalid certificate, wrong chain, wrong password, timeout, and unreachable host. Every failure must be explicit and must not fall back.

## 5. Remote Bitcoin Core through Tor

Start and independently verify a loopback Tor SOCKS5 listener, then:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
export SATCHEL_RPC_URL='http://examplehiddenservice.onion:8332'
export SATCHEL_TOR_PROXY='127.0.0.1:9050'
export SATCHEL_RPC_USER='satchel-test'
read -s 'SATCHEL_RPC_PASSWORD?RPC password: '
export SATCHEL_RPC_PASSWORD
pnpm network:preflight
unset SATCHEL_RPC_PASSWORD SATCHEL_RPC_USER SATCHEL_RPC_URL SATCHEL_TOR_PROXY
```

Capture only pass/fail evidence. Verify proxy loss, invalid onion, wrong chain, wrong credentials, timeout, and that no direct DNS/network request occurs.

## 6. Reproducible unsigned desktop build

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

Resolve any mismatch before signing. Signing/notarization requires the release owner's Apple identity and protected credentials. Verify the resulting package with:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm release:verify:macos -- /absolute/path/to/Groot.app
```

## 7. Independent review

Give the reviewer the exact commit, threat model, ADRs, dependency locks, build evidence, hardware reports, remote-node evidence, and mainnet checklist. Findings need severity, affected invariant, reproduction, fix commit, regression test, and reviewer closure. The implementer must not self-approve this gate.
