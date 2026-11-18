# ADR 0108: macOS camera permission and package verification

- Status: Accepted for implementation; release approval remains separate
- Date: 2026-11-07
- Tracking: #121

## Context

The installed public v5.3.0 app has `NSCameraUsageDescription` and hardened runtime, but its signature carries no camera entitlement. Production signing omitted it; the isolated QR builds already used the camera-only entitlement file. Package checks verified signatures and helper isolation without requiring camera access.

Apple requires the usage description and camera entitlement before a hardened-runtime app requests capture. A valid signature and notarization alone do not prove camera availability. See [Apple capture authorization](https://developer.apple.com/documentation/AVFoundation/requesting-authorization-to-capture-and-save-media).

## Decision

Use the existing `Entitlements.camera.plist` for macOS bundling and explicit production signing. Verify the final signature has exactly enabled `com.apple.security.device.camera`, and the sealed Info.plist has a non-empty camera explanation. Reject missing, disabled and extra entitlements before notarization; verify again on the final package. Keep HWI's library-validation exception isolated to HWI.

Both existing QR components share one capture lifecycle. Request video without audio directly from an Allow camera click, preserve platform denial/contention errors, and release permission probes and decoder streams on cancellation. Obsolete callbacks cannot deliver scanned data. Payment strings remain case-exact and bounded; UR types/frame limits and native validation remain unchanged. Keep EN/FR/ES errors, in-place retry and existing manual/file alternatives.

## Security and compatibility review

This grants the intended app camera capability after OS consent; a compromised renderer with prior consent remains a residual camera-access risk. No microphone, screen-capture, library-validation exception, remote decoder, CSP origin or network sink is added. Capture frames stay within the local decoder; QR payloads remain adversarial inputs to existing native validation. No raw platform errors or camera identifiers are logged.

Wallet, registry, credential, backup, proposal and label formats, IPC and bundle identity are unchanged. No migration, reset, dependency update or Mainnet expansion is introduced. Rollback preserves existing profiles. The installed public app and its authorization are not modified; a corrected package needs its own exact-source review and release approval. Existing source pins remain frozen.

## Evidence

[Camera regression record](../testing/macos-camera-2026-11-07.md) separates signature-fixture, unit, browser and physical evidence. Require an actual corrected packaged Groot camera/QR run before claiming native capture certification.
