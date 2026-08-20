# HWI artifact provenance

The reviewed macOS arm64 certification boundary is Bitcoin Core HWI 3.2.0. Its exact executable, source, and license digests are recorded in `hwi-artifact-manifest-3.2.0-mac-arm64.json`. They were checked against the official release API digests and published checksum payload before the physical Trezor Safe 3 campaign. Run the verifier against the extracted official inputs:

```sh
node scripts/release/verify-hwi-artifact.mjs \
  /absolute/hwi-artifact-manifest-3.2.0-mac-arm64.json /absolute/hwi \
  /absolute/hwi-3.2.0.tar.gz /absolute/LICENSE
```

The verifier streams large-file hashes, rejects symlinks and unbounded inputs, executes only the explicitly supplied regular artifact with a minimal environment and timeout, and requires `--version` to match. HWI may be replaced only inside a signed Groot release. The manifest template and test fixture are not production provenance.

The macOS release builder copies that exact artifact to `Contents/Resources/hwi`. Package verification requires the same digest and version, an executable non-writable mode, HWI code-signature validity, the sealed app signature, and matching pre-1.0 package metadata. Runtime repeats the digest and signature checks before every spawn and never falls back to a system installation. Developer ID signing, notarization, reproducibility, independent review, and public-network physical evidence remain release gates; an ad-hoc Testnet4 candidate is not production evidence. See ADR 0039.
