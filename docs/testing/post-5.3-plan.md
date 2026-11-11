# Groot: final technical-debt cleanup plan

**Goal:** make Groot easier to understand, change and test as it grows, without breaking existing functionality or weakening security, speed, reliability or wallet recovery. Reduce app size where measurements show a safe opportunity.

This is an incremental cleanup of the existing SvelteKit frontend and Rust backend. It is not a replacement app or a redesign of wallet behavior.

**What success looks like:** less duplicated work, clearer ownership, safer future changes, responsive screens, recoverable failures and a compact app. No change earns acceptance just because it removes lines or creates more files.

Updated after the final assessments on 2026-10-23. All final reviewers approved the direction with specific corrections. Those corrections are included below; their approval of the plan is not release authorization.

## 1. Instructions for the reviewing agent

Review this plan and the linked source before implementation. Identify specific mistakes, missing checks or unnecessary complexity. Distinguish confirmed defects from possibilities that still need a test.

Please do not implement changes, merge branches, change release approvals or add features during this review.

Return:

1. A short approve / approve with changes / do not approve verdict.
2. A prioritized list of necessary corrections, with code references.
3. Any work you would remove because it adds complexity without enough benefit.
4. Any missing test needed to protect current behavior, security or performance.

## 2. Code and current status

- [Wallet repository](https://github.com/grootwallet/groot).
- [Released v5.3.0](https://github.com/grootwallet/groot/releases/tag/v5.3.0), baseline commit `6a39bf50b2a6a042354b43369765a9af2174d061`.
- [Maintenance branch](https://github.com/grootwallet/groot/tree/codex/post-53-maintainability).
- **Exact review source:** [c5bfc2756752448cac35a05f08c8b0c684779124](https://github.com/grootwallet/groot/tree/c5bfc2756752448cac35a05f08c8b0c684779124).
- [Exact diff from the release](https://github.com/grootwallet/groot/compare/6a39bf50b2a6a042354b43369765a9af2174d061...c5bfc2756752448cac35a05f08c8b0c684779124).
- [Tracker #121](https://github.com/grootwallet/groot/issues/121).
- [Current implementation status](https://github.com/grootwallet/groot/blob/c5bfc2756752448cac35a05f08c8b0c684779124/docs/implementation-status.md).
- [Recorded tests and remaining physical testing](https://github.com/grootwallet/groot/blob/c5bfc2756752448cac35a05f08c8b0c684779124/docs/testing/post-5.3-maintenance.md).

Read the repository's `AGENTS.md`, `SECURITY.md`, product specification, architecture, engineering standards, test harness and relevant ADRs. Those instructions still apply.

Some cleanup is already implemented: CSS ownership, shared acceleration-quote and node-form helpers, and separate Rust profile/notification/recovery owners. A phone-signing fix now verifies input amounts against complete previous transactions. These changes must be reviewed and protected; do not assume they complete the remaining work.

The original three reviews agreed on the goal. Their disagreements concerned policy compilation versus live spend checks, what renewal changes, valid previous transactions and missing revocation functionality. Source inspection resolved these points; the technical notes below preserve the corrections. The final assessments agree with the revised direction and ask for clearer limits, tests and approval steps. They did not reproduce all recorded test results. This is a reviewed plan, not a new full audit or test run.

The maintenance branch is published but unmerged. No new signed app release has been produced.

## 3. What we mean by technical debt

Prioritize code that makes later work harder or riskier:

- Large files doing several unrelated jobs.
- Duplicated logic that must be fixed in several places.
- Unclear ownership of ongoing operations, cancellation and delayed results.
- Tests that check source text but do not demonstrate important behavior.
- Expensive repeated work, unnecessary loading or shipped resources.
- Dependencies, helpers or abstractions with no clear present purpose.

Fewer lines alone are not success. Clear ownership and safe changes matter more. Keep deliberate security checks even when they look repetitive.

**For every proposed change, record:**

- What existing debt or defect it removes.
- What current behavior must stay the same.
- How it will be checked.
- Any change in speed, memory, app size or dependency cost.

If the benefit is unclear, defer the change rather than add another abstraction.

## 4. Rules that protect existing behavior

- Keys, recovery words and decrypted signing material stay in Rust. Credentials must not enter logs or remain in UI state after use.
- Rust remains responsible for authorization, transaction review, signing, persistence and final transaction checks.
- A delayed result must not update a different wallet or an obsolete screen.
- Cancelling a screen does not undo a native action that already completed. Its result must remain recoverable, without duplicate payments.
- Keep existing profiles, backups, proposals, permanent labels and history compatible. No silent migration or data deletion.
- Keep network, signer and policy checks. Unsupported workflows must stay blocked.
- Preserve existing performance and reliability. Do not make the app slower to achieve cleaner-looking code or smaller packages.
- Keep dependency and tooling changes separate from refactors, with their own review.
- Reuse existing UI components. Follow the repository's approval rules if a new reusable component or breaking data-format change is necessary.

## 5. Work order

### Step 1 — Protect the starting point

Compare the released source with the maintenance source. List the affected operations and existing tests before adding more tests or moving code.

For Send, multisig Send, Settings and phone pairing/signing, record who owns each operation, which wallet it belongs to, when its result becomes obsolete, and what must happen after failure or restart. Give each row an existing-test column and a missing-test column. Distinguish tests that drive behavior from tests that only inspect source text. Reuse sound coverage instead of adding duplicate tests.

Move the branch-cleanup recovery bundle and manifest from temporary storage into durable, access-controlled storage. Check SHA-256 before and after the move, run git bundle verify on the durable copy, and privately record its location and restore instructions. Retain it until the owner explicitly approves removal. Preserve the original dirty checkout and existing worktrees.

**Done when:** the affected work is a bounded list, old and new behavior can be compared, compatibility is recorded, and recovery material is preserved.

### Step 2 — Check sensitive behavior and fix demonstrated bugs

Do this before further refactoring of signing, fees, credentials, proposals or storage.

- Review the current phone-signing fix and the moved Rust code.
- Write behavior tests for delayed replies, cancellation, lock, wallet switching, repeated retries and restart.
- Investigate the concrete late-result cases listed in the technical notes. First write a test showing whether a problem exists; fix demonstrated problems in separate commits.
- Test failures at the smallest saving boundary: atomic-file writes/rename/fsync, SQLite writes/commit, and mobile_complete_inner's multi-step completion/rollback. Inject failures deterministically using disposable data. Check partial state, retry and reopen; do not rely on flaky power-cut simulations. A failed operation must not leave partial permanent state or lose a completed payment result.
- Check both directions of phone QR transfer: desktop request and signed phone response. Test normal transactions, large previous transactions, signature growth and the actual transfer limits.
- Keep full previous-transaction verification. If a transaction cannot be transferred securely, explain the limitation clearly; do not weaken the check or pretend a file fallback exists.
- Derive safe phone work limits from the supported policy, transaction shape and measured cost. Enforce them in Rust as early as practical, before expensive review/signing and secret access, with a stable typed error. Test below/at/above each limit. Writing down a limit is not enough.
- Name and test the empty-input and mismatched-input-count rejection cases, including direct helper tests where the serialized parser rejects the malformed shape first.
- Keep the fee shown before approval tied to the verified transaction and prove claimed change belongs to the paired wallet. Record an explicit decision on an additional high-fee safeguard for the Testnet4 phone: a native cap or extra confirmation bound to the exact reviewed transaction. The owner approves any new threshold/rule before implementation; do not silently copy the Mainnet limit.
- Add focused parser fuzzing: automated generation of unusual inputs. Include complete paths such as QR decoding → transaction parsing → verification, not just isolated parsers.

**Done when:** the named risky cases have meaningful tests, identified defects are resolved or explicitly blocking, and the phone's supported transfer limits are documented. Physical camera testing remains necessary.

### Step 3 — Simplify code in small pieces

Once important behavior is protected, extract one clear responsibility at a time.

Start with the affected Send, multisig Send and Settings operations. Keep route files focused on presentation and user interaction. Put reusable presentation logic behind existing frontend boundaries; keep wallet authority in Rust.

Continue Rust ownership cleanup only where a module has a clear job and dependency direction. Remove obsolete helpers or duplication after proving callers and equivalent tests are covered.

Keep mechanical code moves separate from intentional behavior changes. For each move, use behavior tests to compare it with the previously reviewed implementation, and relate that baseline to released v5.3.0. Record every intended difference explicitly. The existing full-prevout security fix, quote-cancellation check and compatibility-copy change must not be accidentally undone to match the older release. Future fixes get separate commits and tests; do not rewrite published history just to rearrange old commits.

The two fountain-header validators in ur_transport.rs and coordination_transport.rs are a concrete duplication candidate. Share only the part proven equivalent. Their protocol limits/errors differ, so test their common behavior and their intended differences rather than forcing identical results for every input.

Avoid a generic framework or broad rewrite merely to shorten files.

**Done when:** every affected operation in the Step-1 list has one named owner, every ownership change has appropriate behavior-test evidence, duplicated rules have a clear owner, and public command/data contracts remain compatible.

### Step 4 — Measure speed, then improve real bottlenecks

Use production-profile builds and synthetic wallets. Browser demonstrations and debug test timings are not evidence of real app speed.

Measure:

- App launch and navigation.
- Large history/UTXO lists and filtering.
- Native command waiting time and processing.
- Transaction preparation, policy analysis, signature import and saving.
- Memory use and visible UI stalls.

Separate app processing from network waiting, hardware-device waiting and human approval.

Repeated Continuity policy compilation is a candidate for profiling, not a pre-approved cache. First look for repeated work within one operation. Add longer-lived reuse only if measurements justify its extra complexity and tests prove live checks stay fresh.

**Done when:** comparable before/after results show a useful improvement, with no material security, correctness, memory or latency regression. Reject optimizations that cannot demonstrate a benefit.

### Step 5 — Reduce package size safely

Measure the executable, frontend, hardware-signer runtime, resources, installed app and download separately.

Remove proven unnecessary content first. Review dependency-feature and signer-runtime changes separately because they can remove supported behavior.

The current Rust build already uses ThinLTO, one codegen unit and stripped symbols. More aggressive settings are not assumed to help.

Do not change panic/cleanup behavior, remove security checks or trim required signer support for size savings.

For an accepted size change, verify same-source reproducibility and regenerate/review SBOM and provenance for the final candidate. Dependency-feature or signer-runtime changes also require the matching supported-workflow checks. Verify final package signatures, notarization and installer behavior on the exact artifact intended to ship. Follow the current reproduction policy; do not carry an old version-specific exception forward automatically.

**Done when:** a relevant shipped artifact is measurably smaller and supported workflows, startup, memory and recovery still meet their requirements. Smaller downloads and faster rendering are different benefits; report them separately.

### Step 6 — Review and accept the final candidate

Run the required validation and affected extended tests on fixed final source. Complete browser acceptance, native checks and the relevant real-Core transaction tests. While the aggregate is blocked by approved-source hashes, still attempt it and run every other stage separately, including the stages after the release gate. Record results explicitly. Before source approval, only the expected source-hash mismatch may remain; after approval, the complete aggregate and required extended checks must pass.

Obtain independent review of sensitive fixes, moves and optimizations. Keep all transaction-safety tests and fixed Continuity maturity/reorg/renewal checks.

Update current documentation and support statements. Agree merge/release acceptance with the owner; do not merge or publish automatically.

The owner then tests the exact candidate on the phone and relevant hardware. Record expected outcome, observed outcome and sign-off. Stop on wrong addresses/policy/amounts/fees, unexpected signatures, inconsistent state or failed recovery.

**Done when:** the evidence is complete, remaining limitations are explicit, required approvals are recorded, and the exact candidate passes its acceptance checks.

## 6. Technical notes the next agent must retain

These details prevent the simplified wording from hiding important constraints.

### Release approval checks

The release verifier checks that approved source files have not changed. It currently fails because **five of 115 checked entries differ**, not just the first reported file:

```text
src-tauri/src/lib.rs
src-tauri/src/wallet.rs
src-tauri/src/wallet/profile_commands.rs
src/routes/settings/+page.svelte
src/routes/multisig/new/+page.svelte
```

Review all changed code, including newly imported modules and helpers—not just those five files. The complete release-to-maintenance diff contains **38 paths**:

```sh
git diff --name-status 6a39bf50b2a6a042354b43369765a9af2174d061 c5bfc2756752448cac35a05f08c8b0c684779124
```

Keep the approved hashes unchanged until the required independent review and authorization. Development changes can proceed with their checks recorded; copying new hashes merely to make validation green is not acceptable. The existing aggregate failure is not proof of a runtime defect.

The approval procedure is:

1. Freeze the candidate source and the complete changed-file/pinned-file inventory, including new imported owners.
2. A reviewer other than the implementing agent reviews that exact diff and records the source commit, scope, findings and resolution in a dated review record under docs/testing/ (private findings stay private).
3. The repository owner explicitly approves the new source/release scope. Record the applicable ADR and release-authorization update under the existing rules; approval of this plan is not that approval.
4. Update approved hashes in a separate approval-only commit. It may contain the required review/authorization records, but no application-logic changes or weakened checks. Record the reviewed source commit and this separate approval change. If source changes again, review the new changes before proceeding.
5. Rerun the full release gate, including semantic checks rather than just hashes, then pnpm validate and the required extended checks. Do not publish until final package and owner acceptance also pass.

While waiting for approval, run all non-approval stages of the current pnpm validate script individually. This includes its downstream release-verifier fixtures, development-runtime checks, Svelte checks, unit tests and frontend build; Rust/Core/browser/coverage checks remain scope-dependent requirements from docs/agent-harness.md. This records useful results without claiming the aggregate is green.

### Existing user-visible copy change

src/routes/multisig/new/+page.svelte and src/lib/locales/multisig.ts change the compatibility statement in English, French and Spanish. This is a product-copy correction, not a mechanical code move: “Recovery and inheritance are not enabled yet” becomes an explanation that Partner/Family Continuity are experimental on Regtest/Testnet4; BitBox02 Nova is named as a candidate; Coldcard/Trezor delayed policies are unsupported; phone pairing is standard multisig only. Review the wording against product policy. It does not enable or certify additional signers.

### Concrete late-result cases to characterize

References below are to the exact c5bfc275 source. These are cases to test, not claims that every one is a proven exploitable bug.

| Case                                                        | Source                                                                                                             | Expected test                                                                                                                                                                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Settings finishes loading after a switch/lock/teardown      | src/routes/settings/+page.svelte:360–405                                                                           | Delay node/scan/health reads, change context, then resolve them. Old data must not replace current data.                                                                                                                             |
| Settings save finishes after the user changes context       | settings/+page.svelte:655 (saveNode), :769 (saveSyncSource), :876 (renameWallet); health/backup/label handlers     | Delay success and error separately. Stale results must not close a new dialog or overwrite its state. Correctly bound native changes must remain saved. Exact-ID/global-safe updates may be documented rather than rejected blindly. |
| Two multisig loads finish out of order                      | src/routes/multisig/send/+page.svelte:536–715                                                                      | Complete the newer load first, then the older one. The older result must not replace it. Cover teardown and wallet switch.                                                                                                           |
| Later reads escape the first load check                     | multisig/send/+page.svelte:559 (policy callbacks), :617 (paths), :656 (draft), :676 (fees), and acceleration reads | Delay each later result and invalidate its request. Only the current request may publish UI results.                                                                                                                                 |
| Phone scan/sign finishes after scan reset or context change | src/routes/mobile/sign/+page.svelte:31–80                                                                          | Resolve a delayed review/sign after reset, lock or teardown. Do not publish an obsolete result; preserve any valid native outcome safely.                                                                                            |

Use the adapter, shell and Rust checks when interpreting results. A source-text gap alone does not prove wrong-wallet signing. Also cover balanced sync pauses on failure/restart and repeated retries without duplicate work.

### Phone transaction and QR limits

A PSBT is the transaction file passed between signers. UR is its animated QR encoding.

The general decoded PSBT limit is 1 MiB. QR has a 256 KiB raw ceiling plus frame limits. The exporter emits twice the fragment count and allows 1,024 frames. Default 180-byte desktop fragments imply a theoretical upper bound near 90 KiB; 220-byte phone-response fragments imply about 110 KiB. Exact encoder boundaries and practical camera limits still need testing.

Test at, below and above actual limits, including the larger signed response. Derive input/signature work limits from the supported wallet policy (including maximum satisfaction work), transaction shape and measured phone cost; do not invent a universal input count from file size alone. Enforce the chosen limits natively at decode/review as early as practical, before expensive checks and secret access, with typed errors and boundary tests. Document the supported limit in product/BIP evidence in the same change.

Fee/change tests must include false change claims, a valid recipient-only payment, the existing no-recipient rejection, checked monetary arithmetic, and fee values below/at/above any approved new safeguard. The existing 100,000-sat Mainnet rule stays unchanged. Do not invent or ship a new phone threshold without the explicit policy decision.

The phone signing screen currently uses QR. Desktop file export is not a working phone file-import fallback. If an intended supported flow cannot complete, block its promotion until the limitation is explicitly accepted or a separately reviewed solution exists.

Phone pairing remains standard native-SegWit multisig. Mainnet phone signing, phone Continuity enrollment and direct USB Miniscript remain blocked. Ledger, Jade/Jade Plus and BitBox02 families are Miniscript candidates, not certified Groot workflows. Coldcard and Trezor delayed policies remain unsupported through the current integration.

### Keep security facts accurate

- Complete previous transactions bind claimed input amounts/scripts. An offline signer does not thereby prove that coins are confirmed or unspent.
- Claimed change is already checked against the paired wallet's scripts. Keep this rule and add adversarial regressions.
- Zero-valued outputs, matching output scripts/values and coinbase previous transactions are not inherently invalid. Check real Bitcoin rules instead of adding blanket rejection.
- Pending pairing cancellation exists; completed-pair revocation does not. Deleting a profile cannot revoke a retained Bitcoin signing key. New revocation/key rotation is a separate feature.
- The acceleration helper's pre-dispatch cancellation check is an intentional behavior change, not just a code move.
- Pure policy compilation depends on the template and cosigner inputs. Live maturity must be checked separately on current state. Renewal uses a new address under the same descriptor; it does not rotate that descriptor.
- Reusing only a descriptor/fingerprint/threshold key would be insufficient for compilation. Any reuse needs complete inputs, bounded lifetime and unchanged fresh validation.
- The historical 21-file source mismatch count belongs to an older review. Preserve historical evidence and cross-link current status rather than rewriting the old result.

### Fuzzing and performance evidence

Before adding fuzz tooling, choose and review exact versions of cargo-fuzz, libfuzzer-sys and a dated nightly toolchain. Keep its workspace and lockfile separate from production. Do not change the app's toolchain or dependency graph accidentally.

The initial target list is:

| Target                                                            | Main properties to check                                                                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| proposal::decode_psbt                                             | No panic; stable acceptance/rejection; accepted transactions survive an encode/decode round trip                                           |
| ur_transport and coordination_transport frame reassembly          | Bounded work; typed framing errors; matching decoded bytes; common behavior stays consistent while protocol-specific limits stay different |
| BSMS/descriptor parsing                                           | Correct rejection of private/unsupported material; valid policy identity retained                                                          |
| Pairing JSON and BIP129 records                                   | Strict fields/type/session rules; correct authenticated decryption/rejection                                                               |
| UR → PSBT → prevout verification, and pairing → descriptor/policy | No reinterpretation across parsers; no signature or persistent side effect on rejection                                                    |

Use independently constructed vectors plus recorded synthetic desktop→phone→desktop exchanges. Minimize failures and keep them as ordinary regressions. Do not treat an uneventful campaign as proof of security.

Proposed fuzz budgets: 90 seconds per affected target in a dedicated CI job; 30 minutes per target and two hours per composed path for extended runs. Start with a two-second per-input timeout and 512 MiB memory ceiling, then calibrate sanitizer overhead before fixing the final limits. Record tool versions, commands, synthetic seed data and coverage limits. Save minimized failures as ordinary regression tests. No quiet run proves security.

For performance, use paired before/after builds on the same controlled machine with the same test instrumentation. Start with 10 process-cold launches, reporting median/range only; those 10 runs do not establish launch p95. If launch-tail claims are needed, predeclare a larger sample. Exclude five warmups and collect 100 repeated route/native samples for median/p95/range. Set regression tolerances from baseline variation before judging changes. Do not put noisy timing assertions in default CI.

Use Rust monotonic timing for queue/lock/computation/save boundaries, webview timing for invocation/readiness, and an external runner for isolated-app launch. Measurements must contain only approved operation names, durations, coarse counts and result codes from synthetic tests. No wallet payloads, credentials, addresses, xpubs, PSBTs or device IDs.

Retain all existing correctness checks. Do not make a benchmark faster by skipping transaction validation.

## 7. Scope and acceptance

This work should remove technical debt, not create a new architecture for hypothetical future needs.

No new wallet format, transport, key-revocation protocol, signer certification, Mainnet preview support or unrelated dependency upgrade is included automatically. Existing approval requirements apply if a justified scope change becomes necessary.

Reviewers should judge success by:

- **Maintainability:** clearer responsibilities, less duplication and tests that protect behavior.
- **Security:** the same or stronger checks, secret isolation and recoverability.
- **Performance:** measured responsiveness and memory with no unexplained regression.
- **Size:** measured savings where safe opportunities exist.
- **Reliability:** correct cancellation, retries, restart and failed-write behavior.

No new implementation or test result is claimed by this document. Implementation begins after the final plan review and the owner's instruction to proceed.
