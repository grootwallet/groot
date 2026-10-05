# ADR 0082: Authorize the v0.5.0 release tag

- Status: accepted
- Date: 2026-10-05
- Extends: ADR 0012, ADR 0053, ADR 0069, and ADR 0079

Authorizes: public Mainnet distribution for version 0.5.0 when annotated tag v0.5.0 and origin/main resolve to the same commit

## Context

The v0.5.0 source and functional candidate completed review, automated validation,
and owner testing. The prior tracked exact-commit authorization was self-referential:
changing the tracked authorization record necessarily created a different commit.

## Decision

Authorize v0.5.0 through the tracked version and exact annotated tag. Production
packaging must freshly query the remote and require local `HEAD`, `origin/main`,
and the peeled `v0.5.0` tag to resolve to the same commit before signing or
notarization. A lightweight, missing, moved, mismatched, or unapproved tag fails
closed.

This authorization is limited to the already approved macOS Apple-silicon,
multi-network GA scope. Release evidence, signed HWI input, Developer ID signing,
Apple notarization, stapling, and package verification remain mandatory.

## Compatibility and BIP impact

This changes release governance only. It changes no wallet behavior or persisted
format, requires no migration, and has no BIP impact.

## Consequences

The authorization record can remain immutable while the annotated release tag
binds the reviewed version to the final merge commit. Corrections require a new
version and authorization; the published tag must never move.
