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

## Pre-wallet Core admission implementation

The follow-up `codex/mainnet-core-admission` branch implements the remaining
trusted-storage interlock while mainnet stays disabled. Both mutable and read-only
SQLite constructors now require an unforgeable Rust-owned permit. A permit is
issued only after a process-local Core admission proves the exact compiled chain,
exact genesis, loopback-only HTTP endpoint, explicit protected RPC authentication,
and the intended scope: one selected existing wallet or one new-wallet attempt.
The preflight password is zeroized, bounded to 15 minutes, cleared on explicit
cancel/lock and after every new-profile attempt, and cleared after a
successful existing-wallet unlock. An unlocked profile continues through its
existing authenticated per-wallet node session; it does not retain a second
preflight copy.

Software, external-signer, standard multisig, Groot-backup recovery, and BSMS
recovery all require the new-wallet permit before the first database open. The
validated Core setup is encrypted under that new profile's credential before the
registry commit; every failure removes the incomplete directory and in-memory
session. Exact-descriptor duplicate inspection uses a distinct identity-inspection
permit and cannot create a missing database. Test-network behavior and all durable
formats remain unchanged. This implementation still requires focused independent
review and enabled-path integration evidence before it can be part of an accepted
mainnet candidate. The exact invariant, implementation boundary, compatibility
assessment, validation commands, and adversarial review scope are recorded in
[`mainnet-core-admission-2026-09-03.md`](mainnet-core-admission-2026-09-03.md).

## Coldcard and Jade family decision

Coldcard Mk4 and Jade Classic remain the tested exact-device targets, and their
existing Regtest/Testnet4 results remain evidence only for those candidates.
Bundled HWI 3.2.0 reports a non-EDGE Coldcard as `coldcard`/`coldcard` and serial
Jade devices as `jade`/`jade`; it does not prove Mk4 or Classic. ADR 0054 records
the release owner's explicit decision to admit those exact family records at the
mainnet runtime boundary. The residual risk is that another model using the same
HWI record can pass admission. Such a model does not inherit certification or a
support claim; release copy must disclose the family-level enforcement.

## Remaining release sequence

1. Independently review the implemented pre-wallet exact-genesis Core admission,
   then add the separately reviewed dedicated mainnet build/storage identity.
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
