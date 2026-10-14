# 5.2.0 security diff review

Status: **complete for reviewed source through `8945f71`**

The managed diff review covered all 71 changed source items from public v0.5.1
commit `c731fa1cc6ce6431662342a007d9ca6bed6abbe6` through GA preparation commit
`5b3cd43ab80216cb93284f7195c515d1febc5c29`. Scan
`ef2934f8-99a5-4015-b76e-470e70504947` sealed with complete coverage and two
reportable findings:

- a wallet-owned high-index BIP329 label could create permanent address state
  requiring a recovery gap above the supported maximum; and
- unresolved or failed backend classification could show the own-node privacy
  disclosure while allowing a managed-network initial scan.

Commit `8945f71` fixes both findings without changing wallet, profile, backup,
descriptor or database formats. Label import now compares the complete
prospective gap with the pre-import state and rolls back a newly enlarged gap
above 1,000 before BDK persistence or SQLite commit. Initial-history consent now
uses loading, managed, private and error states; approval remains disabled until
classification succeeds, failed classification has an inline retry, and stale
results are rejected by wallet identity plus lookup generation.

A separate focused review used GPT-5.6 Sol at high reasoning effort against the
exact working diff later committed as `8945f71` and reported no findings. It
confirmed the atomic boundary, legacy-state compatibility, selected-wallet
recheck and asynchronous generation guards.

Verification completed for this remediation:

- all 12 native label-interchange tests;
- 14 desktop/mobile focused browser tests, including delayed and failed backend
  classification plus retry;
- Svelte diagnostics; and
- 16 localization/error-contract unit tests.

This record establishes source-review evidence. It does not replace final-source
hash pinning, complete validation, unsigned reproduction, Apple signing,
notarization, update-manifest signing, tag signing or public-asset verification.
