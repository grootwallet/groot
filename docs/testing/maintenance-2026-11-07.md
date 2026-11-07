# Maintenance verification — 2026-11-07

Refs #121. This campaign preserves wallet, registry, credential, backup, label and proposal formats, WalletPort/IPC contracts and current platform gates. BIP impact: none. It authorizes no migration, Mainnet expansion or release.

## Changes

- Settings action lifetimes have one route-local owner. A PIN-change reply after navigation cannot redirect or notify the new screen. Credential fields clear immediately after dispatch.
- README download instructions now match the verified public release. Current maintenance/status/BIP/testing guidance drops repeated historical RC entries and stale file-size targets; dated evidence and ADRs remain intact.
- The security model now matches the existing approved Mainnet explorer and current release boundary.
- Browser output is ignored; its previous last-run marker is removed from version control.
- Inactive worktrees are archived with verified contents and retaining Git history before removal. Active/shared working copies remain untouched.

## Verification

The source snapshot starts from `5818a19caf5603972b006953817d7df613d47335` plus the concurrent pre-1.0 version correction. Its baseline tree is `f43aa0b61d80171e3e0fdb906d9ffe8f0eed52a9`; the campaign uses isolated source, build output, browser ports and disposable test data.

The baseline passed 916 frontend unit tests. A browser regression reproduced the obsolete PIN-success redirect before the fix. The frozen runtime snapshot is `68cccc1f4bb16546fe49c8a60358b5e01c3d3a4d`; a 572-file input comparison matched the authoritative checkout. Later documentation and coverage-classification edits change no runtime behavior.

| Check            | Result                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend         | 920 tests; policy coverage 100%; type checking has no errors or warnings                                                                |
| Native           | 620 library and six integration/parser tests passed; opt-in Core/device/benchmark cases remain separate                                 |
| Rust quality     | Formatting, strict all-target/all-feature Clippy and rustdoc passed                                                                     |
| Funded Core      | All 15 cases passed: recovery, RBF/CPFP, phone signing/merge/broadcast, multisig, Continuity maturity/reorg/renewal/restore             |
| Browser          | Full run: 417 passed, 19 intentional skips, two test failures; corrected cases passed focused reruns on both viewports                  |
| PIN reruns       | Six light-theme cases and two dark-theme cases passed; cleared-field/error screenshots inspected at both required sizes                 |
| Hardware fixture | Scan/sign completion is explicitly controlled; the complete flow passed twice per viewport with the original progress/review assertions |
| Assets           | All 50 CSS contents are identical; 123 JavaScript assets remain, with +211 raw bytes / +97 gzip bytes in total                          |
| Validation       | Only the frozen release-source check fails; all preceding and downstream stages, policy coverage, production build and SBOM passed      |

The two browser failures were test-only: the new PIN test expected a wallet-name heading after unlock instead of Overview, and the hardware test could miss an already-completed scan. Corrections retain the checks and control only fixture completion. The initial failed run remains in the evidence; the reruns verify all 419 enabled cases without claiming that initial run was green. The old signed-update test fixture's version floor was corrected by the version campaign; the final native suite passed afterward.

The current tooling classifies the existing `durable_file.rs` filesystem helper as an adapter alongside other platform I/O. Coverage thresholds and all existing deterministic-core modules remain unchanged. Earlier extended fuzz evidence remains historical; the parser source is unchanged, and current bounded parser/transaction cases passed.

Production Node audit: zero reported advisories across 54 dependencies. Refreshed RustSec database `309392b18f6b17022f82c701f300433126901068` reports zero blocking vulnerabilities and 13 warnings: nine unmaintained, two unsound and two yanked dependencies. This is not a clean dependency-health claim. Review Tokio/glib and the platform dependency paths separately; no dependency is upgraded or warning suppressed by this change.

## Branches and worktrees

Local and live remote branch names are `main` and `codex/post-53-maintainability`. Five clean inactive worktrees were archived with verified file digests and a verified retaining Git bundle, then removed. Two invalid build registrations were pruned. The shared active checkout and maintenance checkout remain; unrelated active changes are preserved. Recovery archives stay local until the owner approves deletion.

## Remaining gates

Physical iOS pairing/recovery/camera capacity and exact offline Miniscript signer interoperability remain unverified. Phone enrollment is Standard-only; delayed USB signing, Mainnet Continuity and unsupported platforms stay blocked. Use the [human checklist](post-5.3-phone-miniscript-human.md) after internal verification, once for the frozen candidate.

The public source-policy gate remains frozen: 26 of 115 pinned files differ in this candidate; the fail-fast verifier reports `package.json` first. The complete hashed inventory is retained with the campaign artifacts. The new `settings-actions.ts` owner also belongs in the eventual source-approval review. Exact-source independent review, physical acceptance, source approval and package/release authorization follow [the finishing plan](post-5.3-finish-plan.md). No automated pass replaces those gates.
