# Signed update and rollback procedure

Groot currently has no in-app updater and mainnet remains disabled. This procedure defines offline release evidence; it does not enable automatic installation.

## Produce and verify

1. Build from the exact reviewed commit and compare unsigned hashes on two clean machines.
2. Sign/notarize the platform package and retain its freshly generated SBOM and provenance attestation. The SBOM must name the exact commit and lockfile digests and embed the packaged executable's SHA-256; it is release evidence, not a committed source file.
3. Create the bounded schema-v1 JSON manifest accepted by `verify-update-bundle.mjs`. It binds product, stable channel, exact semantic version, full commit, artifact basename, SHA-256, minimum supported version, and explicit rollback allowlist.
4. Sign the exact manifest bytes with the offline Ed25519 release key. Publish the artifact, manifest, detached signature, and pinned public key through authenticated release infrastructure.
5. Before distribution, run the verifier with absolute paths. It rejects symlinks, unbounded/empty inputs, schema expansion, artifact substitution, digest mismatch, and invalid signatures.

```sh
node scripts/release/verify-update-bundle.mjs \
  /absolute/update.json /absolute/Groot.dmg /absolute/update.sig /absolute/public.pem
```

## Rollback

Rollback is never silent. It is allowed only to a version named in the signed manifest, whose artifact and database compatibility are reverified from a clean copy. Preserve the original user data, never downgrade it in place without a tested migration path, and explain why the rollback is required. A signing-key or updater compromise requires incident response and a new trust decision, not a manifest generated with the suspected key.

The disposable verifier regression is `pnpm release:test:update`. Actual update/signing, notarization, key custody, and rollback drills remain release blockers.
