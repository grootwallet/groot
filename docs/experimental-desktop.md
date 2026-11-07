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

Both native hosts must pass the exact reviewed internal source snapshot while
preserving the separate public-release approval stop. The shared package
builder repeats that gate after rejecting a dirty checkout and before staging
or compiling, so a failed Linux job cannot leave an independently uploadable
Windows candidate and a direct builder invocation has the same boundary.

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
physical certification matrix. ADR 0106 records this boundary.
