# 5.2.0 security diff review

Status: **complete for the v5.2.0 GA source freeze**

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

A final focused GPT-5.6 Sol review covers the owner-supplied Ed25519 public key,
its native activation and tests, the OpenPGP public-key record, release notes,
and the refreshed mainnet source-policy snapshot. Codex Security scan
`dac2771a-36f3-4028-9bae-0056f46e988b` sealed with no findings; the reviewer
then manually rechecked the small wording and key-pair-policy follow-ups. The
public PEM and raw key match, only public verification material is committed,
update verification continues to fail closed, and the change has no BIP or
persisted-data-format impact.

Verification completed for this remediation:

- all 12 native label-interchange tests;
- 14 desktop/mobile focused browser tests, including delayed and failed backend
  classification plus retry;
- Svelte diagnostics; and
- 16 localization/error-contract unit tests.

This record establishes source-review evidence and the corresponding final-source
hash pinning. It does not replace complete validation, unsigned reproduction,
Apple signing, notarization, update-manifest signing, tag signing or public-asset
verification.
