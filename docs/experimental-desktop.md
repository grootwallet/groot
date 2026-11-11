# Internal Windows/Linux desktop candidates

The [cross-platform workflow](../.github/workflows/experimental-desktop.yml)
builds unsigned `0.5.4-rc01` Testnet4-only packages on native GitHub-hosted
Windows Server 2025 x86-64 and Ubuntu 24.04 x86-64 runners. It produces MSI/NSIS installers and
an Ubuntu DEB with SBOM, source commit, build facts and SHA-256 evidence. Windows
Installer requires a numeric prerelease identifier, so the MSI/NSIS package
metadata uses `0.5.4-1`; Groot's visible candidate identity and evidence remain
`0.5.4-rc01`.

Each build downloads the official HWI 3.2.0 platform archive and source,
verifies the published archive and inner-executable hashes, and extracts the
one-file executable into Groot's sealed fast runtime. Build probes load every
included signer driver without opening USB. Runtime verifies the exact bundled
executable and complete extracted manifest and never searches PATH or falls
back to a system HWI.

Both native hosts wait on the protected GitHub Environment
`internal-candidate-approval`. Its required reviewer accepts the exact run
commit outside the candidate before either package job starts. Checkout is
detached at that commit; the shared builder compares every tracked blob with
it, records the commit tree and complete tracked-source digest, then runs the
focused internal policy gate while preserving the separate public-release
approval stop. Git source redirection, replacement objects, hidden local Vite
environment files, tracked symlinks and inherited frontend overrides fail
closed. Strict object-graph verification also rejects Git objects whose bytes
do not match their IDs. A branch push may create a pending run, but it cannot
upload an accepted package before this external approval.

After the package directory is complete, the commit-pinned GitHub attestation
action signs every output file's digest before upload. Downloaded installers
are accepted only after this command verifies the exact commit, workflow,
GitHub-hosted runner and the signed protected-Environment certificate fields:

```sh
node scripts/release/verify-internal-artifact-attestation.mjs /absolute/installer FULL_40_CHARACTER_COMMIT
```

Use GitHub CLI 2.102.0 or newer. A matching checksum or candidate-authored
`BUILD-INFO` alone does not prove that the required reviewer approved the
build. Artifact names, digests and build identity are public attestation
metadata; package bytes remain in the 14-day Actions artifact.

The focused policy digest inventory catches known semantic drift; it is not a
complete source-authorization root. Exact-commit review includes workflow,
package-manager, Vite/Svelte/Tauri, native build and release-control changes.
Post-build checks detect persistent accidental drift and do not claim to
sandbox build code in an already accepted commit. ADR 0109 owns this boundary.

These packages use a separate application identity and Testnet4 only. Windows
does not guess the unverified WebUSB controller mapping used by some Trezors.
Recovery-word verification and native recovery entry remain unavailable on
these platforms. Packages are unsigned internal owner-test artifacts and expire
from Actions after 14 days. Compile success does not establish platform or
physical-device certification. Follow
[the human test](testing/0.5.4-cross-platform-hardware.md) and record exact
model, firmware, transport, reject/retry, signing and restart results.

Final v0.5.4, Mainnet, public upload, installer signing and update metadata
remain blocked pending a separate release decision, independent review and the
physical certification matrix. ADRs 0106/0109 record this boundary.
