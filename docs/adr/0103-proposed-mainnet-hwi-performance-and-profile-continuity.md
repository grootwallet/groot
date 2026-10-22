# ADR 0103: Proposed Mainnet HWI performance and profile continuity

- Status: proposed; implementation and Mainnet use require independent review
- Date: 2026-10-22
- Extends: ADRs 0069, 0098, 0101 and 0102

## Problem

The 5.3.0-rc15 multi-network internal app uses the bundle identifier
`app.groot.wallet.internal`; the separate fixed Mainnet RC uses
`app.groot.wallet.mainnet.internal`. Neither reads the released multi-network
app's `app.groot.wallet/networks/mainnet` wallet registry. The owner's seven
existing Mainnet test wallets remain in the released app's namespace. The fixed
Mainnet RC also omits the extracted HWI runtime, and the one-client operation
session is restricted to Testnet4. It therefore cannot measure the approved
Testnet4 latency changes on Mainnet. Packaging it as the next Mainnet speed
candidate was a scope error.

## Proposed decision

Prepare one 5.3 multi-network GA candidate using the canonical
`app.groot.wallet` identity and its existing network-isolated data root, with
no automatic migration, registry copy or format change. Before any candidate
opens an existing profile, make an owner-only, independently verified backup
while all Groot processes are closed. Check that the exact existing Mainnet
registry and wallet files remain unchanged by backup creation.

For the isolated internal RC only, the owner has authorized a complete,
one-way snapshot of the released app's `networks/mainnet` namespace into the
otherwise empty `app.groot.wallet.internal/networks/mainnet` namespace. This
requires a verified independent backup, closed Groot processes, absent target,
private permissions, full tree comparison and an atomic rename into place.
Keep the source untouched. The snapshot is disposable test data, not a wallet
format migration or a GA profile move. Never merge registries or copy a
partial wallet directory. A future GA build should read the canonical profile
directly.

The owner closed Groot on 2026-10-22. A private, complete Mainnet namespace
backup was made and verified before copying it into the empty internal RC
namespace. Each tree contains seven registry entries and 51 regular files,
with no symlinks; their path-and-content SHA-256 digest is
`389b6a637fd04cd01bf3c65dca6b524dce6b878df4a5dc2785da610256c4a354`.
The released app's source tree still matches that digest. This verifies the
snapshot, not wallet unlock, node access, app display or transaction safety.

For the internal performance candidate, extend the sealed, digest-verified
HWI 3.2.0 operation runtime to the explicit Mainnet chain and BIP84/BIP48
Mainnet account paths. Preserve fresh full fingerprint-and-xpub proof on each
request, exact selected-device match, policy authorization before display or
signing, original vendor commands, native display/PSBT/signature verification,
single-use process lifecycle, and fail-closed runtime verification. Do not
cache unlocked status, identity, policy or client state across operations.
Testnet4's Jade shared-test selector remains Testnet4-only; Mainnet must use
HWI's explicit Mainnet chain. Reject all selector/path/xpub-network mismatches.

This proposal grants no Mainnet signing-path authorization. The implementation
must wait for a dedicated threat-model review and an independently reviewed
5.3 source-policy snapshot. An ad-hoc internal package is not a GA artifact.

## Threats and required evidence

- **Cross-network signing:** bind native active chain, worker request, HWI
  selector, account coin type, xpub version, descriptor and reviewed PSBT to
  Mainnet. Test wrong-chain and wrong-account inputs before any device action.
- **Wrong device or stale authority:** prove full live identity per request;
  reject zero, multiple or mismatched saved candidates and stale policy
  evidence. Reconnect, lock and cancellation must not reuse authority.
- **Runtime substitution:** verify the outer app seal, original HWI digest,
  complete extracted-runtime manifest and nested signature before each use;
  corrupt or missing payload fails closed without fallback or action replay.
- **Profile damage:** back up the canonical data root while closed, verify
  copy completeness and permissions, keep the source untouched, and run a
  disposable copy/recovery test before opening the owner's existing wallets.
  Check restart, credential rejection and network switching against the exact
  candidate. No silent migration or downgrade reinterpretation.
- **Unreviewed release:** run `pnpm validate`, Mainnet Rust checks, source-pin
  review, exact-model physical trials, independent security review, repeatable
  builds, Developer ID signing/notarization and final exact-tag checks before
  publishing 5.3.0. Do not refresh source hashes merely to pass a gate.

The physical speed campaign must measure all seven exact models on the same
Mainnet candidate: passive discovery, identity, health, address/policy display,
transaction presentation, signature return, rejection, locked/disconnected
recovery and restart. Record firmware and first/warm samples separately. The
owner must independently verify actual transaction details on each signer.

## Compatibility and standards

No BIP, wallet format, descriptor, backup, proposal, registry, credential or
network-selector change is proposed. Existing 5.2 wallets remain in their
current namespace. The owner-authorized RC snapshot copies the complete
namespace without changing its format. The proposed HWI path changes how a
request is executed, not which wallet or transaction may be authorized.
Mainnet performance remains unimplemented until the gates above close.
The snapshot has no BIP impact because it changes neither data encoding nor
wallet behavior.
