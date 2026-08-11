# HWI artifact provenance

The first packaged HWI component must have an exact version, executable, matching source archive, and license file. Copy `hwi-artifact-manifest.example.json`, replace every placeholder with real release inputs and SHA-256 digests, then run:

```sh
node scripts/release/verify-hwi-artifact.mjs \
  /absolute/hwi-provenance.json /absolute/hwi \
  /absolute/hwi-source.tar.gz /absolute/LICENSE
```

The verifier streams large-file hashes, rejects symlinks and unbounded inputs, executes only the explicitly supplied regular artifact with a minimal environment and timeout, and requires `--version` to match. HWI may be replaced only inside a signed Groot release. The manifest template and test fixture are not production provenance; the checklist stays open until the actual packaged inputs verify and are reviewed.
