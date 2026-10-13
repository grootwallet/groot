# Git release-tag signing key

The release owner supplied the public key in
[`release-git-tag-signing.pub`](release-git-tag-signing.pub) for SSH-signed Git
release tags. This is public verification material only. The private key and
passphrase remain with the release owner and must not be committed.

Before signing a release tag, verify this key's SHA-256 fingerprint with
`ssh-keygen -lf docs/release-git-tag-signing.pub -E sha256` and confirm the
corresponding key is registered as a **Signing Key** on the release owner's
GitHub account. Pin the exact reviewed commit, complete the release checklist,
then create and verify the annotated signed tag. Do not infer artifact or
update-manifest authenticity from a signed Git tag alone.

The supplied key's SHA-256 fingerprint is
`SHA256:j8HmNKPgJTSJXLr0k6K1oiL3a9i/Z9RnoHsCyL5Hhzk` (Ed25519). The release
owner should compare this fingerprint with the local private key's public half
before any tag is signed.

This SSH key does not replace Apple Developer ID signing, notarization, or the
separate offline Ed25519 update-manifest signature described in
[`release-update-rollback.md`](release-update-rollback.md).
