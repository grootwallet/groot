# v0.5.4 public release checklist

Release version: 0.5.4
Release tag: v0.5.4
Release decision: PENDING

This checklist applies only to final `v0.5.4`. Historical release approvals do
not satisfy it. The production packager separately requires the annotated tag,
fresh `origin/main`, and packaged `HEAD` to resolve to the same commit.

The existing production path packages macOS Apple silicon. Windows and Linux
remain unsigned, internal Testnet4-only candidates until a separate decision
adds production signing, package/update verification, review, and physical
evidence. This checklist does not predeclare the final platform scope.

- [ ] The exact final source and release diff are independently reviewed.
- [ ] The v0.5.4 authorization ADR and source-policy snapshot are accepted.
- [ ] Reproducible release evidence and the signed HWI runtime are sealed.
- [ ] The supported wallet, network, and physical-signer matrix passes on the internal candidate.
- [ ] The release owner records the decision to produce the signed candidate in this checklist.

After producing the signed candidate, verify the installer, SBOM, provenance,
updater manifest and signature. Test install and restart on each approved
production platform, and run the [v5.3.0 manual upgrade and rollback rehearsal](release-update-rollback.md#manual-macos-upgrade-from-v530)
with the signed candidate before publishing it. Release notes must explain the
manual upgrade and state which platforms and signers passed testing.
