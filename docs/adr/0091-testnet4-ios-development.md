# ADR 0091: Testnet4 for connected iPhone development

- Status: accepted for owner-requested local development only
- Date: 2026-10-18
- Extends: ADR 0089
- Supersedes: ADR 0089's Signet-only iOS development network and bundle identity; all capability restrictions remain

## Decision

The owner explicitly selected Testnet4 for the connected, unlocked, trusted iPhone. Use the existing Testnet4 network/derivation policy for both bundled frontend and trusted Rust. Name the app **Groot Testnet4 Dev** with identifier `app.groot.wallet.mobile.testnet4.dev`. Keep it distinct from the earlier Signet `app.groot.wallet.mobile.dev` and desktop identities; do not migrate, copy, overwrite or reinterpret their data.

The development build remains bundled and isolated from desktop profiles, with no LAN frontend server. Development signing and installation may use the owner's existing configured identity/provisioning on the explicitly selected phone. This is local testing, not public distribution or a release candidate. An unsigned archive is not directly installable on an iPhone.

All ADR 0089 native restrictions remain: no mobile key generation/recovery, secret backup access, software/hardware signing or broadcast. Authenticated pairing/watch enrollment and PSBT handoff remain separate unfinished increments. This network choice does not merge the separate mobile signer branch, authorize phone-held keys, enable Mainnet, certify Android, or refresh source pins. Baseline version naming and the release gates remain unchanged.

## Compatibility and evidence

No persisted format, migration or discard. A separate identifier creates a separate app-data boundary instead of changing an existing wallet's network. No new BIP support: Testnet4/BIP94 and existing wallet standards are reused. No dependency, entitlement, updater trust or production-signing change. Verify the compiled Testnet4 identity, bundled native frontend, unsigned/development signature as applicable, app identifier and connected-phone behavior; compilation and installation are separate evidence from functional wallet support.
