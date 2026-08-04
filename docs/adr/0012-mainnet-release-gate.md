# ADR 0012: fail-closed mainnet release gate

- Status: accepted
- Date: 2026-08-03
- Extends: ADR 0003, ADR 0005, ADR 0009, ADR 0011

## Context

Satchel can construct and sign real Bitcoin transactions, but its live backend, derivations, HWI chain, secure-storage certification, and test evidence are still scoped to regtest. A UI network toggle would create a credible risk of cross-network descriptors, wrong-device signing, privacy leakage, unrecoverable backups, or unintended mainnet broadcast.

## Decision

Mainnet remains disabled in frontend configuration, the wallet registry, the native wallet constant, and Tauri build mode. CI runs `pnpm test:release-gate` and fails if any of those locks move before this ADR and the release checklist are superseded together.

The HWI process boundary becomes explicitly chain-aware now so a future mainnet implementation cannot silently inherit `--chain test`. Test networks use BIP84 `m/84'/1'/0'` and BIP48 `m/48'/1'/0'/2'`; mainnet will use `m/84'/0'/0'` and `m/48'/0'/0'/2'`. Network, origin, xpub version, address, descriptor, PSBT, backend genesis hash, and explorer must agree before any signing or broadcast operation.

A later ADR may enable mainnet only after every blocking item in `docs/mainnet-release-checklist.md` has independent evidence. The first mainnet build must be opt-in, desktop-only, hardware-focused, amount-capped, and use a user-controlled Bitcoin Core backend. Public Esplora and mobile mainnet remain separately gated.

## Consequences

Real hardware may be exercised safely on regtest, Signet, and Testnet4 before mainnet exists. Mainnet cannot be enabled by environment variable alone. Certification evidence must not contain xpubs, PSBTs, addresses, device paths, credentials, seeds, or complete fingerprints. Removing the guard requires an explicit reviewable code and documentation change.
