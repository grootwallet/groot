# Marketplace preview verification

Date: 7 November 2026. **Historical phase-zero evidence:** the later public-discovery implementation and provider decision have their own [verification record](discovery-verification.md). Working checkout based on `733bc513d5fe570a1ceb27d8815ed00a4b2a0459`, with substantial pre-existing uncommitted 5.3 work. This change was not committed, pushed, deployed or released. It preserves that work and makes no refreshed Mainnet-source authorization claim.

## Evidence scope

This is a **browser fixture** and pure TypeScript policy/provider-parser implementation. No real fiat/bitcoin moved. No provider account, credential, bank details, escrow seed, native wallet operation or new persisted format is involved. Public competitor/API research is read-only and distinct from the runtime. Live release and recovery remain subject to the [plan](plan.md) and ADR 0111.

## Automated checks

Use pinned Node 24.19.0 and pnpm 11.13.1. For this checkout the command environment included `pnpm_config_verify_deps_before_run=false`: pnpm's dependency-status hook otherwise attempted an automatic online reinstall. Installed and committed Node lockfiles were compared byte-for-byte and matched; no dependencies or lockfiles were changed for this work. The supply-chain gate still ran.

| Check                                                                               | Result                                                                                                                                                      |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format` and final `pnpm format:check`                                         | Passed for supported sources/docs                                                                                                                           |
| `pnpm check`                                                                        | Passed, zero errors/warnings                                                                                                                                |
| `pnpm test`                                                                         | 104 files, 1,024 tests passed                                                                                                                               |
| Marketplace policy/provider units                                                   | 100 policy/adapter cases + 58 strict Hodl Hodl parser/URL cases, included in full unit run                                                                  |
| `pnpm test:acceptance e2e/marketplace.spec.ts`                                      | 42 passed across desktop/mobile: light/dark core flows plus FR/ES reviews and quote invalidation                                                            |
| `pnpm test:acceptance e2e/design-system.spec.ts e2e/navigation-performance.spec.ts` | 18 passed: existing routes, local fonts, translated compact reflow, reduced motion and navigation/history                                                   |
| `pnpm build`                                                                        | Passed, static browser build                                                                                                                                |
| `pnpm validate`                                                                     | Attempted; stopped at the existing reviewed-Mainnet-source mismatch described below. It is **not green**                                                    |
| Remaining release checks, run separately                                            | Signed updater and HWI verifier fixtures passed; unsigned evidence comparator passed; Rust remap compilation blocked by the host's unaccepted Xcode license |

The first sandboxed validation attempt could not bind its isolated localhost gateway test sockets. Re-running with localhost access passed that boundary suite and proceeded to the release-source guard. Pre-release checks through that point passed: formatting, scaffolding, architecture, secret surfaces, supply chain, branding, version surfaces, localization and hardware-preflight fixtures. The guard reported:

> src-tauri/src/session.rs changed after the mainnet-candidate policy snapshot was reviewed

That Rust file was already modified before this task. The marketplace work does not edit it or the reviewed-source hashes. The remaining frontend checks were run independently after this guard stopped `pnpm validate`; no gate was bypassed or weakened to report a green validation result.

The unsigned comparator's separate Rust remap probe reported that the Xcode/Apple SDK license has not been accepted on this host, preventing linking. No SDK license was accepted by the agent. No Rust wallet code changed, so native wallet/device tests do not establish additional marketplace evidence.

## Feedback that changed the implementation

- **Arithmetic and commitments:** buy rounds down, sell rounds up, fees use integer arithmetic; every supported cent amount is checked. Commit revalidates and freezes the economic snapshot and expiry.
- **Replays and late payments:** events bind trade ID, exact next revision and bounded unique event-ID history. A late payment claim during a pending refund freezes the preview for dispute review.
- **Stale results:** amount/direction changes invalidate offers; estimates expire at commitment. Offline/empty scenarios retain a clear retry path without fabricating inventory.
- **Truthful ranking:** choosing a more expensive alternative removes the best-total label. Public provider data remains indicative and cannot become a synthetic executable quote.
- **Desktop action visibility:** initial screenshots placed Review below the fold. Compact route spacing and moving optional details below the primary action put the full button inside 1180×780.
- **Mobile safety copy:** initial stacked toasts obscured the receipt warning/checkbox. Toasts now render below modal overlays; an `elementFromPoint` browser assertion proves the actual receipt checkbox is unobstructed.
- **Accessible controls:** explicit names, guarded receipt/payment dialogs, keyboard focus, safe bottom spacing, no horizontal overflow and translated reviews are exercised in the browser.
- **Existing privacy contract:** the old removed `/market` ticker remains absent. Its source guard now distinguishes that exact route from the newly authorized `/marketplace` preview and separately rejects networking/storage/wallet mutation in preview sources.

An intermediate browser run was invalidated by a simultaneous SvelteKit build regenerating development files and reloading transient preview state. The final 42-case run took place after builds/source edits finished and passed without retries. Build and browser acceptance must run sequentially in this checkout.

## Screenshots

Review artifacts are kept outside Git under `outputs/marketplace/`. Main captures are **1180×780** desktop and **390×844** mobile CSS pixels; optional `-full` files show the complete scrollable page. These local files are not public URLs and will not render in a remote GitHub checkout.

- [Desktop offer and total](../../outputs/marketplace/marketplace-desktop-light-buy-offers.png)
- [Desktop purchase review, dark](../../outputs/marketplace/marketplace-desktop-dark-review.png)
- [Mobile buyer payment step](../../outputs/marketplace/marketplace-mobile-light-buyer-payment.png)
- [Mobile buyer payment acknowledgement](../../outputs/marketplace/marketplace-mobile-light-buyer-payment-confirmation.png)
- [Mobile seller receipt guard](../../outputs/marketplace/marketplace-mobile-light-seller-receipt-confirmation.png)
- [Mobile dispute, dark](../../outputs/marketplace/marketplace-mobile-dark-dispute.png)
- [French mobile purchase review](../../outputs/marketplace/marketplace-mobile-light-localized-review-fr.png)
- [Spanish mobile purchase review](../../outputs/marketplace/marketplace-mobile-light-localized-review-es.png)

The competitor investigation links separately captured public interfaces and records the exact filters. Listing snapshots are not executed volume, settlement or compliance evidence.

## Open production gates

Provider entity/eligibility/authorization, agreement and API contradictions; supported test chain and contract/key onboarding; independent liquidity and all-in cost evidence; native bounded transport/privacy consent; persistent contract journal and restart recovery; unique labelled destinations before contract binding; authenticated exact-PSBT funding/release; disputes/support operations; legal review; independent security review and exact-candidate release authorization. See the phased [delivery plan](plan.md) for ownership boundaries and stop conditions.
