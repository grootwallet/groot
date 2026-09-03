# ADR 0052: First mainnet software and hardware wallet scope

- Status: accepted as a release-scope constraint; mainnet remains disabled
- Date: 2026-09-02
- Extends: ADR 0012, ADR 0026, ADR 0037

## Context

ADR 0012 described the first mainnet build as hardware-focused but did not say
whether software-wallet creation and spending were included. That ambiguity is
not acceptable for a security review or release boundary: software wallets add
native entropy, mnemonic presentation and recovery, credential-derived key
storage, host signing, backup verification, and deletion surfaces that hardware
wallets do not.

The release owner explicitly selected both software and hardware wallet support
for the first limited mainnet candidate. This decision defines review scope; it
does not enable mainnet or mark any release-checklist item complete.

## Decision

The first limited mainnet candidate includes:

- native BIP84 software single-key wallet creation, recovery, receive, signing,
  broadcast, restart, relocation, and deletion;
- BIP84 external hardware-signer wallets using only exact model and firmware
  combinations approved in the release matrix;
- standard BIP48 hardware-backed multisig using only approved signers.

Guided delayed/recovery Miniscript policies, Payjoin, compact-filter sync,
remote Core, public Esplora, Tor/onion Core, mobile, Windows, and batch spending
are not included unless a later explicit release-scope ADR adds them with their
own evidence.

Every included wallet type uses the same trusted mainnet constraints: exact
mainnet genesis verification before database opening, user-controlled
loopback-only Bitcoin Core, exactly one external recipient, a positive amount,
and the 1,000,000-satoshi per-transaction ceiling. The ceiling is a loss limiter,
not a recommended test amount or readiness claim.

Software-wallet release evidence must cover native OS entropy failure, mnemonic
isolation and presentation, backup verification, exact BIP39 passphrase
semantics, creation-only credential policy, Argon2id calibration and offline
guessing risk, portable encrypted-profile lifecycle, wrong credential,
corruption, relocation, authenticated migration, signing, restart, recovery,
and deletion. Hardware evidence must remain exact-model and exact-firmware; no
family result is inherited.

## Consequences

The independent review and final candidate test matrix are broader than a
hardware-only release. The mainnet-enablement diff must expose both included
wallet classes consistently in Rust, UI, packaging, tests, and release notes.
A reviewer must assess host-key custody and offline credential guessing, not
only external-signer isolation.

Mainnet remains compile-time disabled under ADR 0012. This ADR may be cited by
the future enablement ADR only after every applicable checklist row has exact,
independent evidence.

## Implementation clarification — 2026-09-03

Exact-model approval is enforced in the trusted HWI discovery boundary, not inferred from display copy. New mainnet single-key and multisig hardware wallets also require recent in-memory live-HWI admission bound to the exact fingerprint, account xpub, derivation path, and device family; renderer-supplied QR, file, manual, or replayed metadata cannot substitute for that proof. HWI 3.2.0 provides adequate distinct model identifiers for the approved Ledger Nano S Plus, Trezor Model One/Safe 3, and Bitcoin-only BitBox02 variants. It exposes only family-level identities for Coldcard and Jade, so those families remain rehearsal-capable but are excluded from a future mainnet build until a trusted exact-model proof is implemented or a later reviewed ADR narrows or revises the target matrix. Firmware versions remain exact release-evidence assertions; HWI does not securely attest them at runtime.
