# Persistent marketplace backend

The full sandbox MVP service lives separately in the private [grootwallet/groot-marketplace](https://github.com/grootwallet/groot-marketplace) repository. HTTP/authentication, pure domain policy and transactional SQLite persistence have separate modules. Groot keeps the SvelteKit frontend. [ADR 0114](../adr/0114-durable-marketplace-sandbox-service.md) records compatibility and boundaries.

For private remote testing, the [deployment guide](staging-deployment.md) packages the SvelteKit production assets and service with an inventoried TLS/access-controlled container configuration. Normal wallet and native builds keep this screen disabled. ADR 0115 authorizes only the separate simulated-money build. The backend now also includes strict staging preflight/HTTPS probes and consistent backup/restore tools; restored sessions are revoked while saved trades/history/idempotency remain intact.

## Run and test

Use Node 24.19.0 and the existing pinned Groot dependencies. Clone the service alongside Groot as `../groot-marketplace`, or set `GROOT_MARKETPLACE_SOURCE` to its absolute checkout path. The service itself needs no dependency installation.

```sh
pnpm dev:marketplace-backend
```

Open `http://127.0.0.1:5296/marketplace/backend`. The launcher owns frontend 5296 and API 5200, rejects occupied ports and stops only its own processes. It forces discovery off. Create a disposable account/password of at least 12 characters. **Never use a wallet password, recovery words, banking credentials or real payment information.** Every payment, escrow and arbitration action is simulated; no money moves.

The isolated service database persists accounts and trades across restarts. Quotes expire after 60 seconds; the service calculates all committed integer amounts. Buy and Sell use one corridor (EUR/SEPA Instant 50–250). Messages and evidence are append-only. Explicit refresh uses one canonical workspace request: cookie identity, bounded own-trade list, selection, messages and event history come from the same read transaction. The client validates ownership and history coherence before publishing; a stale foreign selection falls back to this account’s active trade. This replaces four sequential requests without automatic polling. A known saved action followed by a failed read keeps the previous complete view and blocks trade actions until Refresh status succeeds. Switching accounts clears drafts, receipt acknowledgement and pending requests. A payment claim never proves receipt, and the seller's acknowledgement resets on dialog close/reload. A late claim pauses a refund for a dispute. Simulated arbitration selects a pending outcome, then requires a separate simulated confirmation.

```sh
# In the separate service checkout: three complete passes plus coverage
node scripts/verify.mjs
# In Groot: three backend passes, frontend checks and two cross-engine browser passes
pnpm test:marketplace-backend
```

The integration verifier owns ports 5299/5201, forbids off-origin browser HTTP/WebSocket/provider requests and uses real HTTP/database responses without API mocks. It records exact case inventories, no-retry results, source hashes, logs and screenshots under `outputs/marketplace-backend/`. Backend evidence lives in the service's `outputs/backend-verification/`. It fails on incomplete/skipped/retried browser cases or source drift. Preserve a failed run before starting a new one. Do not edit/sync/build while browser phases execute.

## Trade steps

Choose Buy or Sell, enter an amount, and review the exact totals and fees. **Start trade** opens step 1. Every action here uses test data.

| Step       | Buy                                                                                                      | Sell                                                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1. Escrow  | Wait for the seller to lock bitcoin. With a test bot, choose **Simulate seller locking bitcoin**.        | Check the amounts and choose **Lock test bitcoin**.                                                                             |
| 2. Payment | In a live trade you would pay the seller by SEPA Instant. Here choose **Mark payment sent**.             | Wait for the buyer to mark payment sent. With a test bot, choose **Simulate buyer payment**.                                    |
| 3. Receipt | Wait for the seller to check the amount and sender. With a test bot, choose **Simulate seller receipt**. | Choose **Review payment**. Check the expected amount and sender, tick the acknowledgement, and choose **Release test bitcoin**. |
| 4. Release | Choose **Simulate release confirmation** and see **Trade complete**.                                     | Choose **Simulate release confirmation** and see **Trade complete**.                                                            |

For a human trade, the seller enters synthetic details in **Bank details** or chooses **Use example details**, then **Save bank details**. The save is permanent for that trade. The seller can scan the Regtest QR or copy the address, exact amount in BTC, or payment link before choosing **Lock test bitcoin**. The practice address is a shared Regtest fixture. Locking is simulated and does not observe a deposit. The buyer sees the saved account holder, intentionally invalid IBAN and trade reference after escrow locks. **Copy payment details** copies all three fields with the exact euro amount in one action. The receipt review shows the same reference. For a human trade missing saved details, use chat or **Trade options** to recover. The selected trade and its open chat update automatically, with **Jump to chat** on narrow screens. **Trade activity** shows timestamps and **Trade history** opens saved trades.

### When a step cannot finish

1. **Review.** Either side can edit the amount. An expired quote requires **Get new quote** and a fresh review.
2. **Escrow.** Either side can use **Trade options → Cancel trade** before the seller locks bitcoin. A buyer waiting on a human seller can use the open chat and sees escrow confirmation automatically.
3. **Payment.** If no payment was made after escrow, either side can request cancellation and refund in **Trade options**. Refund stays pending until confirmation. If the buyer already paid, they can choose **I already sent payment** while the refund is pending. The trade pauses for review.
4. **Receipt.** If the seller cannot verify the amount and sender, leave release unchecked and choose **There is a problem** in **Trade options**. The buyer can use the same option if payment or release is stuck. Chat and activity remain available. A simulated dispute decision selects a pending refund or release, followed by a separate confirmation.
5. **Connection lost.** Reload or sign in to resume the saved trade. Use **Refresh status** when an action was saved and the next screen could not load. Use **Retry request** if the result is unknown. The same request key recovers the original result.

## What remains for human review

After automated acceptance, focus on whether buy/sell totals and simulated status are clear, whether seller receipt wording is unambiguous, and whether navigation feels natural on your intended device. Check one buy, one sell with the receipt dialog, and resume a trade after closing/reopening the launcher. You do not need to manually repeat malformed HTTP, role-bypass, arithmetic, concurrency, idempotency or crash-recovery matrices.

## Deployment boundary

The API is deployable as a **shared sandbox service** through the portable container package and its TLS runbook. The package is exercised against actual Docker networking and HTTPS; the alternative service-only systemd templates have not been executed on this Mac. Node remains loopback-only behind the same HTTPS origin, Secure cookies are required and request/body logging stays off. The independently enabled production-assets build is authorized solely for the private sandbox by ADR 0115 and tested through the container/TLS harness. Ordinary wallet builds remain disabled. Do not expose the Vite development server. Single-process SQLite and bounded in-memory rate limits need deployment capacity/load validation. There is no password recovery, real notification delivery, real arbitration operation or funded trading. No secrets or deployment credentials are required for local tests.

Amount entry and quote review are separate; expiry requires an explicit refreshed estimate. The release dialog names the partner, fiat receipt and bitcoin principal. Alternative actions sit in Trade options; advanced simulator decisions sit in Test controls. The simple UI uses seeded simulated counterparties. Human maker offers are an advanced API test path; each human must send their own payment/receipt commands. Counterparty simulator controls reject human impersonation.

The first funded path still requires provider permission, reviewed legal/jurisdiction handling, actual usable liquidity and native key/recovery/transaction proof. No code here holds or releases actual bitcoin. See [production gates](production-readiness.md) and the separate service's SECURITY.md and deployment runbook. Groot's existing unrelated Mainnet source-review guard is preserved; a failed root `pnpm validate` must be reported, never bypassed or refreshed to claim marketplace readiness.

The [trade progress decision](../adr/0117-marketplace-sequenced-trade-progress.md) keeps the amount shortcuts and server-selected quote while giving each trade transition its own action. The receipt dialog uses the actor-relative workspace counterparty. Existing aggregate API endpoints and v1 records remain compatible.
