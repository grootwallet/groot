# ADR 0106: 5.4 cross-platform Testnet4 candidates

- Status: accepted
- Date: 2026-10-29

## Context

Groot 5.3.0 publicly packages the reviewed fast HWI 3.2.0 runtime for macOS
Apple silicon. The older Windows/Linux workflow produced isolated Signet
packages without bundled HWI, native device inventory, physical evidence or a
usable hardware-signing trust boundary. Those packages could compile while
remaining unsuitable for signer testing.

The owner requested Windows and Linux binaries for the next 5.4 release line,
with the pre-extracted HWI runtime used on every supported desktop platform.
Phone pairing and fixed Partner/Family Miniscript templates remain previews
that need more physical testing.

## Decision

Prepare `5.4.0-rc01` Windows x86-64 and Linux x86-64 **internal Testnet4-only**
candidates. They use distinct application storage and cannot enable Mainnet.
The build downloads the official HWI 3.2.0 platform archive and source, checks
the release-published archive and inner-executable digests, verifies the exact
version, and extracts the reviewed one-file payload into the application.
Groot compiles the source executable and extracted-manifest digests into the
candidate, verifies both before use, and uses one fresh client for identity
plus one authorized operation. It never searches PATH or falls back to another
HWI installation.

Windows/Linux device inventory reads cached OS HID, USB and serial metadata
without opening a signer. Linux admits the exact WebUSB bus/port selector used
by HWI. Windows does not guess a WebUSB controller number; hardware requiring
that unverified translation remains absent until physical evidence establishes
an exact mapping. The package and helper are unsigned internal owner-test
artifacts. Public distribution requires platform signing, installer and update
verification, independent source review, and the physical matrix.

The final `5.4.0` version, Mainnet enablement, and public Windows/Linux support
are not authorized by this decision. The v5.3.0 authorization record remains
unchanged.

## Compatibility and standards

No wallet, registry, descriptor, credential, backup, proposal, label or
database format changes. Existing profiles need no migration. BIP84, BIP48,
BIP174, fixed Miniscript templates, derivation paths and transaction authority
are unchanged. This adds platform packaging and device discovery evidence; it
does not expand certified BIP or hardware support.
