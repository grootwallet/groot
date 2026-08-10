# ADR 0023: Groot brand adoption with stable wallet identifiers

- Status: accepted
- Date: 2026-08-10

## Context

The product is adopting the public name **Groot** and its approved Control-mark identity. Existing Satchel installations already derive their application-data location and Apple Keychain access from technical identifiers containing `satchel`. Renaming those identifiers would make an in-place upgrade appear empty or unable to decrypt an existing wallet unless a cross-platform migration succeeded atomically.

## Decision

- All user-facing product names, application metadata, window titles, marketing surfaces, accessibility copy, exports, tests, and current documentation use **Groot**.
- The Tauri bundle identifier remains `app.satchel.wallet`. It continues to select the established operating-system application-data container.
- The Apple Keychain service remains `app.satchel.wallet.device-wrap.v1`, and wallet accounts remain `wallet:<uuid>`.
- Existing storage names remain stable: `wallet-registry.json`, `wallets/<uuid>`, the legacy `regtest-wallet` and `regtest-multisig` migration sources, `wallet.sqlite`, `secret.json`, `node-secret.json`, `device.wrap`, and existing `satchel_*` SQLite tables.
- Existing encrypted-envelope versions, KDF parameters, authenticated fields, and secret-loading behavior do not change as part of the brand adoption.
- Established developer and regtest compatibility identifiers such as `SATCHEL_*`, `satchel-dev`, and disposable `satchel-regtest-*` paths remain supported. They are technical identifiers, not public branding.
- Historical ADRs and dated evidence retain the name used when they were written. Current canonical documents refer to the product as Groot and point here when compatibility names appear.

## Consequences

An upgrade changes the visible product name and icon while opening the same wallet registry, databases, and secure-store records. No secret migration is required, so a branding failure cannot strand wallet data. A future identifier cleanup requires a separate ADR, platform-specific atomic migration and rollback tests, and proof that every existing wallet remains unlockable. Mainnet remains disabled under ADR 0012.
