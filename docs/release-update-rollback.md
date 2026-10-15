# Signed update and rollback procedure

Groot can discover stable GitHub releases and prepare verified installers through Rust (ADR 0086). There is no automatic installation. The release owner independently verified and supplied the v5.2.0 Ed25519 public key before the final source freeze. Its raw encoding is pinned in `release-update-key.hex`, and the corresponding PEM is retained in `release-update-key.pem` for offline verification. Offline and native verification share schema-v1 exact-byte Ed25519 manifests.

## Produce and verify

1. Build from the exact reviewed commit and compare unsigned hashes on two clean machines. For v5.2.0 only, ADR 0088 permits two clean source checkouts with separate fresh Cargo homes, targets and pnpm stores on the same Mac; label the evidence same-machine reproduction and do not claim host independence.
2. Sign/notarize the platform package and retain its freshly generated SBOM and provenance attestation. The SBOM must name the exact commit and lockfile digests and embed the packaged executable's SHA-256; it is release evidence, not a committed source file.
3. Create the bounded schema-v1 JSON manifest accepted by `verify-update-bundle.mjs`. It binds product, stable channel, exact semantic version, full commit, artifact basename, SHA-256, minimum supported version, and explicit rollback allowlist.
4. Sign the exact manifest bytes with the offline Ed25519 release key. Publish the artifact, manifest and detached signature through authenticated release infrastructure. Verify the public key independently and pin it in source before building the client; never trust a public key fetched beside its artifact.
5. Before distribution, run the verifier with absolute paths. It rejects symlinks, unbounded/empty inputs, schema expansion, artifact substitution, digest mismatch, and invalid signatures.

```sh
node scripts/release/verify-update-bundle.mjs \
  /absolute/update.json /absolute/Groot.dmg /absolute/update.sig /absolute/public.pem
```

## Rollback

Rollback is never silent. It is allowed only to a version named in the signed manifest, whose artifact and database compatibility are reverified from a clean copy. Preserve the original user data, never downgrade it in place without a tested migration path, and explain why the rollback is required. A signing-key or updater compromise requires incident response and a new trust decision, not a manifest generated with the suspected key.

The disposable verifier regression is `pnpm release:test:update`. Actual update/signing, notarization, key custody, and rollback drills remain release blockers.

## Native asset contract

Use `Groot-VERSION-macos-arm64.dmg`, `Groot-VERSION-windows-x64.msi` or `Groot-VERSION-linux-x64.deb`. Each has `FILENAME.update.json` and `FILENAME.update.sig` (raw 64-byte signature), uploaded to the exact `grootwallet/groot` tag. The signed manifest's `artifact` matches the basename and its stable `version` matches the tag; `minimumSupportedVersion` must admit the installed client. The trusted key is raw 32-byte hex in `docs/release-update-key.hex`; offline tools accept `docs/release-update-key.pem`. OpenPGP tag signing and Developer ID are independent.

Release checks are opt-in once daily while active, manual otherwise. GitHub sees IP address and app version. Rate-limit failures wait an hour, with no automatic immediate retries. Reveal never launches an installer. Cache files last until next preparation/restart; copy them if keeping them for later.
