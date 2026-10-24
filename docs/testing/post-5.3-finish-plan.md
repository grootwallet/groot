# Post-5.3 finishing plan

Approved by the owner on 2026-10-24 after two external reviews of the 81% completion assessment. This plan closes the remaining evidence, approval, physical-test and release work without broadening wallet behavior.

## Decisions

- Keep the current Testnet4 phone fee behavior. A new fee threshold or confirmation rule is a separate product-policy change; this cleanup will not invent one.
- Close package-size work for this milestone as measured with no safe reduction accepted. Hardware support is the dominant attributed size and will not be removed. Further dependency/runtime reduction is separate work.
- Preserve ASan, parser checks and protocol limits while diagnosing the UR-composition memory cap.
- Do not refresh approved-source hashes, merge, package or release until the applicable gates below pass.

## Phase 1 — Correct and freeze the evidence

1. State that the release verifier reports the first of nine divergent pinned sources, then list all nine and their reasons.
2. Audit every changed/new unpinned runtime and release-tooling source. Recommend additions to the approval map and record explicit exclusions.
3. Separate existing, added and missing/physical tests in the operation inventory.
4. Reconcile diagnostic versus clean coverage labels and state that the native-read performance result uses repeated paired samples without a formal significance test.
5. Persist independent review of the UR failure characterization.
6. Reverify the durable branch-recovery bundle, its two SHA-256 entries and complete-history status.

## Phase 2 — Resolve the UR-composition campaign

Repeat the saved-input stabilization first. Run a fresh copy of the corpus with ASan, the existing parser checks and memory telemetry that distinguishes current from peak RSS and records corpus/allocator growth.

The outcome is chosen from these predefined branches:

1. **Fuzzer/sanitizer overhead dominates:** document the attribution, change only the campaign memory allowance in a separate reviewed tooling commit, and complete a new two-hour campaign.
2. **Sequence-dependent parser growth exists:** minimize the input, fix the parser, preserve the input as an ordinary regression and rerun every affected check.
3. **Evidence remains inconclusive:** keep the campaign failed and stop before source approval.

An independent reviewer must approve the diagnosis and any change. A quiet campaign is bounded evidence, not proof of security.

## Phase 3 — Freeze and review the final source

After the UR outcome, freeze one exact candidate. Produce the complete release-to-candidate and pin-map inventories. Run formatting, strict Clippy, native tests, clean whole-library/Core coverage, frontend checks/tests/coverage, browser acceptance, SBOM, production build and the bounded fuzz campaigns on that exact source. Obtain an independent exact-diff review.

## Phase 4 — Physical acceptance

Test the exact frozen candidate on Testnet4 using the existing checklist: phone pairing/rejection/retry/restart/signing/recovery, QR capacity and practical camera behavior, plus the supported Miniscript candidate matrix by exact model, firmware and transport. Confirm that phone pairing remains standard multisig only and unsupported delayed-policy combinations remain blocked. Repeat affected physical tests if runtime source changes.

## Phase 5 — Approval and release

After technical and physical acceptance, create one approval-only commit that updates reviewed hashes and adds the approved new pin-map entries. It must contain no application behavior. Rerun the complete aggregate, final browser/package checks, SBOM and provenance. Merge, sign, notarize and release only on the owner's explicit instruction.

## Completion rule

The milestone reaches 100% only after the UR campaign, final-source review, physical acceptance, source approval, aggregate validation and exact package verification pass. Documentation corrections or a raised fuzz limit alone cannot make it complete.
