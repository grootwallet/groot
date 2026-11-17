# LocalCoinSwap gateway API

Groot's optional browser preview uses a same-origin JSON gateway for LocalCoinSwap bitcoin/EUR offers, existing trades paid through SEPA Instant and the connected account's bitcoin transaction history. The gateway has its own contract and operation journal. It shares neither wallet state nor accounts with the [private simulated marketplace](backend.md).

[OpenAPI 3.1 for the Groot gateway](localcoinswap-openapi.json) contains the machine-readable request and response schemas. [LocalCoinSwap's Bitcoin execution contract](localcoinswap-btc-execution.md) maps the provider calls that require native wallet support.

## Run the preview

From the Groot checkout, run `pnpm dev:marketplace-provider` with Node 24.19.0 and pnpm 11.13.1. Open [the provider preview](http://127.0.0.1:5310/marketplace/provider). The launcher uses port 5310 and exits if it is occupied. This gateway runs only in the loopback development server. It is unavailable in the native app, static builds and Vite preview.

The preview uses Groot's **Trade bitcoin** interface. **Trading terms** names LocalCoinSwap as the provider and links to its terms and privacy policy. Account mode connects one existing LocalCoinSwap account for this development session. In-app signup and funded buy and sell are outside the current gateway. [Provider terms](https://localcoinswap.com/terms-of-service) · [Provider privacy policy](https://localcoinswap.com/privacy)

| Mode                                     | Configuration                      | Behavior                                                                                                                      |
| ---------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `fixture`                                | Default for the dedicated launcher | Local provider-shaped offers and trade accounts. Chat and supported actions are in memory. No provider traffic or real funds. |
| `public`                                 | `GROOT_LOCALCOINSWAP_MODE=public`  | Live public offers and detail. The browser initiates lookups when asked. No account key is used.                              |
| `account`                                | `GROOT_LOCALCOINSWAP_MODE=account` | Live public offers and authenticated reads for one LocalCoinSwap account. Writes require separate configuration.              |
| `off` or no mode in ordinary development | `GROOT_LOCALCOINSWAP_MODE=off`     | Gateway disabled.                                                                                                             |

```sh
GROOT_LOCALCOINSWAP_MODE=public pnpm dev:marketplace-provider
```

### Verify your LocalCoinSwap account

LocalCoinSwap includes **Read** on every API key. The **Trade** and **Wallet** checkboxes add access. Leave both unchecked to create a read-only key. An existing **Read, Trade** key with **Wallet** unchecked also works for the read-only check below. Groot disables trade writes in this launcher. One account is enough, and you can leave it unfunded. [LocalCoinSwap API key settings](https://localcoinswap.com/preferences/api-token)

1. In a private Terminal window, run `pnpm dev:marketplace-account-check` from the Groot checkout with Node 24.19.0 and pnpm 11.13.1.
2. Enter the full LocalCoinSwap API key at the hidden Terminal prompt. The key stays in the local server process. Keep it out of chat and screenshots.
3. Open [the account-check preview](http://127.0.0.1:5312/marketplace/provider). Choose **Your trades**, enter the separate **Local access code** printed in Terminal, and choose **Connect**.
4. Check that the active trade list loads. An empty list counts as success. Open **Transactions** to read the connected account's bitcoin history. Press **Ctrl+C** in Terminal when you finish.

### Configure account mode manually

In account mode, supply these environment variables to the server process through a local secret store or a private shell session. Enter the local access token in the preview's account panel. The browser keeps it in memory and clears it on disconnect or reload. The provider key stays server-side.

| Variable                            | Value                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GROOT_LOCALCOINSWAP_API_KEY`       | Key for the single LocalCoinSwap account under test. LocalCoinSwap includes `read` by default. The `trade` scope allows trade writes when the gateway enables them. Leave the `wallet` scope off.                                                                                                    |
| `GROOT_LOCALCOINSWAP_ACCESS_TOKEN`  | Separate random gateway token of 32–256 characters from `A–Z`, `a–z`, `0–9`, `_` and `-`. `openssl rand -hex 32` can generate it. This token grants access to the configured account's gateway operations.                                                                                           |
| `GROOT_LOCALCOINSWAP_TRADE_ACTIONS` | Set to `1` only to send real chat messages, mark a payment, or open or withdraw a real dispute on an existing trade. The default is read-only.                                                                                                                                                       |
| `GROOT_LOCALCOINSWAP_JOURNAL`       | Absolute path to a dedicated local SQLite file for account writes. Use an owner-only directory and file, with `0700` and `0600` permissions respectively on macOS/Linux. The file may contain normalized chat and trade receipts. Keep it out of the checkout, backups shared with others, and logs. |

Enable the provider's authenticator before creating a scoped API key. Start account mode only for the intended provider account. Anyone who can use its local gateway token acts through that account. Run `pnpm test:marketplace-provider` to test the HTTP contract without a live key or provider connection. [Security settings](https://localcoinswap.com/preferences/security) · [API key settings](https://localcoinswap.com/preferences/api-token)

## HTTP contract

Prefix each route with `/api/marketplace/localcoinswap`. All requests require `X-Groot-LocalCoinSwap: 1` and the exact configured loopback host. Account routes require `Authorization: Bearer <local access token>` in account mode. Fixture routes use their local test identity without a token. `POST` requires the exact same `Origin`, `Content-Type: application/json` and `Idempotency-Key: <UUID>` headers. All request IDs and keys use the standard UUID form with versions 1–5 and RFC variant. JSON bodies are limited to 8 KiB. Text input accepts up to 1,000 UTF-16 code units and normalizes line endings before computing the write fingerprint. Unknown or repeated query and body parameters are rejected. `GET` accepts no body.

Success uses `{"apiVersion":1,"data":...}`. Errors use `{"apiVersion":1,"error":{"code":"...","retryable":false}}` with optional `retryAfterSeconds`. Responses are `Cache-Control: no-store` and bounded to 512 KiB. The gateway exposes no cross-origin access headers.

| Method and path                    | Access         | Query or JSON body                                                                                                                | Success `data`                                                                         |
| ---------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /capabilities`                | Public         | None                                                                                                                              | `200 Capabilities`                                                                     |
| `GET /offers`                      | Public         | Required `intent=buy\|sell`, integer `amountCents=5000..25000`. Optional `country` with two uppercase letters, `limit`, `offset`. | `200 Page<Offer>`                                                                      |
| `GET /offers/{offerId}`            | Public         | None                                                                                                                              | `200 Offer`                                                                            |
| `GET /trades`                      | Account        | Optional `stage=live\|past` (default `live`), `limit`, `offset`.                                                                  | `200 Page<Trade>`                                                                      |
| `GET /transactions`                | Account        | Optional `type`, `limit`, `offset`. Omit `type` for all transaction types.                                                        | `200 Page<BtcTransaction>`                                                             |
| `GET /trades/{tradeId}`            | Account        | None                                                                                                                              | `200 Trade`                                                                            |
| `GET /trades/{tradeId}/messages`   | Account        | Optional `limit` and either `offset` or `view=latest`.                                                                            | `200 Page<Message>` or `LatestMessages` for `view=latest`.                             |
| `POST /trades/{tradeId}/messages`  | Account writes | `{"content":"I sent the transfer."}`                                                                                              | `201 Message`                                                                          |
| `POST /trades/{tradeId}/actions`   | Account writes | An action object listed below.                                                                                                    | `200 Trade` for payment or cancellation, `200 TradeStatus` for disputes.               |
| `GET /operations/{idempotencyKey}` | Account        | None                                                                                                                              | `200 Operation` for a receipt in this account's journal. An unknown key returns `404`. |

`limit` is an integer from 1 to 100 and defaults to 20. `offset` is an integer from 0 to 10,000 and defaults to 0. Offer intent refers to the Groot user's side. The gateway reverses it for the maker query and filters amount locally. `nextOffset` and `total` describe provider pagination before Groot filters, so an empty page can still have a next page. Prices are indicative. Provider eligibility, fees and actual settlement require separate verification.

| Action           | Exact JSON body                                                                                       | Meaning                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Mark paid        | `{"action":"mark_paid","expectedStatus":"CRYPTO_ESC"}`                                                | Buyer reports a transfer they already made. Success returns the trade in `FUND_PAID`. |
| Cancel a request | `{"action":"cancel_unfunded","expectedStatus":"CREATED"}`                                             | Requests cancellation of an unaccepted trade. Returns the provider's resulting trade. |
| Open dispute     | `{"action":"open_dispute","expectedStatus":"FUND_PAID","description":"The payment is under review."}` | Opens a dispute from `CRYPTO_ESC` or `FUND_PAID` and returns `DISPUTED`.              |
| Withdraw dispute | `{"action":"withdraw_dispute","expectedStatus":"DISPUTED"}`                                           | Requests withdrawal and returns the provider's resulting status.                      |

The gateway verifies the current trade status before forwarding an action. LocalCoinSwap checks trade ownership, role, authorization and transition rules. The buyer's claim records the reported transfer. Cancellation sends only `status: "CANCELLED"`, with no refund secret, after checking for `CREATED`. The provider decides the final transition and may return `CANCELLATION_REQUESTED` if the trade changes during submission. Review the returned state before taking another action.

Chat is chronological. With `view=latest`, `offset` in the response is the position of the first message in the returned window and `nextOffset` is `null`. Use offset-based requests for older messages. Combining the two query modes returns `400`.

Transaction history is newest first. It includes deposits, withdrawals and escrow movements for the connected provider account. LocalCoinSwap omits self-transfers. The optional `type` filter accepts `DEPOSIT`, `WITHDRAW`, `ESCROW`, `ESCROW_RELEASE`, `ESCROW_REFUND`, or `ESCROW_FEE`. This endpoint needs only the provider's `read` scope. It returns an allowlisted history with no provider `ref_data`, addresses or signing material.

### Response types

```ts
type Capabilities = {
  mode: 'fixture' | 'public' | 'account';
  authenticated: boolean;
  tradeActions: boolean;
  btcExecution: false;
};

type Page<T> = { items: T[]; nextOffset: number | null; total: number };
type LatestMessages = Page<Message> & { offset: number; nextOffset: null };

type Offer = {
  id: string;
  intent: 'buy' | 'sell';
  country: string | null;
  currency: 'EUR';
  paymentMethod: 'sepa_instant';
  pricePerBtcCents: number;
  exactPricePerBtc: { units: string; scale: number };
  minFiatCents: number;
  maxFiatCents: number;
  maker: string;
  terms: string | null;
  active: boolean;
  observedAtMs: number;
};

type Trade = {
  id: string;
  status: string;
  buyer: string;
  seller: string;
  fiatCents: number;
  bitcoinSats: number;
  createdAtMs: number | null;
  expiresAtMs: number | null;
};

type TradeStatus = { id: string; status: string };

type BtcTransaction = {
  id: number;
  txid: string | null;
  type: 'DEPOSIT' | 'WITHDRAW' | 'ESCROW' | 'ESCROW_RELEASE' | 'ESCROW_REFUND' | 'ESCROW_FEE';
  sats: number | null;
  confirmed: boolean | null;
  firstSeenAtMs: number | null;
  confirmedAtMs: number | null;
};

type Message = {
  id: number;
  sender: string;
  content: string | null;
  createdAtMs: number | null;
  hasAttachment: boolean;
};

type ErrorBody = { code: string; retryable: boolean; retryAfterSeconds?: number };

type Operation =
  | { status: 'pending' }
  | { status: 'unknown'; error?: ErrorBody }
  | { status: 'succeeded'; data: Trade | TradeStatus | Message }
  | { status: 'rejected'; error: ErrorBody };
```

`pricePerBtcCents` is rounded for display. The exact advertised EUR/BTC price is `units / 10^scale`. Monetary fields use integer cents or satoshis. Transaction `id` is a positive provider row ID. When available, `txid` is 64 lowercase hexadecimal characters and `sats` is the signed amount with an absolute maximum of 2,100,000,000,000,000 sats. A null field indicates unavailable data. Timestamps are Unix milliseconds. `terms` and `content` are plain text. `hasAttachment` is an indicator only. The gateway does not proxy downloads or uploads. `authenticated` describes fixture access or a valid local token. It does not verify the upstream account credentials or key scopes until an authenticated provider call.

### Request examples

Use the fixture launcher for all examples. The sample identifiers belong to the fixture. Values such as timestamps and message IDs vary by session.

```sh
BASE=http://127.0.0.1:5310/api/marketplace/localcoinswap
OFFER_ID=91e1dc0f-1fc8-4232-9d7b-0f3aee06b011
TRADE_ID=91e1dc0f-1fc8-4232-9d7b-0f3aee06b001

get_marketplace() {
  curl --fail-with-body -H 'X-Groot-LocalCoinSwap: 1' "$BASE$1"
}

get_marketplace '/capabilities'
get_marketplace '/offers?intent=buy&amountCents=10000&limit=20'
get_marketplace "/offers/$OFFER_ID"
get_marketplace '/trades?stage=live&limit=20'
get_marketplace '/transactions?type=ESCROW_RELEASE&limit=20'
get_marketplace "/trades/$TRADE_ID"
get_marketplace "/trades/$TRADE_ID/messages?limit=20&offset=0"
```

The capabilities response is `{"apiVersion":1,"data":{"mode":"fixture","authenticated":true,"tradeActions":true,"btcExecution":false}}`. List responses wrap rows in `data.items`. A trade detail response has this shape.

```json
{
  "apiVersion": 1,
  "data": {
    "id": "91e1dc0f-1fc8-4232-9d7b-0f3aee06b001",
    "status": "CRYPTO_ESC",
    "buyer": "groot-tester",
    "seller": "Camille",
    "fiatCents": 10000,
    "bitcoinSats": 125000,
    "createdAtMs": 1794384000000,
    "expiresAtMs": 1794387600000
  }
}
```

The following sends a fixture chat message and looks up its receipt.

```sh
OPERATION_ID=$(uuidgen)
curl --fail-with-body \
  -H 'X-Groot-LocalCoinSwap: 1' \
  -H 'Origin: http://127.0.0.1:5310' \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $OPERATION_ID" \
  --data '{"content":"I am ready to trade."}' \
  "$BASE/trades/$TRADE_ID/messages"

get_marketplace "/operations/$OPERATION_ID"
```

A `201` chat response has the shape `{"apiVersion":1,"data":{"id":4,"sender":"groot-tester","content":"I am ready to trade.","createdAtMs":1794384000000,"hasAttachment":false}}`. The receipt response wraps the same message in `data.data` and has `data.status` of `succeeded`.

Use a new operation key for each distinct action. This marks the fixture trade paid. The action table above gives the dispute bodies for the next applicable states.

```sh
curl --fail-with-body \
  -H 'X-Groot-LocalCoinSwap: 1' \
  -H 'Origin: http://127.0.0.1:5310' \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  --data '{"action":"mark_paid","expectedStatus":"CRYPTO_ESC"}' \
  "$BASE/trades/$TRADE_ID/actions"
```

The `200` response contains a `Trade` with `status: 'FUND_PAID'`. For `open_dispute`, the same endpoint returns `{"apiVersion":1,"data":{"id":"91e1dc0f-1fc8-4232-9d7b-0f3aee06b001","status":"DISPUTED"}}`.

### Errors and write recovery

| HTTP  | Code                                                 | Client action                                                                                                                                                                 |
| ----- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400` | `invalid_request`                                    | Fix the request shape, argument, ID or header.                                                                                                                                |
| `401` | `unauthorized`, `provider_unauthenticated`           | Reconnect with the local token or verify the server's provider key, respectively.                                                                                             |
| `403` | `forbidden`, `writes_disabled`, `provider_forbidden` | Check local origin/marker, opt-in write configuration or the account's provider authorization and scope, respectively.                                                        |
| `404` | `not_found`                                          | The route or resource is missing, unavailable to the account, or has no local receipt. A missing receipt alone cannot establish whether another client wrote to the provider. |
| `405` | `method_not_allowed`                                 | Use the method in `Allow`.                                                                                                                                                    |
| `409` | `conflict`                                           | Check for an already used key, changed request body or provider conflict.                                                                                                     |
| `409` | `wrong_trade_state`                                  | Read current trade state before deciding whether an action is still appropriate.                                                                                              |
| `409` | `operation_pending`                                  | Query the existing operation receipt after the in-flight request settles.                                                                                                     |
| `409` | `operation_unknown`                                  | Reconcile against trade state or chat history. Do not send the action again to clear this error.                                                                              |
| `413` | `payload_too_large`                                  | Send at most 8 KiB of JSON.                                                                                                                                                   |
| `415` | `unsupported_media_type`                             | Send an uncompressed JSON body.                                                                                                                                               |
| `422` | `provider_rejected`                                  | LocalCoinSwap rejected the request. Review the account and trade state.                                                                                                       |
| `429` | `rate_limited`                                       | Use the `Retry-After` header or `retryAfterSeconds`.                                                                                                                          |
| `502` | `invalid_provider_response`                          | A read returned an invalid or oversized response. Stop using the result.                                                                                                      |
| `503` | `unavailable`                                        | Retry a read when connectivity returns. Check a write's existing receipt first.                                                                                               |

Generate one key per write intent and retain it when the browser loses the response. The gateway durably reserves the key before an account write and replays the original receipt for an identical request. Reusing a key for a different request returns `conflict`. The provider API does not document an idempotency key. Groot does not automatically retry writes and will block a matching unresolved effect even under a new key. Account mode can query existing receipts with writes off if it uses the same journal and provider credential. The journal scopes receipts to the credential fingerprint, so a rotated API key cannot read the old key's receipts. Use a single gateway process for the account under test.

When a request may have reached the provider but no confirmed result is available, the receipt remains `unknown`, including after a process restart with an unresolved reservation. Read the receipt, then inspect the current trade or chat before deciding what happened. The preview offers **Retry request** only when **Check request** gets a `404` for that receipt. It resends the same key and payload through the same gateway. A known `pending` or `unknown` receipt blocks resend. Keep the same provider credential and journal when checking an uncertain operation. No public receipt reset or force-retry endpoint exists.

## Provider boundary

`provider-client.ts` handles same-origin typed requests and envelopes. The gateway owns access checks, input validation, trade-state guards, routing and journal semantics. The LocalCoinSwap adapter owns fixed-origin HTTPS, provider credentials, deadlines, response validation and rate limits. The browser never receives upstream headers, raw errors, key material or escrow transaction metadata.

| Groot operation                   | LocalCoinSwap upstream operation                                                                                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offer search                      | `GET /api/v2/offers/search/` with `coin_currency=BTC`, `fiat_currency=EUR`, the opposite `trading_type`, `payment_method=sepa-instant`, `last_seen=30mins`, optional `country_code_exact`, `limit` and `offset`. |
| Offer detail                      | `GET /api/v2/offers/{uuid}/`.                                                                                                                                                                                    |
| Trade list                        | `GET /api/v2/trades/list/` with `stage`, `trade_format=non-custodial`, `coin_currency=BTC`, `fiat_currency=EUR`, `payment_method=sepa-instant`, `limit` and `offset`.                                            |
| Trade detail and action preflight | `GET /api/v2/trades/{uuid}/`.                                                                                                                                                                                    |
| Bitcoin transaction history       | `GET /api/v2/tx-history/non-custodial/BTC/` with `limit`, `offset` and optional `txtype`.                                                                                                                        |
| Chat list and send                | `GET /api/v2/trades/message/list/{contract_uuid}/` with `limit` and `offset`, and `POST /api/v2/trades/message/{uuid}/` with `{ "content": "..." }`.                                                             |
| Mark paid or cancel request       | `PATCH /api/v2/trades/non-custodial/update/{uuid}/` with `{ "status": "FUND_PAID" }` or `{ "status": "CANCELLED" }`.                                                                                             |
| Open and withdraw dispute         | `POST /api/v2/trades/dispute/{uuid}/` with `{ "description": "..." }`, and bodyless `POST /api/v2/trades/withdraw-dispute/{uuid}/`.                                                                              |

Upstream account calls use `Authorization: ApiKey ...` over `https://api.localcoinswap.com`. LocalCoinSwap publishes limits of 120 requests per minute per IP for public calls and 60 per minute per account for authenticated calls. It lists a separate two-per-minute limit on the trade status endpoint and excludes API keys from its website WebSocket feeds. The preview verifies the configured account with a trade-list read, then refreshes the selected trade and most recent chat window while visible. Historical chat pages remain in place until you choose **Latest messages**. Refreshes back off on failure and honor `Retry-After`. Public offer lookup remains on demand. [LocalCoinSwap developer reference](https://localcoinswap.com/developers) · [OpenAPI](https://localcoinswap.com/openapi.json)

## Remaining bitcoin execution

LocalCoinSwap's public API starts with an API key created for an existing account. Registration and account security administration use the provider's website. A full Groot onboarding flow needs a supported provider registration and authentication contract, per-user credentials, and native wallet setup and recovery. [Provider registration](https://localcoinswap.com/register) · [Provider API reference](https://localcoinswap.com/developers) · [Provider wallet and key model](https://localcoinswap.com/learn/how-wallet-keys-work)

Groot cannot create or accept a LocalCoinSwap trade, fund escrow, confirm seller receipt, release or sweep bitcoin, cancel a funded trade, refund bitcoin or sign a dispute outcome through this gateway. Account testing starts with an existing trade in the configured LocalCoinSwap account. In fixture mode, all trade actions affect only fixture records.

The provider's BTC create and accept paths use a provider-associated web wallet and trade secrets. Seller receipt and post-escrow cancellation use further secret exchange. See the [upstream Bitcoin contract](localcoinswap-btc-execution.md) and the [production gates](production-readiness.md).
