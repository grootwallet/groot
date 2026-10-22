# ADR 0092: Numbered 5.3 release candidates

- Status: accepted for internal candidate naming only
- Date: 2026-10-18
- Extends: ADR 0087

The owner requested the next desktop test build to identify itself as `5.3.0-rc1`, with subsequent candidates numbered `rc2`, `rc3`, and so on. The shared naming rule admits exactly `5.3.0-rcN` for positive integers without leading zeroes, while retaining the existing accepted release lines. Package, Cargo, Tauri, frontend and target-specific SBOM identities must agree.

This is a version decision for private regression candidates. It does not authorize `5.3.0` GA, a public tag, publication, Mainnet/mobile certification, source-policy pin updates or production signing. ADR 0088's public 5.2 authorization remains bound to 5.2 only. The public authorizer continues rejecting prerelease versions; reviewed source pins and all other gates remain unchanged.

No wallet/profile/registry/credential/backup/proposal format changes, migrations, dependency updates or BIP impact. The existing isolated iPhone build remains the previously tested 5.2-labelled development artifact until a later explicit device update; changing source version does not relabel installed artifacts.
