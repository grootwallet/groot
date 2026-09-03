# Mainnet enablement preparation — 2026-09-03

## Status

Mainnet remains disabled. This record covers the isolated
`codex/mainnet-enablement` preparation branch based on audited commit `f091d48`.
It is source evidence only: it is not an accepted enablement ADR, frozen candidate,
signed package, physical certification result, independent-build result, funded
mainnet rehearsal, or release authorization.

## Closed dormant boundaries

- Groot and BSMS standard-multisig recovery reconcile every public cosigner
  fingerprint, account xpub, BIP48 path, and device family against a recent
  in-memory live-HWI admission before creating a mainnet profile. Recovered source
  and device-family metadata comes from that admission, not the backup.
- Groot backup recovery rejects guided delayed/recovery Miniscript policies on
  mainnet before reconciliation or profile creation; only standard BIP48 recovery
  is in the first-release scope.
- A final mainnet CPFP must contain exactly one input and one output. The output
  must match the stored destination, map to a concrete wallet keychain/index,
  re-derive from the public descriptor to the same script.
- Mainnet Core endpoint policy permits only plain HTTP `LocalCore` on a validated
  loopback endpoint and rejects credentials in URLs, malformed URLs, HTTPS, and
  non-loopback endpoints before client construction or any genesis RPC. The direct
  HTTP transport independently resolves and pins the address to loopback. Exact
  mainnet genesis remains checked immediately after connection.

Test networks keep their existing recovery and acceleration behavior. Registry v1,
wallet databases, proposals, backups, descriptors, node settings, and secret
envelopes are unchanged; no migration is required.

## Remaining activation blocker

Every mutable and read-only wallet database opener must require a process-scoped
admission proving that the selected mainnet Core setup passed loopback policy and
exact-genesis authentication. Initial software, external-signer, and multisig
creation/recovery currently create a database before a per-wallet protected Core
setup exists. The enablement design therefore needs a pre-wallet Core setup flow
whose secret stays native, whose admission is memory-only and expiry-bound, and
whose validated setup is persisted into the new encrypted profile only after
profile creation. No environment flag, renderer assertion, or database-open
exception may bypass this order.

## Coldcard Mk4 and Jade Classic

Both remain intended exact-device targets, and their existing Regtest/Testnet4
results remain valid evidence for those candidates. Bundled HWI 3.2.0 reports a
non-EDGE Coldcard as `coldcard`/`coldcard` and serial Jade devices as `jade`/`jade`;
it does not prove Mk4 or Classic. The safe inclusion paths are:

1. implement and independently review a trusted native/device protocol that binds
   exact model identity to the same live signer connection; or
2. explicitly revise the release ADR to family-level support and independently
   certify every model that can claim those family identifiers.

Until one path is completed, the mainnet artifact must fail closed for those two
families. User confirmation, USB path, label, and declared firmware are not trusted
model proof.

## Remaining release sequence

1. Implement and review pre-wallet exact-genesis Core admission and the dedicated,
   isolated mainnet build/storage identity.
2. Obtain independent security review of this complete enablement diff and accept
   ADR 0053 only when its exit conditions are evidenced.
3. Freeze one exact commit and run clean pinned-runtime CI plus the full Rust,
   frontend, network, real-Core, SBOM, advisory, and release-policy suites.
4. Obtain matching unsigned evidence from two genuinely independent clean Apple
   silicon machines.
5. Build, Developer ID sign, notarize, staple, and deeply verify the exact frozen
   artifact and bundled HWI; bind both to the SBOM and signed manifest.
6. Complete the exact included-device/firmware/Bitcoin-app matrix and the signed
   software-wallet and hardware-wallet lifecycle checks.
7. Run minimal-value mainnet receive/send, cap/batch rejection, confirmation,
   restart/accounting, recovery, update, and rollback drills one safe action at a
   time.
8. Obtain closing independent review, approve release notes and rollback decision,
   then merge only the reviewed enablement commit to `main` and publish the signed
   manifest/artifact.
