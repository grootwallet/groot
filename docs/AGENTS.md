# Documentation agent guide

This file extends the root `AGENTS.md` for `docs/`.

- `product-spec.md` owns user behavior; `architecture.md` owns boundaries; `flows.md` owns state transitions; `implementation-status.md` separates fixtures from wired Rust behavior.
- ADRs are append-only. Supersede an accepted decision explicitly instead of rewriting its history.
- Claims require evidence. Say browser fixture, Rust unit, regtest integration, physical device, or external review precisely.
- Mainnet, hardware support, secure erasure, privacy, and mobile support must never be implied from simulator coverage.
- Update testing traceability and release blockers in the same change as code.
- Keep `agent-harness.md` accurate when scripts, pinned runtimes, CI, issue
  handling, process ownership, or hardware-certification status changes.
- GitHub issue state is live evidence. Verify it before repeating an open/closed
  claim, and do not treat issue state as implementation or certification proof.
- Examples must use disposable fixtures and must never encourage users to paste real secrets into logs, issues, screenshots, or web demos.
