# ADR 0053: Proposed limited mainnet enablement

- Status: proposed and blocked; mainnet remains disabled
- Date: 2026-09-02
- Would supersede: ADR 0012 only after every exit condition below is met
- Extends: ADR 0026, ADR 0037, ADR 0052

## Context

ADR 0012 deliberately keeps mainnet unreachable until the complete release
boundary has independent evidence. ADR 0052 fixes the first-release product
scope as macOS desktop on Apple silicon with BIP84 software wallets, approved
exact-model BIP84 hardware wallets, and standard BIP48 hardware multisig.

This proposal makes the eventual enablement diff reviewable before it exists.
It neither accepts residual risk nor authorizes a mainnet build.

## Proposed decision

After every exit condition is satisfied in one frozen commit, a later accepted
revision of this ADR may authorize one dedicated mainnet build with:

- a mainnet-specific bundle identifier and isolated application-data location;
- exact Bitcoin mainnet genesis verification before any wallet database opens;
- user-controlled, loopback-only Bitcoin Core and no explorer or fallback
  backend;
- exactly one external recipient, a positive amount, no batch spending, and a
  maximum of 1,000,000 satoshis per transaction;
- BIP84 software single-key wallets, approved exact-model BIP84 USB hardware
  wallets, and standard BIP48 hardware multisig only;
- no guided delayed/recovery Miniscript, Payjoin, compact filters, remote Core,
  Tor/onion Core, public Esplora, mobile, Windows, or automatic updates; and
- a visible mainnet identity and warning on onboarding, lock, wallet, review,
  signing, and settings surfaces.

The enablement change must be a small, separately reviewed diff. It must expose
mainnet consistently in the trusted Rust network boundary, frontend build
configuration, Tauri bundle configuration, derivation/address/descriptor/PSBT
parameters, HWI chain selection, storage isolation, and release scripts. No
environment variable or runtime preference may enable mainnet in another build.

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

ADR 0012 remains authoritative and `MAINNET_ENABLED` remains `false`. This
proposal may be edited during review, but it cannot be marked accepted until
the checklist links exact evidence for every exit condition. Accepting it later
does not certify any unlisted platform, model, firmware, transport, backend, or
wallet policy.
