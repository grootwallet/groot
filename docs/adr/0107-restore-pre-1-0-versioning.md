# ADR 0107: Restore pre-1.0 versioning

- Status: accepted
- Date: 2026-11-07
- Supersedes: the 5.4 candidate naming in ADR 0106 only

## Context

Groot is still a pre-1.0 product. The published `v5.3.0` tag and the initial
`5.4.0-rc01` maintenance candidate omitted the intended leading zero. Published
release history must remain immutable, but continuing that numbering would
misstate product maturity and compound the mistake.

## Decision

Restore the pre-1.0 line with internal candidate `0.5.4-rc01` and final release
target `v0.5.4`. Keep historical `v5.3.0` links, evidence and authorization
records unchanged and describe them explicitly as historical.

Windows Installer accepts only numeric prerelease identifiers. The internal
MSI and NSIS package metadata therefore uses `0.5.4-1`; the application,
source package, build facts, SBOM and human-visible candidate identity use
`0.5.4-rc01`.

Released `v5.3.0` clients compare updates with ordinary SemVer and therefore
consider `v0.5.4` older. This metadata correction does not silently alter that
trusted update rule. Before public release, the owner must approve and test an
explicit bridge release or documented manual-upgrade transition. Previously
installed internal `5.4.0-rc01` Windows/Linux packages may likewise reject the
lower technical version; testers uninstall that disposable candidate before
installing `0.5.4-rc01`.

The restored updater orders only the historical `5.2.0` and `5.3.0` lines at
their intended pre-1.0 positions (`0.5.2` and `0.5.3`). This prevents a
`0.5.4` client from presenting an authentic older package as a newer update
while preserving numbered-candidate ordering and normal future SemVer. It does
not retroactively change the updater code already shipped in `v5.3.0`, so the
approved bridge or manual transition remains required.

The isolated iOS Testnet4 development build uses short version `0.5.4` and
monotonic build number `540001`. This does not authorize a public iOS release.

The final `v0.5.4` release still requires its own authorization, review,
platform signing, physical hardware evidence and release checklist. Correcting
the version does not authorize publication.

## Compatibility and standards

Application identifiers, profile locations, wallet databases, credentials,
descriptors, backups, proposals and registries are unchanged. Existing data
requires no wallet migration, although the installer/update transition above
is not automatic. This changes release and build identity only, with no BIP,
transaction, signing, recovery or wire-format impact.
