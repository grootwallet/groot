# Security hardening decision queue — 2026-10-04

No item below is implemented. Each changes product/runtime behavior and requires
explicit owner approval. Findings rejected as false positives are excluded.

1. Add global managed-gateway enrollment quotas and admission controls.
2. Run canonical wallet-prevout binding immediately before external-signer and multisig broadcast.
3. Bind software-wallet signing to the exact PSBT bytes shown in the final review.
4. Hold derived `Xpriv` values in zeroizing containers where the dependency permits it.
5. Reject or visibly escape bidi, zero-width, and control characters in permanent labels.
6. Move acceleration preparation onto the blocking worker pool and add latency limits.
7. Define separate minimum policies for new software passphrases, exact historical recovery passphrases, and metadata-only app PINs.
8. Replace private-file check-then-open sequences with descriptor/handle-based safe opens.
9. Sanitize or structurally construct hidden-WebKit PDF markup instead of assigning `innerHTML`.
10. Add navigation interception and narrow Tauri commands by window where practical.
11. Remove the multi-network `/tmp` data-root override from release builds, or require current-user ownership and mode `0700`.
12. Decide whether automatically selected coins must have confirmations.
13. Decide whether uncertified future witness versions may be payment destinations.
14. Add an overall sync deadline in addition to per-request backend timeouts.
15. Bind envelope AAD to wallet identity in a new persisted format with an approved migration.
16. Upgrade advisory-affected development dependencies and separately review RustSec maintenance warnings.
17. Reconsider ADR 0078's in-webview credential/final-approval decision, such as native confirmation above a Mainnet threshold.
18. Reconsider ADR 0078's user-controlled screenshot policy for seed/recovery windows.
19. Replace the accepted restart-plus-clock cooldown residual only if a trustworthy cross-restart time source is selected.
20. Add independent header/proof-of-work validation instead of treating the configured Core backend as authoritative.
21. Change the explicit fee-rate ceiling only if product policy selects a different bound.
22. Add extra frontend validation only for UX; Rust remains authoritative.

Items 17–22 are accepted-risk or product-policy alternatives, not demonstrated
bypasses. Item 15 is a persisted-format change and additionally requires the
migration-versus-discard decision required by `AGENTS.md`.
