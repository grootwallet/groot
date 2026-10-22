# ADR 0096: Internal Testnet4 mobile signer rehearsal

- Status: accepted for internal development testing; public certification pending
- Date: 2026-10-18
- Extends: ADR 0091, ADR 0093, ADR 0094 and ADR 0095
- Supersedes: ADR 0089's blanket native key rejection only for the implemented iOS Testnet4 operations below

## Capability boundary

The owner explicitly requested recovery of the previously tested mobile branch, implementation of the missing protections, physical Testnet4 testing and a new numbered internal candidate. Native software create/recover/backup/sign/broadcast and QR phone-signer setup/recovery/health/signing are enabled only on iOS Testnet4 or existing desktop platforms. Android and other iOS networks continue to fail before key work. Mobile USB signing and multisig broadcast remain unavailable; a phone returns PSBT signatures and desktop validates/finalizes/broadcasts.

New iOS wallet-secret files use the version-6 device layer from ADR 0095. Existing portable files remain readable and are not silently migrated; retained legacy testnet protection metadata stays truthful. Do not describe an old PIN-only envelope as device protected. No existing profile, registry, proposal or backup format is rewritten. A future conversion of existing files is a separate approved compatibility decision.

Pairing reuses the retained BIP129 setup and public wallet record. It is an offline exchange, not a live labels/history synchronization service. Standalone software wallets allocate their own labelled receive addresses. Paired phone signers and mobile watch-only copies cannot allocate new receive requests: desktop remains the authority, preventing duplicate unused receive indexes and conflicting local labels. The restriction is native, precedes address derivation/mutation and has a durable UI explanation. Desktop receiving, ordinary software wallets and existing permanence/recovery-gap rules remain unchanged.

Commands retain worker execution and bind wallet-specific work to the selection before queueing, rechecking under the native operation lock. QR readers distinguish incomplete frames through a stable typed error, reset accumulation on explicit retry and stop camera work on teardown. No locale-dependent error-text parsing authorizes state changes.

## Release and evidence

This decision permits an internal, isolated Testnet4 candidate for completing device tests; it does not assert that the tests have already passed. Native/web network and version matching, Mainnet mobile rejection, reviewed-source pins, independent exact-diff review, hardware certification and public packaging authorization remain intact. Development provisioning is distinct from production signing or notarization.

The private desktop rehearsal uses a distinct app name/identifier and data namespace. It needs only the camera entitlement for the requested QR flow. Its builder rejects extra entitlement keys, retains the pinned HWI digest and `REHEARSAL_ONLY` identity, and still requires an exact clean commit. Production packaging/signing is unchanged. iOS packaging excludes build-only static libraries and verifies the actual linked network before development export; stripping debugging sections from the unsigned app does not change instructions or claim reproducibility.

Record exact candidate identity and results in the [RC2 test record](../testing/5.3.0-rc2-mobile-keys.md). Physical recovery, device authorization, camera exchange, funded Testnet4 signing, restart/background/loss drills and independent review remain separate acceptance evidence. A passing local Core test or a visible button does not certify the phone. Destructive passcode/biometric/reinstall checks and secret entry require the owner directly on the device.
