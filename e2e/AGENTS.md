# End-to-end test agent guide

This file extends the root `AGENTS.md` for `e2e/`.

- Every visible flow gets one happy path and its meaningful validation, offline, cancellation, wrong-credential, and retry paths.
- Run each relevant scenario in desktop 1180×780 and mobile 390×844. Assert no horizontal overflow where identifiers or grids changed.
- Prefer roles, labels, and durable user-visible results over CSS selectors. A failing accessibility locator is product feedback.
- Browser fixtures prove UI orchestration only. Never describe them as BDK, HWI, persistence, broadcast, or physical-device evidence.
- Do not put real addresses, xpubs, fingerprints, PSBTs, credentials, or recovery words in committed tests. Use visibly synthetic deterministic fixtures.
- E2E should validate integration, not duplicate every pure edge case. Unit tests own combinatorial policy coverage; Rust integration owns Bitcoin transaction truth.
