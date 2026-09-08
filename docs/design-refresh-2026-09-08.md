# Approved application design refresh — 2026-09-08

## Scope and safety boundary

The user approved the Overview direction and its staged application-wide rollout.
The implementation updates the existing shared stylesheet and styled component
owners, not the concept markup. No new reusable component or dependency is added.
All application routes inherit Source Sans 3 and the Blue Ink/ivory palette; shared
controls, lists, panels, dialogs, loading/error/empty states and setup/signing
surfaces adopt the same geometry. Supporting copy uses an 11px minimum token.
Amounts retain integer accounting, tabular digits and the existing denomination
controls. Identifiers retain system monospace. Joined lists remain joined.
Setup build identity now follows normal form content, preventing a fixed label
from covering actions. Only full-screen onboarding overlays retain an opaque
viewport footer, with reserved bottom spacing. Existing document scrolling and
route behavior are preserved.

No Rust, WalletPort, adapter, route script, form/action semantics, signing review,
credential lifetime, hardware-validation, transport, database schema or persisted
format changes belong to this refresh. The earlier notification/query/navigation
changes in this working tree remain separate work with their own reports. The
1.8-second startup behavior, immutable logo geometry, trusted native recovery-word
sheets and existing backup print typography are deliberately unchanged. This is
not a native secret-sheet redesign or a release certification campaign.

## Local asset and rendering budget

One unmodified 170,188-byte Source Sans 3.052R WOFF2 is bundled with its SIL OFL
1.1 notice. Its provenance and SHA-256 are recorded in `static/fonts/README.md`
and enforced by a unit test. No CDN, runtime dependency, CSP relaxation or remote
request is introduced. `font-display: swap` preserves immediate fallback text.
The Overview/policy balance gradients, Overview glow and unnecessary blur behind
opaque mobile navigation are removed. No animation, polling, read/write or routing
behavior is added. Loading skeleton geometry follows the same financial panels.

The pre-refresh web build contained 108 JavaScript files totaling 1,335,676 bytes
(428,948 bytes when individually gzipped) and 10 CSS files totaling 213,236 bytes
(38,882 individually gzipped). The final production build retains 108 JavaScript
files and exactly 1,335,676 raw bytes (428,953 individually gzipped; +5 bytes from
generated output). Its 10 CSS files total 225,095 bytes, or 39,378 individually
gzipped: +11,859 raw / **496 compressed bytes**. These are aggregate build-asset
totals, not a per-navigation download or latency measurement. The local font is an
explicit additional asset, not hidden in JavaScript or reported as free. No cold
native-render, Core, HTTPS or Tor timing improvement is claimed for this skin.

## Verification

The mandatory harness passed after the shared token refresh: Svelte reported zero
errors/warnings, 83 unit-test files / 575 tests passed, and the production build,
secret/architecture boundaries, source-policy release gate, brand, localization,
toolchain and supply-chain checks passed. The diagnostics source pin was advanced
only after verifying that its script and markup are byte-identical to the prior
version; the change is CSS-only. The same comparison holds for all seven changed
styled Svelte component/route owners. Other security-gate pins are not loosened.

The additional browser matrix visits all 18 route entries (including their existing
redirect behavior), in light/dark themes, desktop Chromium 1180×780 and mobile
WebKit 390×844. It verifies font loading/local-only requests, primary text colors,
no horizontal overflow and no page errors in those checks. Separate scenarios
abort the font request while using balance denomination and payment input, verify
French/Spanish at 320px, and exercise reduced motion, keyboard focus and 590px
zoom-equivalent reflow. These are not physical keyboard or actual OS zoom tests.
Manual viewport inspection covered Overview, Activity/Coins, Send/Receive,
Settings, logs, setup, unlock, policy, public recovery/backup and deletion surfaces.

Iteration findings were retained rather than bypassed: the initial font-fallback
test used an incorrect placeholder and now targets the field's accessible name;
three old style expectations were updated to the approved 11px guidance, Freedom
Blue selection and 12px inset radius while retaining all behavioral assertions.
A setup-footer overlap was caught by the new desktop test, fixed with normal page
flow, and the complete eight-check design matrix then passed. An early overlapping
unit/dev-server run produced aborted-module/navigation errors; final validation
and browser runs are separated.

Final complete browser acceptance: **210 passed, 4 explicitly conditional skips**
in desktop Chromium and mobile WebKit (`pnpm test:acceptance
--output=/tmp/groot-design-qa.8dwJXF/acceptance-complete`, 3.5 minutes).
This includes existing software/hardware/multisig send and recovery orchestration,
wrong credentials, interrupted/rejected device actions, modal focus/scrolling,
label privacy, pagination/retry and independent identity/balance loading.
All eight additional design checks passed. Contrast evidence covers semantic token
pairs and existing sensitive-surface scenarios, not an exhaustive accessibility
audit. Actual browser/OS zoom and physical mobile keyboards remain separate checks.
After that browser run, `pnpm format` and the complete `pnpm validate` were rerun
successfully on the final production source: **83 files / 575 unit tests**, zero
Svelte errors or warnings, every mandatory gate passed, and production build passed.
Logs: `acceptance-complete.log` and `validate-handoff.log` in the QA directory below.
No Rust source was changed by the design refresh, so native wallet tests were not
rerun for this presentation-only increment; the preceding query/security changes
retain the separate native evidence in their dated reports.

Temporary baseline and refreshed browser-fixture captures are under
`/tmp/groot-design-qa.8dwJXF`. Viewport screenshots are used because WebKit's
full-page capture can incorrectly paint inherited dark text black even while
computed colors and viewport captures remain correct (also reproduced before
this refresh). This is not treated as physical-device evidence.

Required follow-up before release: inspect the exact packaged desktop webview and
physical iOS/Android safe-area, keyboard and font rendering. Browser timings do
not establish network, Bitcoin Core, Tor or physical-device latency guarantees.
No commit, push, signing, packaging or funded-wallet operation is part of this
design refresh.
