## What changed

<!-- Outcome and user-visible behavior. -->

## Invariants affected

<!-- Link product-spec section and ADRs. Say “none” only after checking. -->

## Verification

- [ ] `pnpm validate`
- [ ] `pnpm test:full` or the documented reason each extended suite is not applicable
- [ ] Architecture and mainnet release guards pass
- [ ] `pnpm test:e2e` (if a user flow changed)
- [ ] Rust fmt, strict Clippy, and tests (if `src-tauri` changed)
- [ ] Desktop 1180×780 checked (if UI changed)
- [ ] Mobile 390×844 checked (if UI changed)
- [ ] Wrong credential and offline/error states checked (if wallet flow changed)
- [ ] No secret or sensitive payload added to logs, fixtures, screenshots, or analytics
- [ ] Product spec / ADR updated when behavior or architecture changed
- [ ] Implementation status and flow/design documentation updated when applicable
- [ ] BIP support matrix updated, or this change explicitly has no BIP impact
- [ ] Fixture, simulator, integration, physical-device, and production claims are labeled precisely
- [ ] Referenced GitHub issue state was checked live; no issue mutation was performed without authorization
- [ ] Hardware worksheet, sanitized report, and canonical matrix agree (if hardware evidence changed)
- [ ] New dependencies are necessary, pinned/locked, licensed, and security-reviewed

## Evidence

<!-- Tests, screenshots, or concise manual steps. Never attach real wallet secrets. -->
