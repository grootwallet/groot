# Internal Windows/Linux desktop candidates

The [cross-platform workflow](../.github/workflows/experimental-desktop.yml)
builds unsigned `5.4.0-rc01` Testnet4-only packages on native GitHub-hosted
Windows Server 2025 x86-64 and Ubuntu 24.04 x86-64 runners. It produces MSI/NSIS installers and
DEB/AppImage packages with SBOM, source commit, build facts and SHA-256 evidence.

Each build downloads the official HWI 3.2.0 platform archive and source,
verifies the published archive and inner-executable hashes, and extracts the
one-file executable into Groot's sealed fast runtime. Build probes load every
included signer driver without opening USB. Runtime verifies the exact bundled
executable and complete extracted manifest and never searches PATH or falls
back to a system HWI.

These packages use a separate application identity and Testnet4 only. Windows
does not guess the unverified WebUSB controller mapping used by some Trezors.
Recovery-word verification and native recovery entry remain unavailable on
these platforms. Packages are unsigned internal owner-test artifacts and expire
from Actions after 14 days. Compile success does not establish platform or
physical-device certification. Follow
[the human test](testing/5.4.0-cross-platform-hardware.md) and record exact
model, firmware, transport, reject/retry, signing and restart results.

Final v5.4.0, Mainnet, public upload, installer signing and update metadata
remain blocked pending a separate release decision, independent review and the
physical certification matrix. ADR 0106 records this boundary.
