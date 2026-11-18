# macOS camera regression — 2026-11-07

Refs #121; [ADR 0108](../adr/0108-macos-camera-permission-and-package-verification.md). No persisted-format, IPC, dependency, BIP or wallet-validation change.

## Reproduction and correction

Read-only inspection of the installed app and official v5.3.0 ZIP/DMG identified hardened runtime and the camera usage description, with no signed entitlements. The ZIP passed GitHub release attestation verification; both downloads match their published SHA-256. Strict signatures pass outside the restricted sandbox; its initial verification failures are environmental, not release corruption. The production signing command omitted `--entitlements`; the internal QR path already included it. This establishes a packaging defect consistent with the reported unavailable camera, not a complete account of every possible camera failure.

The existing camera-only file now applies to ordinary macOS bundles and explicit production signing. Both package verification paths require the actual signed entitlement and non-empty usage description. Groot still cannot inherit HWI's library-validation exception. The existing QR components share capture startup/error mapping/teardown, with explicit permission and retry for payment scanning too. Decoder settings and native validation are unchanged.

## Verification

Baseline: `0ea17f63`. All checks use an isolated clone and disposable fixtures; installed files and profiles remain untouched.

| Evidence          | Result                                                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend          | 932 tests passed, including 12 camera lifetime/error cases; type checking has no errors or warnings                                                                          |
| macOS signing     | 17 packaging/helper tests passed; a real compiled/signature fixture rejects a missing camera entitlement, accepts camera-only signing and rejects an empty usage description |
| Camera/QR browser | 30 targeted cases and the 16-case extended set passed; the final 18-case camera/audit set passed, including actual bundled decoding from synthetic video on both viewports   |
| Layout            | Denial/retry inspected in light/dark at 1180×780 and 390×844; square preview, focus and retry remain visible                                                                 |
| Build/tooling     | Production frontend build, policy coverage, update/HWI/comparison checks, development launcher and SBOM passed                                                               |
| Validation        | Mandatory `pnpm validate` stops only at the unchanged frozen source-approval check, first reporting `package.json`; downstream stages ran separately                         |

The initial extended run had one fixture failure: it delivered a frame to the stopped decoder immediately after reset. Waiting for the new decoder preserves the frame-count/limit assertions and verifies obsolete callbacks are ignored. The failed run is retained. The pixel fixture initially placed its QR outside the central scan guide; positioning the complete code inside that guide passed without changing production decoding limits. These are browser fixture results, not physical camera evidence. Rust wallet source is unchanged; this campaign does not reuse earlier native-suite results as fresh Rust evidence.

Security/supply-chain review: the entitlement is camera-only, HWI isolation remains enforced, and no dependency, CSP origin, IPC method or secret surface is added. Camera permission and decoder failure details are mapped to fixed localized copy; raw platform errors are not presented or logged. Existing payment/UR bounds and native review still govern imported payloads.

Raw logs, screenshots, signature inspection, commands and source identities remain in ignored local `release-artifacts/macos-camera-2026-11-07/`, with verified evidence checksums. No current-source approval hashes were refreshed. Exact-source review must include the new camera helper and package verifier.

## Remaining acceptance

The installed v5.3.0 app is unchanged. This change is not a replacement installer, public release or physical camera certification. A corrected exact-candidate Groot package must exercise permission grant/denial/retry, a real payment QR and animated PSBT QR, closure while opening, background/resume and camera contention. Keep live wallet and camera identifiers out of evidence. Exact-source approval and release authorization remain separate; do not refresh frozen pins to make development checks pass.
