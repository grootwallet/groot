# ADR 0053: Proposed limited mainnet enablement

- Status: superseded for release by ADR 0061, ADR 0069, and the bounded v0.4.96 GA decision
- Date: 2026-09-02
- Would supersede: ADR 0012 only after every exit condition below is met
- Extends: ADR 0026, ADR 0037, ADR 0052

## Context

ADR 0012 deliberately keeps mainnet unreachable until the complete release
boundary has independent evidence. ADR 0052 fixes the first-release product
scope as macOS desktop on Apple silicon with BIP84 software wallets, approved
BIP84 hardware wallets, and standard BIP48 hardware multisig. ADR 0054 accepts
HWI's exact family records for Coldcard and Jade while keeping their evidence
model-specific.

This proposal defines the eventual release decision. ADR 0055 now authorizes one
isolated, non-distributable mainnet certification build so the exit conditions can
be tested; it neither accepts residual risk nor authorizes distribution.

## Proposed decision

After every exit condition is satisfied in one frozen commit, a later accepted
revision of this ADR may authorize the ADR 0069 multi-network GA build with:

- one general product identity, an owner-only restart-bound selector, and isolated
  Regtest, Testnet4, and Mainnet application-data namespaces;
- exact Bitcoin mainnet genesis verification before any wallet database opens;
- user-controlled Bitcoin Core through admitted loopback HTTP or direct HTTPS,
  with no automatic fallback backend;
- exactly one external recipient, a positive amount, no batch spending, and a
  maximum of 1,000,000 satoshis per transaction;
- BIP84 software single-key wallets, approved BIP84 USB hardware wallets under
  the exact-model policy plus ADR 0054's two family exceptions, and standard
  BIP48 hardware multisig only;
- no guided delayed/recovery Miniscript, Payjoin, compact filters, Tor/onion Core,
  public Esplora backend, mobile, Windows, or automatic updates; and
- a visible mainnet identity and warning on onboarding, lock, wallet, review,
  signing, and settings surfaces.

The enablement change must be a small, separately reviewed diff. It must expose
Mainnet consistently only after the trusted Rust selector is loaded, across the
frontend build configuration, Tauri bundle configuration,
derivation/address/descriptor/PSBT parameters, HWI chain selection, storage
isolation, and release scripts. No environment variable, RPC URL, descriptor,
import, or renderer-only preference may select Mainnet.

All final software, external-signer, and multisig broadcast paths must re-derive the one-recipient and amount-cap policy from the exact persisted PSBT immediately before signing/finalization/broadcast, reject frozen inputs, and preserve the original recipient and value for RBF. CPFP is a separate wallet-owned fee-child branch with no external recipient. The exact-genesis/loopback-Core interlock must run before the first mainnet database opens; invoking it only after a wallet database is loaded does not satisfy this proposal.

The preparation branches close four dormant boundaries without adding a second
activation mechanism: both multisig recovery import commands require recent
live-HWI admission before creating hardware-backed mainnet profiles; a
zero-recipient CPFP requires a descriptor-derived wallet output; and
local-loopback endpoint validation occurs before the
first genesis RPC. A subsequent isolated branch adds a Rust-owned, expiring,
purpose-bound Core admission required by both database constructors. New-wallet
admission is limited to one serialized creation attempt and persists the
already-validated protected Core setup only
inside the newly created credential-encrypted profile; failure rolls the profile
back. Existing-wallet admission must match the selected wallet's saved public Core
configuration and is cleared after unlock, when the authenticated per-wallet node
session assumes ownership. Mainnet remains disabled, and independent review plus
enabled-path evidence remain mandatory. The interlock is a product and
trusted-storage boundary, not a release-script toggle.

Coldcard Mk4 and Jade Classic remain named release targets because their existing
Regtest/Testnet4 evidence is valid. Bundled HWI 3.2.0 reports only the family
identities `coldcard` and `jade`; it cannot prove Mk4 or Classic. ADR 0054
explicitly accepts those two exact family records at runtime. Certification and
release claims remain model-specific, and the release must disclose that another
model reporting the same family identity can pass admission. User assertion, USB
path, label text, and firmware declarations are not substitutes for trusted
model identity.

## Exit conditions before acceptance

1. The independent security review of the frozen baseline is complete and all
   release-blocking findings are resolved.
2. This proposed ADR and the exact mainnet-enablement diff receive independent
   security review.
3. The seven-model desktop USB matrix is reduced to exact model, firmware,
   vendor Bitcoin-app where applicable, HWI 3.2.0, macOS, and transport tuples;
   every included tuple has a reviewed sanitized record.
4. Two genuinely independent clean machines produce matching unsigned evidence
   from the exact candidate commit and locked toolchain.
5. The exact candidate completes the applicable checklist, including software
   custody, Argon2id calibration, recovery/interoperability, signed/notarized
   package lifecycle, SBOM/provenance, and update/rollback evidence.
6. A disposable, minimal-value mainnet rehearsal confirms exact network,
   recipient, amount, fee, change, signing, broadcast, confirmation, restart,
   accounting, recovery, and the amount/batch gates. The amount chosen for this
   test must be far below the ceiling.
7. Release notes truthfully name the supported scope and exclusions, and an
   owner-approved rollback decision is recorded before distribution.

## Rollback and incident boundary

The first mainnet build has no in-app updater. Distribution uses a signed
manifest and separately verified artifact. Rollback is allowed only to an
explicitly signed, data-compatible version; wallet data is preserved and never
downgraded in place without a separately tested migration. A signing-key,
package, backend-identity, or custody-boundary concern stops distribution and
invokes the published incident-response procedure.

## Consequences

ADR 0012 remains authoritative for distribution. Mainnet is available only in
the dedicated certification identity or after the reviewed native selector has
chosen Mainnet in ADR 0069's multi-network identity. This proposal may be edited
during review, but it cannot be marked accepted until the checklist links exact
evidence for every exit condition, including multi-network isolation and restart
teardown. Accepting it later does not certify any unlisted platform, model,
firmware, transport, backend, selected network, or wallet policy.
