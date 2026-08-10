# Groot rename audit

Status: complete for the 2026-08-10 brand and pre-release technical-namespace adoption. ADR 0024 supersedes ADR 0023's temporary compatibility decision.

## Renamed to Groot

The Groot name and approved Control icon identity now cover:

- visible product copy, navigation, onboarding, settings, dialogs, notifications, accessibility labels, exports, marketing, SEO metadata, manifests, and platform icon assets;
- Tauri product metadata, native main-binary display name, window title, bundle/application identifier, application-data container, Apple secure-store service, installers, and platform application bundles;
- browser preference keys, developer and regtest environment variables, disposable profile paths, Bitcoin Core faucet fixtures, SQLite tables, authenticated verifier markers, temporary files, tests, and current operator documentation.

The approved sources in `assets/brand/` remain canonical. Desktop raster assets derive from `app-icon-legacy-source.svg`; iOS raster assets derive from the unmasked `app-icon-layered-source.svg`, with separate Apple composition layers in `app-icon-layers/`.

## Retained as stable, non-branded identifiers

These values are descriptive formats rather than legacy brand names and remain unchanged:

| Identifier | Role |
| --- | --- |
| `groot`, `groot_lib`, `groot-wallet` | Lowercase Rust package/library and npm package identifiers; the Cargo executable, installed application, bundle, and process display as `Groot` |
| `release-artifacts/<commit>/Groot` | Raw reproducible-build evidence binary, capitalized consistently with the platform application bundle |
| `wallet:<uuid>` | Apple secure-store account |
| `wallet-registry.json`, `wallets/<uuid>` | Registry and isolated profile layout |
| `regtest-wallet`, `regtest-multisig` | Generic pre-registry development profile locations |
| `wallet.sqlite`, `secret.json`, `node-secret.json`, `device.wrap` | Wallet database and encrypted-secret paths |
| Envelope versions, KDF parameters, DTO field names | Stable security and serialization formats |

No credential, seed, descriptor, address, fingerprint, xpub, PSBT, or device path is migrated, logged, or exposed. Pre-cutover development data is intentionally not loaded and may be removed manually by its owner.

## Retained as history

- ADR 0023 records why compatibility was initially preserved and is marked superseded by ADR 0024.
- Earlier accepted ADRs and dated security or execution evidence retain the product name and identifiers used when they were written; ADRs and evidence are not rewritten after the fact.
- Current source, configuration, tests, marketing, and canonical/operator documentation contain no Satchel-derived identifier.

The automated `pnpm test:brand` gate asserts the `Groot` product, main executable, window, bundle, secure-store, package, icon-source, and webview identities and rejects the former public name from current UI and platform-metadata surfaces.
