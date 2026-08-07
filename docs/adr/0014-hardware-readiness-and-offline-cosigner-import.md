# ADR 0014: hardware readiness and offline cosigner import

Status: accepted

## Context

HWI enumeration can detect a device before it can return a fingerprint. Treating “no fingerprint” as “not found” hides actionable states such as a locked Trezor Model One, an unpaired BitBox02, or a Jade that has not logged in. HWI 2.3.1 can also warn that a passphrase-protected Trezor One was opened with an empty passphrase; accepting that fingerprint could import a different wallet than the user intended.

Air-gapped signers also need a public-data path that does not imply USB support. A mounted SD card can carry an account tpub safely only when the file is bounded, contains no private material, and is validated again by the Rust descriptor boundary.

## Decision

- Enumeration returns detected devices with a typed readiness status, safe device-specific guidance, and an explicit permitted action. A missing fingerprint is not silently discarded.
- Trezor/KeepKey PIN-matrix challenges are started only for a freshly enumerated matching path. PIN positions are limited to digits 1–9 and 50 positions, sent to HWI through bounded stdin, immediately cleared, and never placed in process arguments or logs. Challenges are single-use and expire after two minutes.
- A Trezor empty-passphrase warning fails closed by default. The user may explicitly choose the seed-only standard wallet; the native import command independently requires that consent and the resulting fingerprint binds future operations. Host-entered hidden-wallet passphrases remain unsupported until a separately reviewed native secret-entry design exists.
- BitBox02, Jade, Ledger, Coldcard, and unknown-device readiness errors use explicit remediation without returning raw HWI errors, USB paths, or fingerprints in error text.
- Mounted-file cosigner import accepts at most 256 KiB of JSON public data, rejects private/recovery fields and extended private keys, requires an eight-hex fingerprint, the test-chain BIP48 account path, and a tpub, and remains subject to Rust policy validation at preview/create.
- Camera and animated-QR controls remain hidden until permissions, UR interoperability, hostile-frame parsing, and physical device evidence are complete.

## Consequences

Locked devices remain visible and recoverable without weakening identity checks. The Trezor PIN positions cross the existing trusted Satchel webview-to-Rust command boundary but are minimized, masked, bounded, single-use, and cleared; a future platform-native entry surface may further narrow that boundary. SD-card import is functional for Satchel and compatible Coldcard-style public JSON records, but it does not imply universal vendor-file compatibility. No physical device is certified by simulator or unit evidence.
