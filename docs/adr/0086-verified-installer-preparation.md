# ADR 0086: Verified installer preparation

Status: Accepted for internal implementation; production trust material pending.

## Decision

Reuse the schema-v1 signed update manifest from the offline release verifier. Rust verifies the exact bytes with strict raw Ed25519, then streams and verifies the named installer SHA-256 before exposing an opaque reveal capability. This is download preparation, never automatic replacement, execution, rollback or wallet migration. PGP signatures, SSH-signed Git tags and platform code signing are separate controls and do not substitute for this manifest.

The owner will verify the release public key out of band and commit its 32-byte lowercase hex encoding to `docs/release-update-key.hex`. The file is deliberately empty in rc03; the app fails closed before any installer transfer. Keys are never accepted from GitHub assets, IPC or an environment override. Test-only deterministic keys are disposable fixture material, compiled only into tests. Production publication still requires platform signatures, provenance, independent review and exact-candidate authorization.

Native discovery reads only the public latest-release endpoint for `grootwallet/groot`. It rejects drafts, prereleases, invalid versions and same/older versions, including numerical comparison and rc-to-stable promotion. Candidate availability is untrusted information until verification; it is never a signing or certification claim. Platform installers use exact versioned names, with their own `.update.json` and raw 64-byte `.update.sig` assets. No arbitrary GitHub copy/HTML is rendered.

GitHub checks are opt-in, once per day while the application is active, with a manual check in Updates. First launch stays offline. Explain that GitHub sees IP address and app version, never wallet identity, addresses, descriptors, labels or secrets. There is no authentication/token, telemetry, wallet query, node-route fallback or Tor privacy claim. Rate-limited checks wait one hour before retry; offline errors retain an explicit retry state. Preferences are separate local browser app preferences, not wallet formats.

The API body is capped at 256 KiB; headers at 32 KiB; manifests at 64 KiB; signatures at 64 bytes; installers at 2 GiB and the declared asset size. Requests use native TLS, 20-second I/O deadlines and bounded stream lifetimes. API redirects are rejected. Asset URLs must be exact HTTPS repository/tag/basename URLs; at most one redirect to `release-assets.githubusercontent.com` is accepted without credentials, custom port or fragment. Further redirects fail. SHA-256 verifies actual streamed bytes, independently of GitHub's digest metadata.

Downloads use randomly named private cache stages and create-new files. Cancellation invalidates delivery and cleans partial work. Failed signatures/digests leave no reveal capability. Verified files remain until another preparation or application restart; the user can reveal and copy/install them explicitly. Restart cleans only UUID-named entries in the dedicated updater cache, not profile data.

## Supply-chain review

Add exact `ed25519-dalek` 2.2.0 with default features disabled and only `std`, plus already-locked `semver` 1.0.28. The verifier uses `verify_strict` and rejects weak keys. Dalek has `build = false`, no network/install hooks, BSD-3-Clause terms and safe verifier code. Its new locked graph contains curve25519-dalek 4.1.3, derive 0.1.1, signature 2.2.0, ed25519 2.2.3, const-oid 0.9.6, der 0.7.10, pkcs8 0.10.2, spki 0.7.3 and fiat-crypto 0.2.9; existing dependency versions/checksums are preserved. The macOS serial curve backend build script only selects target/compiler configuration and runs the existing rustc-version probe; it downloads/executes no external payload. The x64 SIMD derive macro still requires inspection on the target runner before distribution. No hazmat, batch verification, private-key persistence or production signing API is used. Native unit fixtures exercise signatures, substitution, bounds, cancellation and full staged preparation. The new orchestration module is explicitly classified in the existing coverage harness.

## Compatibility and evidence

No wallet, registry, secret envelope, proposal or backup format changes. Release notes are baked localized EN/FR/ES copy, with dismissal keyed by exact app version. Existing Modal, Button, WarningNotice and checkbox/form patterns are reused. No BIP support or interoperability changes. Experimental Windows/Linux packages remain Signet-only, without bundled HWI or native recovery-word UI; CI compilation is not physical platform certification. Existing Mainnet source-hash and authorization gates remain intact.

The dispatch-only experimental packaging workflow reuses the existing immutable checkout/setup/toolchain actions and pins official `actions/upload-artifact` v6.0.0 at `b7c566a772e6b6bfb58ed0dc250532a479d7789f`, verified against its upstream tag. Its only upload inputs are explicit installer/SBOM/hash/commit/limitation files in a generated directory, with 14-day retention and read-only repository permissions. It has no PR trigger or release-publishing credentials/step and does not bypass any validation gate.
