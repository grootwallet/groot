# Mainnet release checklist

Release decision: BLOCKED

No checkbox may be marked complete without a linked test artifact, review record, or reproducible command output. Never commit mnemonics, credentials, xpubs, PSBTs, addresses, device paths, RPC secrets, or complete device fingerprints.

Candidate scope: first mainnet release is macOS desktop only, hardware-focused, amount-capped, and backed exclusively by a user-controlled Bitcoin Core node. iOS, Android, Windows, public Esplora, and mobile mainnet require separate platform release decisions; evidence for one platform never certifies another.

## Network and transaction safety

- [ ] Signet create/recover/sync/receive/send/restart/delete suite passes against the production backend adapter.
- [ ] Testnet4 repeats the complete suite, including reorg, stale backend, fee failure, and cross-network rejection.
- [ ] Mainnet genesis hash and backend network are verified before wallet/database opening.
- [ ] Mainnet BIP84/BIP48 origins, xpub versions, addresses, descriptors, HWI chain, PSBT network, and explorer agree.
- [ ] User-controlled Bitcoin Core is the only first-release mainnet backend; remote Core/Esplora have separate privacy review.
- [ ] No fallback backend or fallback fee exists.
- [ ] First mainnet release has an explicit per-transaction amount cap and no batch spending.
- [ ] RBF and CPFP pass funded replacement, package-fee, rejection, restart, and confirmation-race tests.
- [ ] Birthday/gap-limit recovery restores an independently known wallet with old history and a deliberately extended gap.
- [ ] Large-history and extended-gap scans expose bounded progress/cancellation, survive restart, and complete within the documented resource envelope.
- [ ] Direct remote Core over TLS and `.onion` Core over a loopback Tor proxy pass chain-identity, authentication, timeout, certificate, DNS-leak, and fail-closed tests.

## Hardware certification

- [ ] Coldcard Mk4 certification record complete and sanitized summary reviewed.
- [ ] Trezor Model One certification record complete and sanitized summary reviewed.
- [ ] Ledger certification record complete.
- [ ] BitBox02 certification record complete.
- [ ] BitBox02 Nova desktop-USB support is either implemented and separately certified or explicitly excluded from the first-release support matrix.
- [ ] Blockstream Jade certification record complete.
- [ ] Each record covers setup/import, reconnect, fingerprint, policy registration, address display, signing, user rejection, wrong device, changed PSBT, and firmware/HWI compatibility.
- [ ] At least two independent devices complete a real 2-of-3 Testnet4 spend and descriptor recovery drill.

## Secrets and platforms

- [ ] macOS Keychain behavior is tested across create, upgrade, restart, backup restore, and deletion.
- [ ] macOS packaged-app lifecycle, inactivity lock, sleep/wake, crash/restart, accessibility, clipboard, screen capture, and multi-window behavior are certified.
- [ ] A second Groot process cannot concurrently mutate the same registry or wallet databases; stale-lock and crash recovery fail safely.
- [ ] iOS Keychain and lifecycle/background behavior are certified on physical devices before an iOS mainnet release.
- [ ] Android hardware-backed Keystore replaces the sandbox fallback and is certified on physical devices before an Android mainnet release.
- [ ] Windows Credential Manager replaces the sandbox fallback and is certified before a Windows mainnet release.
- [ ] Logs, crash reports, accessibility trees, screenshots, clipboard, analytics, and IPC are audited for secrets.

## Build and review

- [ ] CI is green from a clean checkout with locked dependencies.
- [ ] Two independent clean machines produce matching unsigned binary hashes from the same commit and locked toolchain.
- [ ] The packaged HWI binary/source, version, hashes, licenses, and update policy are pinned and verified.
- [ ] SBOM, dependency licenses/advisories, artifact provenance, macOS hardened-runtime signing/notarization, and update signature plus rollback verification are complete.
- [ ] BIP129/BSMS export/import and `crypto-psbt` UR/file exchange interoperate with at least two independent descriptor-aware coordinators/signers.
- [ ] External Bitcoin wallet/security review is complete and findings are resolved.
- [ ] Recovery drill is independently performed from documented backups in another descriptor-aware wallet.
- [ ] Incident response, vulnerability disclosure, rollback, and signed update procedures are published.
- [ ] ADR 0012 is superseded by an approved mainnet-enablement ADR.
