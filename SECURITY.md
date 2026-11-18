# Security

## Reporting

Use a private GitHub Security Advisory. If unavailable, contact the repository owner privately before sharing technical details. Never put an unpatched vulnerability, recovery words, credential, descriptor/xpub, device identity/path, PSBT or wallet database in a public issue.

Include the affected commit/platform, violated boundary, minimal disposable Regtest reproduction, impact and required attacker access. Redact identifiers and use only the information needed to reproduce the issue.

## Review scope

- Secret isolation, entropy, native recovery UI, credentials and encrypted storage.
- Descriptor/network identity, authoritative PSBT review, signatures, spend eligibility and final broadcast checks.
- Bounded adversarial file/QR/RPC/HWI input, selected-device identity, cancellation and stale-operation rejection.
- Failure-atomic persistence, unsupported-format preservation, session/process isolation and recoverability.
- Network route/privacy, sanitized diagnostics, dependencies, executable provenance and release authorization.

Rust is the trusted wallet boundary; the webview presents public DTOs through WalletPort. Hardware signers never share private keys with Groot. The browser prototype has no production keys or wallet backend. Host compromise and offline guessing of copied encrypted profiles remain explicit limitations.

[Security controls](docs/security-model.md) and the [Mainnet threat model](docs/mainnet-threat-model.md) own detailed requirements. [Engineering standards](docs/engineering-standards.md) own review/supply-chain rules. [Deferred hardening decisions](docs/security-hardening-decision-queue-2026-10-04.md) are not approval to implement policy changes.

## Release and evidence

Public macOS Apple-silicon v5.3.0 was published 2026-10-23 at `6a39bf50b2a6a042354b43369765a9af2174d061` under ADRs 0104/0105. The [checklist](docs/mainnet-release-checklist.md), tracked authorization and exact artifact evidence own release acceptance. This does not certify separate Testnet4 phone or Continuity previews. Later commits, platforms, device/firmware tuples, backend classes and expanded policies require their own applicable evidence and authorization.

Dated review, remediation and certification documents are historical evidence, not the current specification. Frontend fixtures, unit tests and virtual signers do not prove physical support, independent review or public release readiness. Preserve exact-candidate evidence without transferring earlier results to a replacement build.
