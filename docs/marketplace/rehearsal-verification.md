# Safe marketplace rehearsal verification

Date: 7 November 2026. Checkout based on `733bc513d5fe570a1ceb27d8815ed00a4b2a0459`, preserving pre-existing uncommitted 5.3 work. This extends the [phase-zero](verification.md) and [public-discovery](discovery-verification.md) evidence. No account, external message, financial transaction, native wallet change, dependency or lockfile update is part of this increment.

## Acceptance criteria

- A user can test complete buy/sell journeys and choose delayed payment, receipt review, refund or provider-unavailable exercises without entering personal data or using money.
- Exercises use owned synthetic fixtures through the existing quote commitment and ordered lifecycle; they never accept a real public advertisement. Seller receipt remains unchecked until explicit acknowledgement.
- An unfinished demo can be restarted explicitly. Cancelling the chooser preserves it; replacement clears old dialogs, acknowledgements, errors and quotes. Navigation/reload keeps no trade state.
- The testing launcher forces public discovery off even under inherited enablement. Browser tests reject every external HTTP/WebSocket request and every research lookup.
- The optional research relay rejects missing/malformed/duplicate request markers and cross-origin simple/preflight requests before any provider fetch. The marker is a local CSRF defense, not an authenticated user or cryptographic consent receipt.
- Public source confirmation warns that the provider's website can offer real trades. Native/production/public trading permissions remain unchanged.

## Implementation and review

`src/lib/marketplace/rehearsal.ts` owns the bounded catalog and preparation of fresh frozen synthetic state. It has no wallet, network, storage or timer access. The route composes existing Button, Modal, InstructionCard, WarningNotice and form patterns; no reusable component was created. Its generation counter rejects stale async results. All scenario titles, descriptions, feedback and controls use the central EN/FR/ES catalog.

A bounded independent source review found the unmarked simple-GET relay gap and the misleading external information-only wording. The request marker and explicit exit warning address those findings. This was a scoped implementation review, not an independent production security certification.

Compatibility: no persisted wallet/profile/backup/proposal/registry format change or migration. All rehearsal state remains transient. BIP impact: none. No funds, credentials, native signing authority or Mainnet release limits change.

## Verification results

Use pinned Node 24.19.0 and pnpm 11.13.1; this checkout uses `pnpm_config_verify_deps_before_run=false` to avoid automatic dependency refresh. Installed and committed Node lockfiles match byte-for-byte. Run source edits/sync/build before browser acceptance so generated development files cannot reset transient state mid-test.

| Check                                         | Result                                                                                                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format` and closing `pnpm format:check` | Passed                                                                                                                                                      |
| `pnpm check`                                  | Zero errors and warnings                                                                                                                                    |
| `pnpm test`                                   | 108 files, 1,223 tests passed                                                                                                                               |
| Rehearsal policy tests, included above        | 20 cases; six bounded scenarios, fresh immutable states, clock validation and unchanged receipt/lifecycle guards                                            |
| Client/gate focused tests, included above     | 116 passed                                                                                                                                                  |
| `pnpm test:marketplace-transport`             | 28 fixtures passed, including missing/wrong/duplicate request marker, simple request and cross-origin preflight rejection                                   |
| New rehearsal browser suite                   | 26 passed; both viewports/themes, FR/ES, complete buy/sell, all six exercises, reset/reload, fresh acknowledgements and no forbidden HTTP/WebSocket traffic |
| Existing trade browser suite                  | 42 passed                                                                                                                                                   |
| Discovery browser suite                       | Two default-disabled and 34 enabled cases passed with intercepted fixtures and provider host blocking                                                       |
| `pnpm build`                                  | Static browser build passed                                                                                                                                 |
| Local links and scoped diff whitespace        | Passed                                                                                                                                                      |
| `pnpm validate`                               | Attempted after final source changes; stopped at the existing reviewed-Mainnet-source mismatch below; **not green**                                         |

There are **104 distinct passing browser cases**. Tests used isolated owned port 5199 with no retries, switching only that server between discovery off/on. Direct pinned Node executables avoided dependency-refresh behavior. The server was stopped after verification; the owner's port 5196 preview was untouched. Its safe launcher was separately started with an inherited `GROOT_MARKETPLACE_DISCOVERY=1` and still printed/used discovery `0`. Manual browser inspection confirmed the main test page, visible scenario chooser and absent public-research navigation.

An initial full unit run hit the existing five-second timeout in the exhaustive arithmetic test under parallel CPU load. Only test assertion overhead was changed: every one of 40,002 inputs, all 200,010 amount checks, exact rounding and fee conservation remain checked, with aggregate counts and contextual failure messages. No runtime arithmetic, coverage or timeout was weakened. The focused exhaustive case then took 24 ms and the complete unit suite passed.

Mandatory validation passed formatting, scaffolding, boundaries, the 28 relay fixtures, secret surfaces, supply chain, branding, version surfaces, localization and hardware-preflight fixtures. Its release-source guard reported:

> src-tauri/src/session.rs changed after the mainnet-candidate policy snapshot was reviewed

That file was modified before this marketplace work. This increment does not change Rust or refresh reviewed hashes. Types, units and build were run independently after validation stopped; the release guard remains intact. No native wallet, hardware or funded-escrow acceptance is claimed.

Browser logs for this local session are `/private/tmp/groot-marketplace-rehearsal-final.log`, `/private/tmp/groot-marketplace-rehearsal-default-regression.log` and `/private/tmp/groot-marketplace-rehearsal-discovery-enabled.log`. They are local verification artifacts, not repository fixtures or permanent release evidence.

## Manual review

Follow the [testing guide](testing-guide.md). Screenshots are fixture-backed artifacts under `outputs/marketplace-rehearsal/`; they prove presentation and browser orchestration only. Automated execution never follows an external provider link or moves money.

- [Desktop entry](../../outputs/marketplace-rehearsal/marketplace-rehearsal-desktop-light-initial.png)
- [Mobile entry, dark](../../outputs/marketplace-rehearsal/marketplace-rehearsal-mobile-dark-initial.png)
- [Mobile scenario chooser](../../outputs/marketplace-rehearsal/marketplace-rehearsal-mobile-light-test-scenarios.png)
- [Desktop receipt safeguard](../../outputs/marketplace-rehearsal/marketplace-rehearsal-desktop-light-receipt-confirmation.png)
- [Payment delay](../../outputs/marketplace-rehearsal/marketplace-rehearsal-mobile-light-payment-delay.png)
- [Explicit restart](../../outputs/marketplace-rehearsal/marketplace-rehearsal-desktop-light-reset-dialog.png)
- [French chooser](../../outputs/marketplace-rehearsal/marketplace-rehearsal-mobile-light-localized-chooser-fr.png)
- [Spanish chooser](../../outputs/marketplace-rehearsal/marketplace-rehearsal-mobile-light-localized-chooser-es.png)
