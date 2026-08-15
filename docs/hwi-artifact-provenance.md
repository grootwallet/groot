# HWI artifact provenance

The reviewed macOS arm64 certification boundary is Bitcoin Core HWI 3.2.0. Its exact executable, source, and license digests are recorded in `hwi-artifact-manifest-3.2.0-mac-arm64.json`. They were checked against the official release API digests and published checksum payload before the physical Trezor Safe 3 campaign. Run the verifier against the extracted official inputs:

```sh
node scripts/release/verify-hwi-artifact.mjs \
  /absolute/hwi-artifact-manifest-3.2.0-mac-arm64.json /absolute/hwi \
  /absolute/hwi-3.2.0.tar.gz /absolute/LICENSE
```

The verifier streams large-file hashes, rejects symlinks and unbounded inputs, executes only the explicitly supplied regular artifact with a minimal environment and timeout, and requires `--version` to match. HWI may be replaced only inside a signed Groot release. The manifest template and test fixture are not production provenance. The recorded macOS inputs establish the reviewed physical-certification boundary; reproducible packaging, independent signature review, root-owned release installation, and public-network evidence remain release gates.
