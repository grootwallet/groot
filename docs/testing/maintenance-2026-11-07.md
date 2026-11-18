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

Paired production-browser observations collect 100 full-document samples per route after five warmups, on both required viewports. Another active task resumed Rust compilation after the initial quiet window. The runner records that interference, so these timings are excluded from performance acceptance and support no speedup or responsiveness claim. The deterministic asset comparison remains valid; real native/device waits require a separate quiet measurement.

Production Node audit: zero reported advisories across 54 dependencies. Refreshed RustSec database `309392b18f6b17022f82c701f300433126901068` reports zero blocking vulnerabilities and 13 warnings: nine unmaintained, two unsound and two yanked dependencies. This is not a clean dependency-health claim. Review Tokio/glib and the platform dependency paths separately; no dependency is upgraded or warning suppressed by this change.

## Branches and worktrees

Local and live remote branch names are `main` and `codex/post-53-maintainability`. Five clean inactive worktrees were archived with verified file digests and a verified retaining Git bundle, then removed. Two invalid build registrations were pruned. The shared active checkout and maintenance checkout remain; unrelated active changes are preserved. Recovery archives stay local until the owner approves deletion.

## Remaining gates

Physical iOS pairing/recovery/camera capacity and exact offline Miniscript signer interoperability remain unverified. Phone enrollment is Standard-only; delayed USB signing, Mainnet Continuity and unsupported platforms stay blocked. Use the [human checklist](post-5.3-phone-miniscript-human.md) after internal verification, once for the frozen candidate.

The public source-policy gate remains frozen: 26 of 115 pinned files differ in this candidate; the fail-fast verifier reports `package.json` first. The complete hashed inventory is retained with the campaign artifacts. The new `settings-actions.ts` owner also belongs in the eventual source-approval review. Exact-source independent review, physical acceptance, source approval and package/release authorization follow [the finishing plan](post-5.3-finish-plan.md). No automated pass replaces those gates.

## 18 November follow-up

This follow-up starts at `981a7f5e5a669f3fe2883810cb1ddb4dbb443729`, after the consolidated maintenance and CI work. Earlier counts and source identities above remain historical.

Queued metadata and unlock work now capture the initiating wallet/session before scheduling and recheck a process-local selection epoch under the execution guard. Tests include switching away and back, lock/reunlock, equal credentials, staged-sync metadata access and expiry. UUID-bound metadata paths and the short active-session lease preserve the existing fast metadata lane without retaining queued authority.

Tor uses one monotonic network deadline across connect, SOCKS, partial writes and bounded HTTP reads. Slow SOCKS/header/body progress cannot restart its budget; a valid complete Content-Length response returns without waiting for close. Phone review derives signed keys, full origins and witness scripts from the paired descriptor before counting cryptographically valid approvals across all inputs. Full-prevout authentication, work/QR caps and canonical desktop signature merge remain intact.

The gateway candidate in [ADR 0123](../adr/0123-stateless-managed-gateway-enrollment.md) prevents anonymous issuance from permanently filling the legacy principal file. Existing v1 records remain unchanged; future credentials require explicit operator key initialization, bounded persistent admission and durable revocations. Missing-state revocation fails before removing a public-name legacy record, preventing a later issuer restore from resurrecting signed authority. Source changes do not deploy this proposed service design; key custody and operations acceptance remain required.

Scoped source review permits exactly six internal regression digest changes from this baseline. The four wallet files retain credential throttling, zeroization, session expiry and serialization; the two service files retain legacy KDF authority, method/parameter limits and fail-closed revocation. Source/caller review also covers the changed unpinned owners `tor_rpc.rs`, `wallet/profiles.rs` and `wallet/coordination_commands.rs`. No public policy digest changes.

| Internal snapshot source                          | Reviewed SHA-256                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `src-tauri/src/wallet.rs`                         | `5bfad2188db6f07e5f77c8f8e79d711737abf124c74ad9f85528db860f2b79df` |
| `src-tauri/src/wallet/hardware_commands.rs`       | `9f29242818fe5bee29ba64641c05b52bd5f5775270f6b2aad7020ca909ab212b` |
| `src-tauri/src/wallet/profile_commands.rs`        | `1b79caed5ff346c3f246abd429cea5e9737c09c3b8c2173e0c377f2b6ccbdd8c` |
| `src-tauri/src/wallet/multisig_setup_commands.rs` | `653ea8fdef9836460d4e9a97a61fff20b0c0af5641d15e87942bfb22a2fff057` |
| `services/core-gateway/gateway.py`                | `f252127dc9f5cd61764bbae59b4e5e744e72393a149bf2e4036ab8a44daf122d` |
| `services/core-gateway/provision_client.py`       | `c2d64dc513902a57bde74452bd80c88ff18770ce1abbc93eb61e70187f257d6e` |

The integrated native checks passed formatting, strict all-target/all-feature Clippy, 653 library tests, six integration cases and doctests, with the same 26 explicitly ignored cases. Focused controls cover 11 context cases, seven Tor cases and eight phone approval cases. A disposable real-Core phone review/sign/merge/finalize/broadcast control also passed. This evidence does not certify physical devices or make the frozen public source-approval gate green.

Mandatory `pnpm validate` ran every stage and retained only the frozen public-source approval failure at `src-tauri/src/wallet/activity.rs`; every other stage passed. Complete `pnpm validate:internal` passed all 19 stages, including 953 frontend tests with coverage, 52 gateway service cases, the exact 30 release fixtures, source semantics, complete internal byte snapshot and structural guards. The six scoped internal digest changes above preserve mutation rejection; no test inventory, coverage threshold, audit allowance, workflow permission or public pin was reduced. An initial aggregate attempt inherited test-helper Git configuration overrides, which the candidate-identity fixtures correctly rejected. Removing those verified-environment overrides resolved that setup failure without changing product code or checks; initial and final logs remain retained separately.

The proposal audit read all 76 turns of “Review v5.3.0 and close issues” and reconciled the accepted plan with current owners/tests. The named ownership extractions, stale-result guards, fault/bounds/fuzz work and measured prepared-SQL reuse are implemented. Package-size attribution found no accepted safe saving; the fast unpacked signer runtime stays. Whole-app optimization and plan completion remain unestablished: worst-admitted phone cost, native preparation/policy/import phase measurements, real IPC/contended queues, larger-wallet filtering/memory, long matched-block recovery memory, exact-device acceptance and public release approval still need their own evidence. Existing one-input or uncontended synthetic timings cannot close those gaps. No speculative cache, streaming rewrite, locale split, dependency upgrade or signer-support expansion is introduced here.
