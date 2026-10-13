# HWI artifact provenance

The reviewed macOS arm64 certification boundary is Bitcoin Core HWI 3.2.0. Its exact executable, source, and license digests are recorded in `hwi-artifact-manifest-3.2.0-mac-arm64.json`. They were checked against the official release API digests and published checksum payload before the physical Trezor Safe 3 campaign. Run the verifier against the extracted official inputs:

```sh
node scripts/release/verify-hwi-artifact.mjs \
  /absolute/hwi-artifact-manifest-3.2.0-mac-arm64.json /absolute/hwi \
  /absolute/hwi-3.2.0.tar.gz /absolute/LICENSE
```

The verifier streams large-file hashes, rejects symlinks and unbounded inputs, executes only the explicitly supplied regular artifact with a minimal environment and timeout, and requires `--version` to match. HWI may be replaced only inside a signed Groot release. The manifest template and test fixture are not production provenance.

The macOS release builder copies that exact artifact to `Contents/Resources/hwi`. Package verification requires the same digest and version, an executable non-writable mode, HWI code-signature validity, the sealed app signature, and matching pre-1.0 package metadata. Runtime repeats the digest and signature checks before every spawn and never falls back to a system installation. Fresh `2110eaf` unsigned builds independently reproduced the staged HWI digest and complete raw executable evidence as recorded in [`reproducible-mainnet-builds-2026-09-04.md`](reproducible-mainnet-builds-2026-09-04.md). Developer ID signing, notarization, packaged-mainnet verification, independent review, and public-network physical evidence remain release gates; an ad-hoc Testnet4 candidate is not production evidence. See ADR 0039.

For the ADR 0069 GA path, `pnpm release:prepare:signed-hwi` signs the exact
manifest-pinned upstream helper once and emits a generated signed-HWI manifest.
That helper and manifest become immutable public release inputs. Each clean
machine runs `pnpm release:unsigned:multi` against those same inputs so the
post-sign HWI digest compiled into Groot is independently reproducible; signing
the helper after Groot compilation would invalidate the runtime digest binding.
After both Groot evidence sets match and seal, `pnpm
release:package:macos:ga` requires the package's pre-sign executable to equal
the reproduced Groot bytes before it signs the outer app, notarizes, staples,
and emits final SBOM/provenance evidence. The HWI entitlement never transfers
to Groot.

For the exact notarized v0.4.91 Testnet4 package at commit `0849375d`, the manifest-pinned reviewed input was copied and then Developer ID signed before Groot was compiled. Signing changed the bundled helper digest to `b7d4738efeda332766c90d3ad42786082dffdc46fb24915e5b20693e202ce464`; that post-sign digest is the value compiled into this Groot executable. The helper has hardened runtime, a secure timestamp, and the same signing team as Groot. Its explicitly approved `com.apple.security.cs.disable-library-validation` entitlement is limited to HWI because the reviewed PyInstaller one-file executable extracts its embedded Python runtime before loading it. Groot itself has no such entitlement. The stapled package passes Apple notarization, Gatekeeper, deep strict code-signature verification, and a packaged HWI version launch. The same exact package used its bundled helper with a previously certified signer for matching Testnet4 transaction review, valid hardware signing, accepted broadcast, confirmation, full app restart, sync, and persisted accounting. The sanitized record retains no wallet, signer, transaction, address, or node identifier. This records one Testnet4 package, not independent reproducibility, complete physical signed-candidate certification, or mainnet approval.
