# Pre-mainnet interoperability security review — 2026-08-05

Status: internal implementation and hardening review complete for the regtest build. This is not an independent audit, physical hardware certification, reproducible-build attestation, or mainnet authorization.

## Scope

This pass reviewed the new public BIP129/BSMS descriptor-record boundary, Blockchain Commons UR v2 `crypto-psbt` transport, RBF and CPFP proposal construction, birthday/gap-limit recovery controls, direct TLS and Tor-routed Bitcoin Core RPC, release-evidence scripts, and their Svelte/WalletPort integration. The previous 2026-08-04 review remains historical evidence for the broader wallet boundary.

## Security conclusions

- BSMS import/export is deliberately limited to bounded public four-line records. It rejects private material, unsupported path restrictions, malformed public descriptors, mismatched internal branches, ambiguous first-address whitespace, and first-address mismatches. Encrypted BIP129 coordinator/signer rounds are not claimed.
- UR transport accepts only bounded `crypto-psbt` data, canonical CBOR byte strings, valid Bytewords/fountain frames, and PSBT magic. It bounds payload, fragment, frame, and frame-count resources and handles duplicate/out-of-order multipart input.
- RBF and CPFP generate ordinary persisted PSBT proposals. They reuse exact transaction review, descriptor identity, signature merge, credential, finalization, broadcast-txid, and durable-notification checks.
- Recovery controls persist bounded birthday and gap-limit values. Full rescan is credential authenticated. A clean wallet recovered the same real regtest balance and history with a lookahead of 50.
- Direct Core HTTP/HTTPS uses the explicitly constructed rustls-backed minreq transport. The reviewed `jsonrpc` proxy feature otherwise redirects its legacy simple transport through the default Tor port globally; an initial live-regtest failure exposed this behavior. Satchel now constructs SOCKS only for an explicit `.onion` backend with a validated loopback proxy.
- Remote direct endpoints reject cleartext non-loopback transport and URL credentials. Onion endpoints require explicit loopback SOCKS5. RPC passwords remain encrypted per wallet and are cleared with the wallet session.
- Release helpers refuse a dirty tree, use locked dependency installation, preserve hashes/toolchain metadata, compare independent unsigned artifacts, and verify macOS signing/notarization. They do not manufacture reproducibility or signing evidence; two clean machines and release credentials are still required.

## Automated evidence

- `pnpm validate`: green; architecture and mainnet gates pass, Svelte reports zero errors/warnings, 25 frontend unit tests pass, and the production build succeeds.
- Frontend security/product policy coverage: 100% statements, branches, functions, and lines.
- Rust library unit tests: 98 passed, zero failed.
- Scoped Rust security-core coverage: 99.56% lines, 100% functions, 97.13% regions. The scope and exclusions are defined in `package.json` and `docs/testing.md`; this is not whole-crate coverage.
- Strict Rust formatting and Clippy with warnings denied: green.
- Playwright: 61 passed across desktop Chromium and mobile WebKit; one desktop duplicate is intentionally skipped.
- Live Bitcoin Core regtest: fresh 2-of-3 funding, signing, finalization, broadcast, confirmation, RBF replacement, CPFP child/package broadcast, mining, and clean-wallet recovery pass.
- Production dependency audit: `pnpm audit --prod --audit-level=high` reported no known vulnerabilities. RustSec remains required in CI; `cargo-audit` was not installed opportunistically on this workstation.

## Evidence still requiring the user or an independent party

1. Complete one signed hardware-certification report per supported model/firmware/host combination using `docs/hardware-certification-template.md`.
2. Exercise real camera, display-address, cancellation, rejection, reconnect, wrong-device, changed-PSBT, and concurrent companion-app cases.
3. Run direct TLS and Tor RPC against user-controlled remote Core endpoints and retain redacted server/client evidence.
4. Produce matching unsigned artifacts on two independent clean machines, then sign, notarize, staple, and independently verify the package.
5. Commission the external review described by `docs/external-security-review-brief.md` and remediate its findings.

Mainnet remains compile-time blocked by ADR 0012 and the canonical release checklist. No coverage score or internal test result supersedes these gates.
