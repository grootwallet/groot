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

1. In both Signet and Testnet4 builds, create a v2 software wallet and a multisig wallet, restart, unlock with the correct credential, and confirm a wrong credential remains `invalid_credential`. A secure-store denial must fail closed and must never consult or create a Regtest legacy key.
2. Repeatedly enter a wrong credential for external-signer descriptor export. Confirm the same per-wallet `rate_limited` behavior used by unlock/signing, including after restart. While one process remains open, moving the wall clock backward must not shorten the retry delay. Do not treat repeated restart plus clock manipulation as closed; ADR 0028 records that residual.
3. Import a signed PSBT whose ECDSA signature byte has been altered without changing the unsigned transaction. Confirm `invalid_signature`, unchanged signature progress, and byte-identical persisted proposal state. Then import a valid signer PSBT and confirm normal progress/finalization.
4. Lock a saved multisig wallet and request its saved descriptor/cosigner metadata through the normal UI/command harness. Confirm the data is unavailable until that exact wallet is unlocked.
5. Inject a failure after each UUID device-key creation path (software, external signer, standard multisig, recovery, BSMS, and Miniscript recovery). Confirm neither the partial profile directory nor UUID-scoped secure-store item remains. Run the final lifecycle against the signed macOS candidate before release.
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

Regtest deliberately permits this explicit developer path while collecting physical evidence. A Signet/Testnet4 release build must also set `GROOT_HWI_SHA256` to the reviewed executable's exact 64-character SHA-256 value and install it under root-owned, non-group/world-writable path ancestry; otherwise HWI fails closed. Record that digest with the certification evidence. Windows remains fail-closed until Authenticode identity verification is implemented.

Follow [`hardware-certification.md`](hardware-certification.md) for each model. Keep reports local because fingerprints and paths are sensitive. A model is supported for release only after all required rows pass on the exact firmware/OS/package combination.

BitBox02 Nova begins as a discovery record, not a pass/fail alias for BitBox02. Record only sanitized capability outcomes until its real HWI identity and pairing behavior are implemented. For release review, create a separate summary from [`hardware-certification-summary-template.md`](hardware-certification-summary-template.md) without fingerprints, device paths, addresses, xpubs, or PSBTs; the sensitive local report remains gitignored.

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
