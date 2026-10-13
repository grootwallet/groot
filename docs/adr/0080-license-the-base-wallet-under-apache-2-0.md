# ADR 0080: License the base wallet under Apache-2.0

- Status: accepted
- Date: 2026-10-03
- Applies to: the Groot base wallet application and repository-authored documentation

## Context

The repository previously had no root license or contribution policy even
though the commercial strategy recommended Apache-2.0 for the consumer wallet.
Git history identifies `Thibaud Marechal <t@thibm.net>` and the `thib` alias
using the same email as the repository's contributor identity. The repository
contains no copyright assignment, contributor license agreement, or evidence
of ownership by a company. Third-party dependencies, vendored source, HWI, and
fonts already carry their own licenses and notices.

## Decision

License the base wallet application and repository-authored documentation under
Apache License 2.0. The root `LICENSE`, `NOTICE`, package manifests, contribution
guidance, generated SBOM metadata, and packaged legal resources express this
decision. Copyright attribution names Thibaud Marechal and contributors; it
does not invent a corporate owner.

This decision does not relicense third-party work. Vendored and bundled
dependencies, HWI, fonts, artwork with a separate notice, and other external
materials retain their applicable terms. The generated target-specific SBOM
and `THIRD_PARTY_NOTICES.md` provide the attribution path.

The Groot name, logo, trade dress, and product identity are not licensed by
Apache-2.0 except for customary attribution allowed by the license.

A future optional self-hostable coordination or network service may use
AGPL-3.0-or-later only after a separate repository/scope decision. Proposed
hosted family, business, enterprise, administration, compliance, support, and
managed-service operations remain outside this base repository and may be
proprietary under their own explicit terms. No such service may be required to
recover or spend from the base wallet.

## Ownership qualification

The source history supports the named individual attribution but is not proof
against an undisclosed employment, contractor, or assignment claim. Before a
third-party contribution campaign, acquisition, or material commercial
relicensing, the release owner must confirm that no earlier agreement assigned
copyright and decide whether a CLA or DCO is needed. No assignment requirement
is introduced by this ADR.

## Compatibility and BIP impact

Licensing and attribution do not change product behavior or any persisted or
interchange format. Existing wallet data remains compatible and no migration is
required. Bitcoin Improvement Proposal support is unchanged.
