# ADR 0039: bundle reviewed HWI with macOS releases

Status: accepted

## Context

Groot's USB hardware-signer support invokes Bitcoin Core HWI across a subprocess boundary. Earlier public-network builds authenticated an externally installed executable with a pinned digest and root-owned path ancestry. That is a useful Unix installation rule, but it is not an acceptable macOS product experience: a user who installs Groot from a DMG must not also install Homebrew, HWI, or a privileged helper. A Testnet4 v4.7 development bundle exposed the mismatch by failing hardware discovery when no qualifying external HWI installation existed.

Groot is also not production-ready. Desktop candidate labels must remain pre-1.0 and must not imply a stable major release.

## Decision

- A distributed macOS app contains the exact reviewed arm64 HWI 3.2.0 executable at `Contents/Resources/hwi`. The release build verifies the source artifact's manifest SHA-256, exact version output, regular-file identity, executable mode, and code signature before copying it.
- Public-network macOS runtime never searches `PATH`, Homebrew, or another system directory when the bundled-resource build flag is present. It resolves only the fixed resource name below the current `.app` bundle.
- Before every spawn, Rust rejects symlinks and writable executable modes, verifies the complete app-bundle code signature and nested-code seal, verifies HWI's code signature, and recomputes the exact SHA-256 compiled into that release. The subprocess still receives a cleared environment with only canonical `HOME` restored.
- A production-signed build compiles the expected Apple Developer Team ID and requires that identity on the containing app. A local ad-hoc signature is permitted only for disposable public-test candidates and is not production or mainnet release evidence.
- Regtest development may continue using an explicit external path. External public-network installations on platforms without the bundled macOS boundary retain their platform-specific fail-closed rules.
- HWI changes only through a complete reviewed and signed Groot update. It has no independent updater.
- Until production-readiness is approved, release and candidate versions remain semantic versions below `1.0.0`. The candidate following v4.7 is `v0.4.8`; the package metadata, visible Settings version, bundle metadata, and artifact filename must agree.

## Compatibility

This changes executable packaging and runtime resolution only. It does not change wallet, profile, proposal, backup, registry, or credential formats. Existing Testnet4 data remains compatible.

## Consequences

macOS users receive the reviewed hardware dependency with Groot and do not perform a second installation. Substitution of either the bundled executable or the sealed resource tree fails closed. Local ad-hoc Testnet4 builds provide integration evidence but do not provide a production publisher identity; Developer ID signing, notarization, independent review, and the physical device matrix remain release gates.
