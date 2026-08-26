# ADR 0044: Fail closed at the delayed-policy hardware boundary

- Status: accepted
- Date: 2026-08-26

## Context

Groot's guided Recovery and legacy Inheritance wallets compile native-SegWit
Miniscript descriptors with an immediate 2-of-3 branch and a separate
relative-timelocked key. Some current BitBox02, Ledger, and Jade firmware can
understand Miniscript or register descriptors. That vendor capability is not
the same as support through Groot's reviewed hardware boundary.

The bundled Bitcoin Core HWI 3.2.0 descriptor parser and the exact Ledger,
BitBox02, and Jade adapters used by Groot expose standard singlesig and
`wsh(sortedmulti())` workflows, not Groot's delayed descriptor. Coldcard and
Trezor adapters likewise do not provide a reviewed delayed-policy path. Passing
such a descriptor to generic address-display or PSBT-signing commands would
therefore turn an unsupported integration into a late, device-specific failure.

## Decision

- USB enrollment, trusted address display, policy registration, and signing
  remain available for standard BIP48 multisig under the existing exact-model
  certification matrix.
- New guided Recovery and Inheritance setup does not offer USB signer import.
  Public account keys may still be imported by bounded file or manual entry.
- Existing delayed-policy wallets and proposals remain readable and unchanged.
  Their QR, file, text, and removable-media PSBT workflows remain available.
- Rust rejects delayed-policy HWI address display, policy verification, and
  signing with stable `hardware_policy_unsupported` before discovery or a
  trusted-device prompt begins.
- BitBox02, Ledger, and Jade are recorded as firmware candidates, not supported
  delayed-policy devices. Coldcard, Trezor, and unreviewed families are
  unsupported at this boundary.
- Enabling a candidate requires a reviewed subprocess adapter that can parse,
  register/display, and sign the exact descriptor and spend path, followed by
  exact-model packaged Testnet4 evidence. Source similarity or vendor firmware
  documentation is insufficient.

## Compatibility and security consequences

No wallet, profile, registry, proposal, backup, or database format changes.
Existing delayed wallets are not migrated or discarded. The change removes an
unsafe UI capability and adds an authoritative Rust backstop; offline PSBT
coordination remains the compatibility path.

The HWI subprocess isolation decision is unchanged. Replacing or patching the
bundled HWI artifact, or introducing a direct in-process vendor transport,
requires its own dependency review, ADR, digest update, and certification plan.
