# ADR 0083: Authorize the v0.5.1 release tag

- Status: accepted
- Date: 2026-10-07
- Extends: ADR 0012, ADR 0053, ADR 0069, ADR 0079, and ADR 0082

Authorizes: public Mainnet distribution for version 0.5.1 when annotated tag v0.5.1 and origin/main resolve to the same commit

## Context

The release owner tested the focused v0.5.1 internal candidate, including the
last payment-QR rejection and translated send-progress corrections, and asked
to proceed with release preparation. The internal package is ad-hoc signed and
does not establish public distribution readiness.

## Decision

Authorize v0.5.1 through the tracked version and exact annotated tag, subject
to every existing production release gate. Production packaging must freshly
query the remote and require local `HEAD`, `origin/main`, and the peeled
`v0.5.1` tag to resolve to the same commit. A lightweight, missing, moved,
mismatched, or unapproved tag fails closed. This decision does not permit
publishing an internal test package.

The macOS Apple-silicon multi-network scope is unchanged. Frozen production-
signed HWI input, independent unsigned reproduction, Developer ID signing,
Apple notarization and stapling, signed provenance, and package verification
remain mandatory and must be recorded before publication.

## Compatibility and BIP impact

The v0.5.1 changes do not alter a persisted wallet format or supported BIP.
Existing profiles remain compatible and require no migration. This ADR changes
release governance only.

The supply-chain review of `src-tauri/Cargo.lock` found only Groot's own package
version changing from 0.5.0 to 0.5.1. No dependency, checksum, feature, or
toolchain input changed; production SBOM and provenance still require fresh
generation from the final release commit.

The mainnet source-policy snapshot was re-pinned only for the audited
release-version/authorization surfaces (`package.json`, `Cargo.toml`, Tauri
configuration, frontend configuration, the authorization record, and the
release-gate script). Their diffs change no network, signing, entitlement, or
wallet policy. All other reviewed source digests remain unchanged.

The static release-gate assertions were likewise updated only to require
version 0.5.1, tag `v0.5.1`, and ADR 0083. The fail-closed remote-tag and
packager checks were not relaxed.

## Consequences

The release tag binds the reviewed version to the final merge commit. The tag
must not be moved after publication; any correction needs a new version and
authorization.
