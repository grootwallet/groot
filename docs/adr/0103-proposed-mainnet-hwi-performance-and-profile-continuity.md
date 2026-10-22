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

Prepare one 5.3 multi-network candidate using the canonical `app.groot.wallet`
identity and its existing network-isolated data root, with no automatic
migration, registry copy or format change. Before any candidate opens an
existing profile, make an owner-only, independently verified backup while all
Groot processes are closed. Check that the exact existing Mainnet registry and
wallet files remain unchanged by backup creation. Any recovery/import to an
isolated profile must use Groot's supported backup flow and explicit owner
action; never copy a partial wallet directory or merge registries.

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
current namespace. The proposed HWI path changes how a request is executed,
not which wallet or transaction may be authorized. Mainnet performance and
profile continuity remain unimplemented until the gates above close.
