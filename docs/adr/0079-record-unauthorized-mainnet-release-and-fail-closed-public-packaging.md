# ADR 0079: Record unauthorized Mainnet release and fail closed public packaging

- Status: accepted
- Date: 2026-10-03
- Extends: ADR 0012, ADR 0053, ADR 0055, ADR 0069, and ADR 0078

## Context

The public `v0.4.96` GitHub release, published from commit `f7b4b993`, distributes
a signed/notarized multi-network macOS package and asks users to test Regtest,
Testnet4, and Mainnet. The same immutable source snapshot says all of the
following:

- `docs/mainnet-release-checklist.md` has `Release decision: BLOCKED` and open
  release-critical rows;
- ADR 0012's public-distribution gate remains in force;
- ADR 0053 is proposed and blocked rather than accepted; and
- `SECURITY.md` says Mainnet distribution is not authorized.

No accepted ADR authorizes public Mainnet distribution for `f7b4b993`. The
release therefore outran the repository's authorization framework; it is not
evidence that the checklist completed or that the gate was silently waived.
Separately, the public `v0.4.95` tag currently resolves to `c3002279`, while a
previous local tag object resolves to `f486d923`. That movement invalidates the
assumption that the release tag alone is an immutable source identity.

This record does not rewrite either tag or GitHub release and does not make a
retroactive release decision.

## Decision

Treat `v0.4.96` as an unauthorized Mainnet distribution. Its Regtest/Testnet4
behavior and its source/build evidence may be evaluated on their own merits,
but neither the package nor its release notes may be cited as Mainnet approval,
certification, or completion of any checklist row. Release-owner action outside
this source change is required to withdraw or clearly qualify the public
Mainnet claim and to disclose the `v0.4.95` tag movement.

Public multi-network/Mainnet packaging now fails closed unless all of these
conditions agree in one clean exact commit:

1. `docs/mainnet-release-authorization.json` has schema version 1, status
   `approved`, the exact 40-character commit being packaged, and an ADR number;
2. the referenced ADR exists, is accepted, and explicitly authorizes public
   Mainnet distribution for that exact commit;
3. the canonical checklist says `Release decision: APPROVED`; and
4. the checklist contains no unchecked item.

The current authorization record remains `blocked` with no commit or ADR. The
internal unsigned/ad-hoc certification builder remains available under ADR
0055 and must keep its non-distribution warnings. The production packager must
check authorization before validation, signing, notarization, or artifact
creation.

Future releases must use immutable release/tag controls and bind release notes,
provenance, SBOM, signatures, and the accepted release ADR to the same commit.
Changing a tag after publication is prohibited; correction uses a new version
and an explicit disclosure rather than moving an existing tag.

## Compatibility and BIP impact

This decision changes release governance and packaging only. It changes no
wallet, profile, registry, database, proposal, backup, credential envelope,
descriptor, transaction, network-selector, or protocol format. Existing data
requires no migration. Bitcoin Improvement Proposal support is unchanged.

## Consequences

The public release path can no longer interpret a green build or a reachable
Mainnet selector as release authorization. A future release-owner decision must
close the evidence first and make a small, reviewable authorization change tied
to the exact candidate. This ADR does not approve Mainnet and does not modify,
sign, notarize, tag, publish, delete, or replace a release.
