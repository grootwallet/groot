# Test the marketplace without real money

This MVP is a browser rehearsal of the trading experience. It uses synthetic people, prices, reputation, bitcoin, bank payments and confirmations. It creates no provider account, trade, bank instruction, wallet address or transaction. Do not supply recovery words, credentials, bank details or funds. Native trading and provider escrow are not implemented.

## Start

Use the repository's pinned Node 24.19.0 and pnpm 11.13.1 with the installed locked dependencies:

```sh
pnpm_config_verify_deps_before_run=false pnpm dev:marketplace
```

Open [the local MVP](http://127.0.0.1:5196/marketplace). This launcher binds loopback only and sets provider discovery to `0`, overriding an inherited enablement flag. Public research navigation is hidden. The separate discovery route explains that access is disabled; a demo trade never opens the provider. The screenshot and browser test records distinguish fixture evidence from real integrations.

The environment setting above prevents this checkout's pnpm freshness hook from attempting an online reinstall. Its installed and committed dependency lockfiles were verified identical; the setting does not change dependencies or disable the repository's supply-chain checks.

Run `pnpm_config_verify_deps_before_run=false pnpm verify:marketplace` for automated local acceptance. It defaults to two browser passes across installed Chromium/WebKit and desktop/mobile projects, after formatting, types, fixtures, units and build. A failed/incomplete/skipped/retried case, source drift or attempted upstream request fails the run. Reports, logs and screenshots are written under `outputs/marketplace-readiness/`. Leave source and generated files untouched while it runs. This supplements mandatory repository validation. See [production readiness](production-readiness.md) for evidence boundaries, the existing release-source blocker and live launch gates.

## Explore the experience

These journeys are optional product review. Automated acceptance owns fixture regression; the owner does not need to repeat every scripted path before reviewing the UX.

Select **Test scenarios**, choose an exercise, then **Start scenario**. During an unfinished trade, the same chooser is available through **Restart demo**. Starting another exercise explicitly clears simulated progress; **Keep current demo** leaves it untouched.

| Scenario                 | What to try                                                                                                                      | Expected behavior                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buy bitcoin              | Find an offer → review purchase → start demo → simulate escrow → mark payment sent → acknowledge → simulate release/confirmation | Payment is unavailable until escrow is simulated. The buyer's claim does not prove seller receipt. Completion says no money moved.                    |
| Sell bitcoin             | Find an offer → review sale → start demo → simulate escrow → simulate buyer claim → review receipt                               | Release stays disabled until the receipt checkbox is checked. Closing and reopening clears it. A separate simulated confirmation completes the trade. |
| Payment is taking longer | Read the waiting state → **There is a problem** → simulate a dispute                                                             | No second transfer or unilateral refund is offered after a payment claim. Dispute pauses voluntary release and sends no support request.              |
| Check a buyer's payment  | Open receipt review, close it, reopen it, then acknowledge                                                                       | The seeded scenario never checks receipt for you. An old acknowledgement cannot authorize a later scenario.                                           |
| Follow a refund          | Simulate confirmed refund, or restart the scenario and simulate a late payment claim                                             | A requested refund is pending. A late claim instead freezes the demo for dispute review.                                                              |
| Offers are unavailable   | Find an offer, observe the inline error, then select **Restore demo offers**                                                     | One inline action restores synthetic availability and searches again. It creates no public inventory or provider request.                             |

Also try an invalid amount such as `50.001`, then a valid amount between €50 and €250. The invalid value disables continuation and explains the accepted format. Change direction or amount after loading quotes: the old estimate disappears. Wait 60 seconds: an expired estimate cannot start a trade.

Try both light/dark themes and French/Spanish in Settings, and narrow the viewport to 390×844. Check that the primary action, modal acknowledgements and bottom navigation remain usable with keyboard and zoom. Direction and offer buttons expose their pressed state to assistive technology. Optional protocol details are under **How trading works**; the demo notice and decision-critical warnings stay visible. Cancelled, refund and disputed outcomes show their actual status without implying that payment steps completed. Important results remain inline; toasts are supplementary.

## Reset and limits

Exercises have no persisted history. Reloading or leaving `/marketplace` discards simulated progress. Return starts with a clean form and fresh unchecked acknowledgements. This makes rehearsal disposable; it is not restart recovery for a funded trade. Existing wallet/profile/backup/proposal/registry formats remain unchanged.

The separate LocalCoinSwap research mode remains an explicitly enabled engineering tool with privacy consent. It cannot continue a rehearsal. Its external-source confirmation warns that a provider website can offer real trades outside Groot's read-only area. Keep that mode off while following this guide.

Live trading requires the [production-readiness gates](production-readiness.md). The first conditional pilot uses provider-backed execution inside Groot. LocalCoinSwap coordinates escrow and resolves disputes. Eventual human acceptance checks comprehension, authorized buy/sell outcomes and recovery/operator evidence after permission, eligibility and test-fund approval. Browser tests do not prove bank settlement, provider authorization, actual liquidity, escrow safety, physical-device support or a public release. The existing reviewed-Mainnet-source mismatch remains a release blocker; this work does not refresh its authorization.
