# Mainnet release checklist

Release decision: BLOCKED

No checkbox may be marked complete without a linked test artifact, review record, or reproducible command output. Never commit mnemonics, credentials, xpubs, PSBTs, addresses, device paths, RPC secrets, or complete device fingerprints.

## Network and transaction safety

- [ ] Signet create/recover/sync/receive/send/restart/delete suite passes against the production backend adapter.
- [ ] Testnet4 repeats the complete suite, including reorg, stale backend, fee failure, and cross-network rejection.
- [ ] Mainnet genesis hash and backend network are verified before wallet/database opening.
- [ ] Mainnet BIP84/BIP48 origins, xpub versions, addresses, descriptors, HWI chain, PSBT network, and explorer agree.
- [ ] User-controlled Bitcoin Core is the only first-release mainnet backend; remote Core/Esplora have separate privacy review.
- [ ] No fallback backend or fallback fee exists.
- [ ] First mainnet release has an explicit per-transaction amount cap and no batch spending.

## Hardware certification

- [ ] Coldcard certification record complete.
- [ ] Trezor certification record complete.
- [ ] Ledger certification record complete.
- [ ] BitBox02 certification record complete.
- [ ] Each record covers setup/import, reconnect, fingerprint, policy registration, address display, signing, user rejection, wrong device, changed PSBT, and firmware/HWI compatibility.
- [ ] At least two independent devices complete a real 2-of-3 Testnet4 spend and descriptor recovery drill.

## Secrets and platforms

- [ ] macOS Keychain behavior is tested across create, upgrade, restart, backup restore, and deletion.
- [ ] iOS Keychain and lifecycle/background behavior are certified on physical devices.
- [ ] Android hardware-backed Keystore replaces the sandbox fallback and is certified on physical devices.
- [ ] Windows Credential Manager replaces the sandbox fallback and is certified.
- [ ] Logs, crash reports, accessibility trees, screenshots, clipboard, analytics, and IPC are audited for secrets.

## Build and review

- [ ] CI is green from a clean checkout with locked dependencies.
- [ ] SBOM, dependency licenses/advisories, reproducible builds, artifact hashes, and code signing are verified.
- [ ] External Bitcoin wallet/security review is complete and findings are resolved.
- [ ] Recovery drill is independently performed from documented backups in another descriptor-aware wallet.
- [ ] Incident response, vulnerability disclosure, rollback, and signed update procedures are published.
- [ ] ADR 0012 is superseded by an approved mainnet-enablement ADR.
