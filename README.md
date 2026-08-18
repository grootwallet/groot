# Groot

A minimal onchain Bitcoin wallet and descriptor multisig coordinator built with SvelteKit, Tauri v2, BDK, and Miniscript. The native app currently targets local regtest: BDK owns Groot's wallet databases, while Bitcoin Core's `groot-dev` wallet is only the faucet and miner.

## Repository boundary

This repository, [`thibistaken/groot`](https://github.com/thibistaken/groot), is the wallet application: native desktop/mobile through Tauri plus the browser-based wallet prototype. It does not contain the marketing website.

The public marketing website lives only in [`thibistaken/groot-site`](https://github.com/thibistaken/groot-site). That repository is canonical for marketing code, copy, screenshots, SEO metadata, and Vercel deployment. Product behavior and security evidence remain canonical here.

## Run the functional regtest wallet

```sh
pnpm install
pnpm regtest:start
bash scripts/dev/tauri-regtest.sh
```

Create a wallet in the native window and keep the 24 words and passphrase / PIN. Generate a labeled receive address, then fund it from Bitcoin Core using the amount in BTC:

Generated recovery words appear in a compact platform-native backup sheet attached to Groot. On macOS they use an 8×3 monospaced grid and never enter the Svelte webview. Existing regtest wallets are migrated on first launch into the UUID wallet registry and their version-1 secret envelope is upgraded only after a correct unlock.

```sh
pnpm regtest:send -- bcrt1q... 1.25 --mine
```

Press **Sync** in Groot. To test an outgoing payment, create a destination owned by the Core faucet wallet:

```sh
bitcoin-cli -regtest -datadir="$PWD/.regtest" -rpcwallet=groot-dev getnewaddress "Groot send test" bech32
```

Paste that `bcrt1…` address into Groot, enter an amount in sats, choose a fee, review, enter the wallet passphrase / PIN, and broadcast. Mine its first confirmation with `pnpm regtest:mine`, then sync again.

The browser-only command `pnpm dev:regtest` intentionally uses the dummy adapter because browser JavaScript cannot access the Rust key boundary. Use `bash scripts/dev/tauri-regtest.sh` for the functional wallet. The launcher selects Groot's pinned Node and pnpm runtime before starting Tauri, including its nested Vite process.

## Explore every UI flow immediately

The browser adapter opens with deterministic transactions, receive addresses, coins, and a funded 2-of-3 `Family vault`. It is the fastest way to inspect receive replacement, QR enlargement, derivation details, coin selection, freeze/unfreeze, single-key and multisig sending, themes, and coordinator templates without waiting for blocks. Fixture addresses always follow the configured network:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm install
pnpm dev:regtest
```

Open `http://127.0.0.1:5188`. Groot uses a strict loopback port so Vite cannot silently switch to another application. The dummy signing credential is `prototype-passphrase`. This mode proves UI orchestration only; use the Tauri regtest commands above for BDK, signing, persistence, and broadcast.

The complete click-by-click acceptance stories are in [the manual regtest test plan](docs/manual-regtest-test-plan.md).

The static web demo is intentionally marked **Interactive prototype** on every screen. It always uses deterministic dummy data, virtual signers, and regtest-format addresses. Never enter real recovery words or use it for real funds. `vercel.json` pins the hosted build to this regtest prototype mode; the native BDK/Rust adapter is available only inside Tauri.

## Try the multisig coordinator

Open **Vault → Create multisig wallet**. V1 uses BIP48 test-network account keys at `m/48'/1'/0'/2'` and Rust builds canonical checksummed `wsh(sortedmulti(...))` receive/change descriptors. A 2-of-3 policy is recommended.

Manual public-key entry works everywhere. Desktop hardware import additionally requires [Bitcoin Core HWI](https://github.com/bitcoin-core/HWI) at a trusted absolute installation path (`/opt/homebrew/bin/hwi`, `/usr/local/bin/hwi`, or `/usr/bin/hwi`), or an absolute `GROOT_HWI_PATH` supplied when compiling Groot. Groot never searches ambient `PATH`. Connect and unlock one supported device, open its Bitcoin app, then choose **Add a cosigner → Connect hardware device**. Seed words and private keys must never be entered into Groot's coordinator.

The coordinator setup, policy validation, HWI xpub import, descriptor persistence, watch-only BDK database, PSBT signing, sync, balance, labeled receive, and immediate-path broadcast flows are implemented. Guided recovery and inheritance templates compile and persist real Miniscript descriptors; coordinator-assisted spending through the delayed path remains a V2 gate. Consult [implementation status](docs/implementation-status.md) before treating a UI surface as production-ready.

## Run local Bitcoin regtest

Install Bitcoin Core if needed (`brew install bitcoin` on macOS), then:

```sh
pnpm regtest:start
pnpm regtest:status
```

`regtest:start` uses only `./.regtest`, creates a descriptor wallet named `groot-dev`, and mines 101 blocks so its first coinbase output is spendable.

Useful commands:

```sh
# Mine one block, or an explicit number
pnpm regtest:mine
pnpm regtest:mine -- 10

# Send BTC from groot-dev to a regtest address
pnpm regtest:send -- bcrt1q... 1.25

# Send and immediately mine one confirmation
pnpm regtest:send -- bcrt1q... 1.25 --mine

# Raw RPC access
bitcoin-cli -regtest -datadir="$PWD/.regtest" getblockchaininfo
bitcoin-cli -regtest -datadir="$PWD/.regtest" -rpcwallet=groot-dev getbalances

# Stop without deleting the chain or wallet
pnpm regtest:stop
```

Regtest state persists in `./.regtest/` and is gitignored.

Groot wallet state is stored in the operating system app-data directory under `app.groot.wallet/wallets/<wallet-uuid>`, with `wallet-registry.json` selecting the active profile. Use **Settings → Delete wallet** to remove only the selected profile; deleting `.regtest/` does not delete Groot wallets.

## Validate

```sh
pnpm validate
pnpm test:release-gate
pnpm test:boundaries
pnpm test:coverage
pnpm test:coverage:rust
pnpm test:coverage:rust:all
pnpm test:e2e
# or both:
pnpm test:full

cd src-tauri
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
```

Before connecting a physical signer, run `pnpm hardware:preflight` and follow the evidence matrix in [hardware certification](docs/hardware-certification.md). Mainnet is intentionally disabled. Enabling it requires every item in the [mainnet release checklist](docs/mainnet-release-checklist.md), the [threat model](docs/mainnet-threat-model.md), and ADR 0012 to be resolved and independently reviewed.

## Documentation map

- [Product behavior](docs/product-spec.md)
- [Architecture and trust boundaries](docs/architecture.md)
- [Flow state machines](docs/flows.md)
- [Design system](docs/design-system.md)
- [Security model and release blockers](docs/security-model.md)
- [Implementation status](docs/implementation-status.md)
- [V1 and V2 roadmap](docs/roadmap.md)
- [Commercial product strategy](docs/commercial-product-strategy.md)
- [Issue-level product backlog](docs/product-backlog.md)
- [Encrypted remote signer coordination roadmap](docs/remote-signer-coordination-roadmap.md)
- [Recovery, inheritance, and assurance roadmap](docs/recovery-assurance-roadmap.md)
- [Testing strategy](docs/testing.md)
- [Latest code-health audit](docs/code-health-audit-2026-08-09.md)
- [Engineering and AI contribution standards](docs/engineering-standards.md)
- [Hardware certification](docs/hardware-certification.md)
- [Mainnet release checklist](docs/mainnet-release-checklist.md)
- [Latest full internal security review](docs/security-review-2026-08-05.md)
- [Manual regtest acceptance](docs/manual-regtest-test-plan.md)
- [Architectural decisions](docs/adr/)

Agents and contributors should start with [AGENTS.md](AGENTS.md). Code and canonical documentation must change together.
