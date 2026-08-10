# Groot rename audit

Status: complete for the 2026-08-10 adoption. ADR 0023 owns the lasting compatibility decision.

## Rename to Groot

The public name is Groot across:

- Tauri product metadata, native window and camera-permission copy, Rust package/build artifacts, and JavaScript package metadata;
- wallet navigation, onboarding, unlock, settings, send/receive, hardware guidance, dialogs, notifications, accessibility labels, printable backups, and exported filenames;
- desktop, iOS, Android, favicon, web-manifest, marketing navigation, SEO/Open Graph/Twitter metadata, machine-readable marketing summaries, and Playwright fixtures;
- current canonical product, architecture, security, design, marketing, testing, release, and operator documentation.

The approved Control icon sources and outlined Groot/Newsreader lockups in `assets/brand/` are canonical. Generated platform raster assets derive from `app-icon-legacy-source.svg`; the modern unmasked source remains `app-icon-layered-source.svg`.

## Retain for compatibility and migration

These values remain unchanged so an upgrade opens and unlocks the same wallets and preserves local preferences:

| Identifier | Compatibility role |
| --- | --- |
| `app.satchel.wallet` | Tauri bundle identifier and operating-system app-data container |
| `app.satchel.wallet.device-wrap.v1` | Apple Keychain service |
| `wallet:<uuid>` | Apple Keychain account |
| `wallet-registry.json`, `wallets/<uuid>` | Registry and profile layout |
| `regtest-wallet`, `regtest-multisig` | Legacy profile migration sources |
| `wallet.sqlite`, `secret.json`, `node-secret.json`, `device.wrap` | Persisted wallet and secret paths |
| `satchel_notifications`, `satchel_notification_state` | Existing SQLite tables |
| `satchel-external-signer:*`, `satchel-multisig:*` | Existing authenticated verifier payloads |
| `satchel-theme`, `satchel-language`, `satchel-discreet-mode` | Existing browser preference keys |
| `SATCHEL_REGTEST_APP_DATA_DIR` and other `SATCHEL_*` variables | Established build, acceptance, hardware, and regtest interfaces |
| `satchel-regtest-*`, `satchel-dev`, `.satchel-funded` | Disposable native-test and Bitcoin Core fixture names |

Envelope versions, KDF parameters, authenticated fields, wallet UUIDs, database locations, and secret-loading behavior are unchanged. No credential, seed, descriptor, address, fingerprint, xpub, PSBT, or device path is migrated or logged.

## Retain as historical or technical identity

- Accepted ADRs before ADR 0023 retain the product name used when the decision was recorded; ADRs are append-only.
- Dated security reviews, execution evidence, and audits retain their original wording so evidence is not rewritten after the fact.
- Internal test temporary filenames and database table names may retain `satchel` when they are non-user-facing and changing them adds no product value.
- The old name may appear in current documentation only while explaining one of the compatibility identifiers above.

The automated `pnpm test:brand` gate rejects `Satchel` from current UI, E2E, static marketing, and platform-metadata surfaces while asserting that the bundle and Keychain identifiers remain unchanged.
