# Groot

A non-custodial onchain Bitcoin wallet and multisig coordinator built with SvelteKit, Tauri, Rust and BDK. Wallet keys and signing stay in Rust; hardware keys stay on their devices.

## Download

[Public v0.5.1](https://github.com/grootwallet/groot/releases/tag/v0.5.1) is for macOS Apple silicon. Its Mainnet authorization applies to exact commit `c731fa1c`, not later development builds. The current feedback branch contains internal `5.2.0-rc02` changes; it is not a public release.

Download the DMG, open it, and drag Groot into Applications. The release is Developer ID signed, notarized and stapled. Verify a downloaded installer with the [GitHub CLI](https://cli.github.com/):

```sh
gh release verify v0.5.1 -R grootwallet/groot
gh release verify-asset v0.5.1 Groot-0.5.1-macos-arm64.dmg -R grootwallet/groot
```

[Signing and source verification](docs/release-git-tag-signing.md) explains the separate Git-tag, Apple and release-attestation trust boundaries. Checksums alone do not authenticate a download.

## Develop

Use Node **24.19.0**, pnpm **11.13.1**, Rust **1.97.1**, and the committed lockfiles.

```sh
pnpm install --frozen-lockfile
pnpm regtest:start
pnpm dev:native:regtest
```

Bitcoin Core must be installed. Regtest uses isolated local test data; Core's `groot-dev` wallet is the faucet, not a Groot wallet. [Manual acceptance](docs/manual-regtest-test-plan.md) covers funding, sending and recovery.

For UI-only exploration, run `pnpm dev:regtest` and open `http://127.0.0.1:5188`. This is a deterministic browser prototype, not a real wallet. Never enter recovery words or use it for funds.

Run `pnpm validate` before handoff. Rust changes also require strict formatting, Clippy and tests. The [maintainer harness](docs/agent-harness.md) owns the exact commands and extended checks.

## Documentation

| Need                                    | Read                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Product behavior and supported features | [Product](docs/product-spec.md) · [Current status](docs/implementation-status.md)                                  |
| Code boundaries and contribution rules  | [Architecture](docs/architecture.md) · [AGENTS.md](AGENTS.md)                                                      |
| UI behavior and reusable components     | [Flows](docs/flows.md) · [Design system](docs/design-system.md)                                                    |
| Security and release evidence           | [Security](SECURITY.md) · [Mainnet checklist](docs/mainnet-release-checklist.md)                                   |
| Standards and future work               | [BIP support](docs/bip-support.md) · [Roadmap](docs/roadmap.md) · [Code cleanup plan](docs/engineering-roadmap.md) |

Historical decisions live in [ADRs](docs/adr/). Read relevant decisions, not the entire archive. Exact-device certification and dated security/release records are evidence, not current feature specifications.

## License and repository boundary

[Apache-2.0](LICENSE); [NOTICE](NOTICE), [third-party notices](THIRD_PARTY_NOTICES.md), and [contribution terms](CONTRIBUTING.md) apply. The license does not grant rights to Groot's marks.

This repository contains the wallet. Marketing code, public-site copy, screenshots, SEO and deployment belong only in [groot-site](https://github.com/thibistaken/groot-site).
