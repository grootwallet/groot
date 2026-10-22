# ADR 0105: Authorize the 5.3.0 release campaign

- Status: accepted
- Date: 2026-10-22
- Extends: ADRs 0088, 0103 and 0104

Authorizes: public Mainnet distribution for version 5.3.0 when annotated tag v5.3.0 and origin/main resolve to the same commit

## Decision

The release owner approved promoting the tested 5.3 desktop scope to exact
version 5.3.0 and explicitly authorized changing the Mainnet release
authorization record and gate from v5.2.0 to v5.3.0. The source includes the
sealed fast HWI runtime for the Developer ID-signed multi-network macOS app,
the seven approved hardware signer models, the new start page, the removed
application-level 0.01 BTC spend ceiling, and the Regtest/Testnet4-only phone
key and Partner/Family Continuity previews described in ADR 0104.

This authorization permits preparing the exact signed and notarized package
for owner acceptance. It does not instruct publication before the owner tests
that package. Preserve the exact-source, reproducible executable, HWI
provenance, signed-runtime digest, CI, Developer ID, Apple
notarization, package verification, and annotated remote tag/main bindings.
The owner must test the signed package before public GitHub publication.

For v5.3.0 only, the owner separately authorized two initially clean source
checkouts and separate fresh Cargo targets on the same Mac in place of two
independent Macs. Record the resulting matching executable evidence as
same-Mac reproduction; it cannot detect a compromised host or establish host
independence. This narrow exception does not extend to later versions.

## Compatibility and standards

Version promotion and release authorization change no persisted wallet,
registry, backup, proposal or credential format. Existing Mainnet wallets
remain in the canonical multi-network application namespace. The enabled
runtime changes HWI execution timing, not BIP84/BIP48 wallet semantics or
authorization rules. Miniscript and phone-key previews remain unavailable on
Mainnet, so BIP support does not expand beyond ADR 0104.
