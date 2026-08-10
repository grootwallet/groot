# ADR 0024: Adopt the Groot technical namespace before distribution

- Status: accepted
- Date: 2026-08-10
- Supersedes: ADR 0023 identifier-compatibility decision

## Context

ADR 0023 retained Satchel-derived identifiers because changing an installed wallet's bundle identity, application-data container, secure-store namespace, database schema, or authenticated marker could strand existing data. The project has not shipped a production build, no current wallet data must survive, and all development remains regtest-only. Carrying an unused legacy namespace into the first distributed build would establish avoidable long-term compatibility obligations.

## Decision

- Groot uses `app.groot.wallet` as its Tauri, desktop, iOS, and Android application identifier.
- Apple secure storage uses service `app.groot.wallet.device-wrap.v1`; wallet accounts remain the non-branded stable form `wallet:<uuid>`.
- Browser preferences use `groot-*`, developer and regtest interfaces use `GROOT_*`, disposable native profiles use `groot-regtest-*`, and the Bitcoin Core faucet/miner wallet is `groot-dev`.
- Groot-owned SQLite tables, authenticated external-signer and multisig markers, temporary names, and test identifiers use the Groot namespace.
- Generic persisted formats and paths remain descriptive rather than branded: `wallet-registry.json`, `wallets/<uuid>`, `wallet.sqlite`, `secret.json`, `node-secret.json`, and `device.wrap`.
- This is a pre-release cutover, not a migration. Existing development wallets and browser preferences are disposable and are not discovered, copied, decrypted, rewritten, or deleted by Groot.
- Historical ADRs and dated evidence retain the terminology and identifiers that were true when recorded.

## Consequences

The first distributed builds establish only the Groot application and secure-storage identity. Developers must recreate regtest wallets and local preferences after the cutover. No compatibility reader, cross-container access, secret migration, or downgrade path is added, keeping the Rust/webview secret boundary unchanged. Mainnet remains disabled under ADR 0012.
