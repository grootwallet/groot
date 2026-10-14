# ADR 0088: Authorize the v5.2.0 release campaign

- Status: accepted
- Date: 2026-10-14
- Extends: ADR 0069, ADR 0079, ADR 0083 and ADR 0087
- Supersedes: the two-independent-machines reproduction requirement for this release only

Authorizes: public Mainnet distribution for version 5.2.0 when annotated tag v5.2.0 and origin/main resolve to the same commit

## Decision

The owner accepted `5.2.0-rc04` at `b432f790379552a63d2d28fed182e9b0b649bbee` and explicitly requested GA preparation, two separate builds on the same machine, signing and GitHub publication. The accepted changes include first-history consent/retry, standard multisig restoration/labels, hardware/multisig PIN rotation and deletion safeguards, release notes, and the corrected Updates placement and Caps Lock indicator.

For v5.2.0 only, two initially clean source checkouts and separate fresh Cargo targets on the same Mac replace the two-machine reproduction requirement. Each build retains locked inputs, path remapping, UUID normalization, frozen production-signed HWI, executable/SBOM/provenance comparison and strict code-signature checks. Record the evidence as same-machine reproduction; it cannot detect a compromised host or demonstrate host independence. Later releases revert to the standing two-machine requirement unless separately authorized.

The macOS Apple-silicon multi-network scope remains Regtest, Testnet4 and Mainnet. Windows/Linux packaging stays experimental and is excluded from this GA publication. Feature branches for mobile continuity and Miniscript remain separate.

This authorization is conditional on independently reviewed source-policy changes, passing validation and applicable native/Core checks, matching reproduction evidence, an annotated signed tag, identical HEAD/fresh origin main/peeled tag, Developer ID signing, notarization, stapling, signed provenance and final package verification. Do not refresh source hashes without the corresponding review record or publish an internal ad-hoc package. Signing keys remain owner-local.

## Compatibility and BIP impact

The version promotion and release governance change no wallet/profile, credential, proposal, registry or backup format and require no migration. No BIP support changes. New updater dependencies and the earlier feedback implementation retain their owning ADRs and require review on the final source.
