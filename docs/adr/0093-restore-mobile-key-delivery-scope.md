# ADR 0093: Restore phone-held keys to mobile delivery scope

- Status: accepted product scope; implementation and certification pending
- Date: 2026-10-18
- Supersedes: ADR 0089's watch-only delivery scope, not its native safety restrictions
- Extends: ADR 0001, ADR 0035, ADR 0088, ADR 0091 and ADR 0092
- Tracking: [issue #6](https://github.com/grootwallet/groot/issues/6)

## Context

The owner clarified that mobile must create a software wallet with its key held on the phone, also act as an independent multisig signer, and coordinate with desktop through QR. The watch-first plan narrowed that intended outcome too far. ADR 0089's statement that the owner requested signing to remain outside delivery scope must not be read as the current requirement.

The retained coordination branch at `85e794a28a222a6591cb080b6a23efcbbc1582d2` has BIP129 enrollment, native iOS mnemonic presentation/entry, restart staging, exact-policy recovery and PSBT signing. It does not have the required device-bound Keychain wrapper. Its tests do not establish a complete physical recovery or lifecycle result. The installed foundation has none of those coordination commands/routes and deliberately rejects mobile key operations.

## Decision

Deliver three explicit capabilities: a phone-held BIP84 software wallet, a phone-held BIP48 multisig cosigner, and accountless QR exchange of public wallet context and PSBTs. Keep private seeds and keys on the originating device. “Sync keys” means public account keys, origins and policy, never moving a seed or private descriptor into a QR or the webview. Full bidirectional label/history synchronization and a hosted relay are separate work, not prerequisites for the first offline QR signing flow.

Preserve existing software-wallet semantics: its BIP39 passphrase selects the wallet and authorizes Groot operations. The retained multisig phone signer instead derives with an empty BIP39 passphrase and uses an independent local PIN; do not silently convert one into the other or reuse their key across roles. Recovery copy must distinguish these models.

Adopt retained code in reviewed increments on the current baseline, preserving component-scoped styles and the native worker/selection protections. Complete platform protection, native backup verification, exact-policy recovery and lifecycle tests before enabling the corresponding operation on iOS. Android remains a separate platform implementation and certification; an iPhone result cannot certify it. Mainnet and release-source gates remain intact.

The earlier branch's duplicate ADR 0048 is historical source material, not a replacement for the accepted transaction-review ADR. Document the selected QR protocol and threat model under an unused ADR number before porting it. Do not invent a new persistent communications channel as a prerequisite for an offline signing exchange.

## Compatibility and evidence

This decision and audit change documentation only: no schema, encrypted envelope, credential, derivation, dependency, protocol or stored profile changes. No wallet data is migrated or discarded. A device-bound wrapping implementation must first specify compatibility with existing desktop software files and retained testnet phone/staging envelopes. Any breaking conversion still requires the owner's explicit migration-versus-discard approval under ADR 0035.

The [delivery plan](../mobile-5.3-plan.md) lists implementation exits. The [audit](../testing/5.3-mobile-key-audit.md) distinguishes installed-device failures from passing retained-branch tests. Neither authorizes a source-pin refresh, public package, Mainnet mobile wallet or a claim that the feature already works on the phone.
