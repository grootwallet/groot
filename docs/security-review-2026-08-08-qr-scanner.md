# QR scanner dependency and CSP security review — 2026-08-08

Status: internal supply-chain and boundary review complete for the regtest build. Physical camera certification, independent review, and mainnet authorization remain outstanding.

## Capability and scope

macOS WKWebView does not expose Chromium's `BarcodeDetector`, so the previous signed-PSBT camera action stopped at a fallback message. Satchel now exact-pins `qr-scanner` 1.4.2 to decode QR pixels locally. The package is MIT licensed, has no install lifecycle script, and has one runtime declaration dependency, `@types/offscreencanvas` 2019.7.3. Its published scanner and worker sources are bundled into the application; no remote code or service is used.

## Boundary review

- Camera frames remain inside the WebView and its local decoder worker. The decoder has no expanded network access: `connect-src` remains limited to Tauri IPC.
- CSP now permits workers only from `'self'` and `blob:` so the bundled decoder can run when native `BarcodeDetector` is absent. Script, object, frame, and navigation restrictions are unchanged.
- The UI forwards only unique text beginning with `ur:crypto-psbt/` and retains the 1,024-frame presentation bound.
- Rust remains authoritative. It enforces UR type, frame count and size, canonical CBOR/Bytewords, PSBT magic, exact proposal identity, and signature validity before merging.
- Camera denial or absence is explicit. Signed PSBT file/text import remains available and uses the same Rust verification path.

## Residual risk and required evidence

- The dependency's last npm release is 1.4.2 and is not actively released; the exact version and lockfile integrity must remain reviewable. Replacement or upgrade requires a fresh review.
- A compromised local decoder could observe public PSBT QR pixels or return attacker-controlled text, but it cannot bypass Rust validation or access private signing material. Camera access is limited by the operating-system permission prompt and packaged usage description.
- Real macOS, Windows, Linux, iOS, and Android camera permission, denial/retry, interruption, background/resume, dense animated-QR, and supported-signer interoperability tests remain release blockers. Browser automation is not physical camera certification.
