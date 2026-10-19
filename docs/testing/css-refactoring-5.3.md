# 5.3 CSS extraction verification

Tracking: #86. This is browser-fixture UI evidence, not native iOS/Android, physical signer/camera, VoiceOver or release certification.

## Change boundary

The 12,018-line global stylesheet becomes a 12-line ordered import entry. Private presentation rules move into 54 existing components and routes, including their state and responsive rules. Shared presentation contracts, themes, document accessibility, global animation names and public backup print remain ordered in `src/lib/styles/`. The [global boundary inventory](../../src/lib/styles/README.md) names the exceptions. No new reusable component, framework, dependency or font is introduced.

Svelte's hash normally increases selector weight. The extraction uses `:global(.name):where(.name)` to require the local hash without increasing the original weight; descendant globals remain anchored to that owner. A few private overrides use ordinary scoped priority to retain their precedence over shared defaults. Shared raw buttons/forms/empty states/identifiers still have multiple consumers and keep one global implementation. Button variant/size props are finite unions, including the existing legacy `sm` spelling without changing its appearance.

Wallet operations, credentials, persistence and IPC are unchanged by this CSS work. Existing profiles, backups and proposals remain compatible. Explicit BIP assessment: **no impact**. The prior defect/mobile work remains in the same working tree; its native source changes still require release-policy review. No source pins, trusted keys, version authorization or release guards were refreshed.

## Evidence method

`e2e/css-preservation.spec.ts` captures the same 18 routes at 1180×780 Chromium and 390×844 WebKit in light/dark (72 combinations). It fixes time, loads the actual bundled font, reduces motion, asserts no horizontal overflow and records viewport screenshots followed by element geometry and 20 computed style properties. Capturing first matters: WebKit can settle file-input/label intrinsic grid sizing when painting. A repeat of the unchanged original CSS confirmed that its earlier pre-paint geometry did not always describe the saved image; the final comparison uses that post-paint original replay, preserving all initial captures. The baseline precedes CSS extraction; it includes the already-authorized defect fixes. Only synthetic browser fixtures are used.

The first comparisons exposed real cascade regressions in balance typography, mobile action hiding, Activity alignment, password padding, Settings/setup spacing and the unlock overlay. Those comparisons were not accepted. Corrections retain the original rendered layout. The original stylesheet is also repeated through an evidence-only Vite transform that restores the saved original `app.css` and removes only the marked extracted style blocks. This records pre-existing lazy-CSS ordering variation without replacing the initial baseline. The transform lives only in ignored evidence output and is never part of product or release configuration.

One intentional visual normalization removes a competing physical margin on the multisig balance unit. Amount now consistently owns its existing 0.5rem (8px) gap; the original WebKit captures alternated between that and approximately 3.625px with lazy stylesheet order. Only those two elements’ recorded spacing values are allowed the original observed envelope. Closed, unpainted detail content is excluded from computed comparisons, with raw values retained; visible element cardinality and every other recorded field remain strict. Pixel comparisons are unmasked.

The complete acceptance suite separately exercises flow behavior, validation, errors/retry, cancellation, modals, tooltip/keyboard dismissal, translations, reduced motion, zoom/reflow, labels, payment review/signing orchestration and public backup printing. Browser fixtures cannot establish native transaction, HWI or physical mobile correctness. Screenshots establish the captured states, not every possible wallet state.

## Reproduce

Use the pinned Node/pnpm versions and an inspected unused port. Hold frontend source fixed during browser runs.

```sh
CSS_EVIDENCE_DIR=release-artifacts/css-5.3/before E2E_PORT=5293 CI=1 pnpm exec playwright test e2e/css-preservation.spec.ts --output=release-artifacts/css-5.3/before/flows
# After the CSS-only extraction:
CSS_EVIDENCE_DIR=release-artifacts/css-5.3/after CSS_BASELINE_DIR=release-artifacts/css-5.3/before-settled CSS_VARIANCE_BASELINE_DIR=release-artifacts/css-5.3/before E2E_PORT=5293 CI=1 pnpm exec playwright test e2e/css-preservation.spec.ts --output=release-artifacts/css-5.3/comparison
E2E_PORT=5293 CI=1 pnpm test:acceptance --output=release-artifacts/css-5.3/acceptance-final
pnpm check
pnpm test
pnpm build
pnpm validate
```

Capture before changing styles; never overwrite an accepted baseline to make a comparison green. Evidence output is ignored and must accompany the reviewed candidate when shared. The source-contract tests now follow ordered imports and component/route styles; existing assertions remain active across the new ownership boundaries.

## Results

Final source: type checks report zero errors/warnings; 740 unit tests in 96 files pass; the production build passes. The full browser run passes **296 tests with 6 existing skips**, including all four screenshot/computed-style matrix tests (72 route/device/theme states) and the full multisig setup/backup/print lifecycle. Skips remain the existing device-specific and mainnet-mode conditions; the CSS evidence tests were enabled.

The post-paint original comparison yields **58/72 pixel-identical screenshots**. The remaining 14 differ by at most **0.061976%** of a viewport, including the documented unit spacing; raw per-pixel counts and hashes are preserved without masks. All compared visible computed fields and geometry pass the strict comparison described above. The overview contact sheet and hardware import layout were also inspected visually.

The entry stylesheet is 12 lines, with 4,076 global CSS lines left for shared contracts; 1,524 private selectors moved into 54 existing owners. The largest shared build asset drops from about 218 KB to 94 KB uncompressed. Aggregate CSS across all lazy assets rises from about 245 KB/43 KB gzip to 307 KB/61 KB gzip because component scoping adds selectors and chunks. This is an ownership improvement, not an aggregate-size optimization; the preceding build measurement is labeled as such, not release reproducibility evidence.

All evidence is under `release-artifacts/css-5.3/`: `index.html` links the full-resolution originals/refactored screenshots, successful flow captures and final videos, and a separate inventory of **every** retained screenshot/recording. Original and superseded/interrupted diagnostic captures remain labeled, never presented as passing final runs. `groot-css-5.3-proof.zip` packages every capture with logs, comparisons, configuration, report and source hashes. The collection uses synthetic fixtures only.

A separate serial recording run passes **32/32 tests**: Activity refresh/retry, tooltip Escape, French/Spanish camera denial, accepted-payment/local-recording recovery, bounded UR scanner feedback, 24-word wallet creation, and the complete 2-of-3 multisig lifecycle, each in desktop/mobile and light/dark. All 32 WebM containers were probed successfully; a frame from the mobile dark multisig review was inspected. Videos use Playwright’s scaled recording resolution; assertions run at the required viewport sizes. No release gate, policy pin or authorization is changed to obtain a green result.

### Mandatory gate result

`pnpm validate` passes formatting, agent scaffolding, boundary checks (including the socket-based gateway tests), secret-surface, supply-chain, brand, version, localization and hardware-preflight checks, then stops at the unchanged release source-policy check:

> src-tauri/src/wallet.rs changed after the mainnet-candidate policy snapshot was reviewed

This is the prior authorized native/mobile/defect work, not a CSS policy exception. The reviewed pins remain unchanged. Type/unit/build checks were therefore also run independently, with the passing results above. The remaining validation stages after the blocked gate were also run independently: update-bundle evidence, HWI packaging guard tests, unsigned artifact comparison and the native development launcher all pass. This candidate is **not release-ready** until the native changes receive their required review and the full release process passes. These artifacts do not certify physical devices, native webviews, real signers/cameras, accessibility services or live-wallet transactions.
