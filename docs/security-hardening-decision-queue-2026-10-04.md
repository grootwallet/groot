# Security hardening decision queue — 2026-10-04

Owner decision: items 2, 3, 5, 6, 13, and 15 are approved and implemented by
ADR 0081. Item 12 and every other item remain deferred. Findings rejected as
false positives are excluded.

1. Add global managed-gateway enrollment quotas and admission controls.
2. **Implemented:** run canonical wallet-prevout binding immediately before external-signer and multisig broadcast.
3. **Implemented:** bind software-wallet signing to the exact PSBT bytes shown in the final review.
4. Hold derived `Xpriv` values in zeroizing containers where the dependency permits it.
5. **Implemented:** reject bidi, zero-width, and control characters in permanent-payment and signer labels.
6. **Implemented in approved scope:** move acceleration preparation onto the blocking worker pool. New product-level latency limits remain deferred.
7. Define separate minimum policies for new software passphrases, exact historical recovery passphrases, and metadata-only app PINs.
8. Replace private-file check-then-open sequences with descriptor/handle-based safe opens.
9. Sanitize or structurally construct hidden-WebKit PDF markup instead of assigning `innerHTML`.
10. Add navigation interception and narrow Tauri commands by window where practical.
11. Remove the multi-network `/tmp` data-root override from release builds, or require current-user ownership and mode `0700`.
12. **Deferred:** decide whether automatically selected coins must have confirmations.
13. **Implemented:** allow only P2PKH, P2SH, SegWit v0, and Taproot v1 payment destinations; reject P2A and witness v2-v16.
14. Add an overall sync deadline in addition to per-request backend timeouts.
15. **Implemented:** bind envelope AAD to wallet identity and purpose in secure-store v5, with approved automatic failure-atomic v2/v3/v4 migration and accepted downgrade incompatibility.
16. Upgrade advisory-affected development dependencies and separately review RustSec maintenance warnings.
17. Reconsider ADR 0078's in-webview credential/final-approval decision, such as native confirmation above a Mainnet threshold.
18. Reconsider ADR 0078's user-controlled screenshot policy for seed/recovery windows.
19. Replace the accepted restart-plus-clock cooldown residual only if a trustworthy cross-restart time source is selected.
20. Add independent header/proof-of-work validation instead of treating the configured Core backend as authoritative.
21. Change the explicit fee-rate ceiling only if product policy selects a different bound.
22. Add extra frontend validation only for UX; Rust remains authoritative.

Items 17–22 are accepted-risk or product-policy alternatives, not demonstrated
bypasses. ADR 0081 records item 15's approved persisted-format migration.
