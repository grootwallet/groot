# Signed update and rollback procedure

Groot can discover stable GitHub releases and prepare verified installers through Rust (ADR 0086). There is no automatic installation. The release owner independently verified and supplied the v5.2.0 Ed25519 public key before the final source freeze. Its raw encoding is pinned in `release-update-key.hex`, and the corresponding PEM is retained in `release-update-key.pem` for offline verification. Offline and native verification share schema-v1 exact-byte Ed25519 manifests.

## Produce and verify

1. Build from the exact reviewed commit and compare unsigned hashes on two clean machines. For v5.2.0 and v5.3.0 only, ADRs 0088 and 0105 respectively permit two clean source checkouts with separate fresh Cargo homes, targets and pnpm stores on the same Mac; label the evidence same-machine reproduction and do not claim host independence.
2. Sign/notarize the platform package and retain its freshly generated SBOM and provenance attestation. The SBOM must name the exact commit and lockfile digests and embed the packaged executable's SHA-256; it is release evidence, not a committed source file.
3. Generate the bounded schema-v1 JSON manifest from the final installer bytes with `generate-update-manifest.mjs`. It binds the stable version, full commit, installer basename, SHA-256 and the minimum supported client version. The generator starts with an empty rollback allowlist. Add a rollback entry only after its rehearsal and approval, before signing.
4. Sign the exact manifest bytes with the offline Ed25519 release key. Publish the artifact, manifest and detached signature through authenticated release infrastructure. Verify the public key independently and pin it in source before building the client; never trust a public key fetched beside its artifact.
5. Before distribution, run the verifier with absolute paths. It rejects symlinks, unbounded/empty inputs, schema expansion, artifact substitution, digest mismatch, and invalid signatures.

```sh
groot_installer=/absolute/Groot-0.5.4-macos-arm64.dmg
groot_commit=FULL_REVIEWED_COMMIT
node scripts/release/generate-update-manifest.mjs \
  "$groot_installer" 0.5.4 "$groot_commit" 0.5.3 > "$groot_installer.update.json"

# Run signing on the offline release-signing machine.
openssl pkeyutl -sign -rawin -inkey /absolute/offline-release-signing-key.pem \
  -in "$groot_installer.update.json" -out "$groot_installer.update.sig"
test "$(wc -c < "$groot_installer.update.sig")" -eq 64

node scripts/release/verify-update-bundle.mjs \
  "$groot_installer.update.json" "$groot_installer" "$groot_installer.update.sig" \
  /absolute/verified-release-update-public-key.pem
```

## Version-number transition

Historical `v5.3.0` clients use ordinary semantic-version ordering and therefore do not offer `v0.5.4` as a newer release. [ADR 0107](adr/0107-restore-pre-1-0-versioning.md) requires an explicitly approved and tested bridge release or a documented manual-upgrade procedure before public `v0.5.4` distribution. Do not weaken the general update comparison or present this exceptional numbering correction as a silent rollback.

For the v0.5.4 manifest, a minimum of `0.5.3` admits both `5.3.0` and `0.5.4`
under the updater's raw SemVer floor comparison. Old clients still need the
manual upgrade below because their release discovery uses the old numbering.

Starting with the restored line, update comparison maps only the historical
`5.2.0` and `5.3.0` identities to their intended `0.5.2` and `0.5.3` ordering.
This blocks replay of those signed historical packages to `0.5.4` clients. Test
both transition directions whenever updater or version policy changes.

### Manual macOS upgrade from v5.3.0

1. Verify each wallet’s recovery backup and quit Groot. Keep a copy of the
   `v5.3.0` app and copy the entire `~/Library/Application Support/app.groot.wallet`
   folder to encrypted backup storage. The full folder includes the network
   selection and every wallet namespace.
2. Get the signed `Groot-0.5.4-macos-arm64.dmg`, manifest, and signature for the
   approved release. Verify them as described in [Produce and verify](#produce-and-verify).
   Mount the DMG and check the mounted `Groot.app` with
   [the macOS package verifier](../scripts/release/verify-macos-package.sh).
   Confirm its bundle identifier is `app.groot.wallet`.
3. Drag `Groot.app` into Applications and choose **Replace**. Leave the app-data
   folder in place. Open Groot, confirm version `0.5.4` and the expected
   network, then unlock and check the wallet list, history, labels, saved
   proposals, and known receive address before resuming use.

Before public distribution, rehearse the sequence on a disposable macOS
installation using an existing `v5.3.0` Testnet4 wallet and the exact signed
release candidate. Record the candidate commit and confirm the expected data
persists after restarting. To rehearse rollback to `v5.3.0` when the signed
manifest allows it, quit, set aside the upgraded app and data, and restore
the verified old app with its complete pre-upgrade folder. Confirm that it
unlocks and shows the original wallet and known receive address. If any wallet
activity occurred after the backup, preserve both copies and reconcile that
activity before using the restored wallet.

## Rollback

Rollback is never silent. It is allowed only to a version named in the signed manifest, whose artifact and database compatibility are reverified from a clean copy. Preserve the original user data, never downgrade it in place without a tested migration path, and explain why the rollback is required. A signing-key or updater compromise requires incident response and a new trust decision, not a manifest generated with the suspected key.

The disposable verifier regression is `pnpm release:test:update`. Actual update/signing, notarization, key custody, and rollback drills remain release blockers.

## Native asset contract

Use `Groot-VERSION-macos-arm64.dmg`, `Groot-VERSION-windows-x64.msi` or `Groot-VERSION-linux-x64.deb`. Each has `FILENAME.update.json` and `FILENAME.update.sig` (raw 64-byte signature), uploaded to the exact `grootwallet/groot` tag. The signed manifest's `artifact` matches the basename and its stable `version` matches the tag; `minimumSupportedVersion` must admit the installed client. The trusted key is raw 32-byte hex in `docs/release-update-key.hex`; offline tools accept `docs/release-update-key.pem`. OpenPGP tag signing and Developer ID are independent.

Release checks are opt-in once daily while active, manual otherwise. GitHub sees IP address and app version. Rate-limit failures wait an hour, with no automatic immediate retries. Reveal never launches an installer. Cache files last until next preparation/restart; copy them if keeping them for later.
