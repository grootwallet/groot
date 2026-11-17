<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Amount from '$lib/components/Amount.svelte';
  import Button from '$lib/components/Button.svelte';
  import InstructionCard from '$lib/components/InstructionCard.svelte';
  import LocalTimestamp from '$lib/components/LocalTimestamp.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import WarningNotice from '$lib/components/WarningNotice.svelte';
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { parseEuroAmount } from '$lib/marketplace';
  import {
    localCoinSwapClient as api,
    ProviderApiError,
    type Capabilities,
    type ProviderAction,
    type ProviderIntent,
    type ProviderLatestMessages,
    type ProviderMessage,
    type ProviderOffer,
    type ProviderPage,
    type ProviderStage,
    type ProviderTrade,
    type ProviderTransaction,
    type ProviderTransactionType
  } from '$lib/marketplace/provider-client';
  import { discreetMode } from '$lib/privacy';
  import { dismissToast, toast } from '$lib/stores/toasts';

  const enabled = __GROOT_LOCALCOINSWAP__;
  const limit = 20;
  const exampleCountry = 'FR';
  type TradeWrite = { key: string; tradeId: string } & (
    { kind: 'message'; content: string } | { kind: 'action'; body: ProviderAction }
  );
  let capabilities = $state<Capabilities>();
  let accessInput = $state('');
  let token = '';
  type Tab = 'offers' | 'trades' | 'transactions';
  let tab = $state<Tab>('offers');
  let termsOpen = $state(false);
  let intent = $state<ProviderIntent>('buy');
  let amount = $state('120');
  let country = $state('');
  let stage = $state<ProviderStage>('live');
  let offers = $state<ProviderPage<ProviderOffer>>();
  let trades = $state<ProviderPage<ProviderTrade>>();
  let transactions = $state<ProviderPage<ProviderTransaction>>();
  let latestChat = $state<ProviderLatestMessages>();
  let chatHistory = $state<{ offset: number; end: number; page: ProviderPage<ProviderMessage> }>();
  let offer = $state<ProviderOffer>();
  let trade = $state<ProviderTrade>();
  let offset = $state(0);
  let draft = $state('');
  let description = $state('');
  let confirmation = $state<ProviderAction['action']>();
  let confirmationStatus: string | undefined;
  let pending = $state<TradeWrite>();
  let canRetryPending = $state(false);
  let updatesPaused = $state(false);
  let busy = $state(false);
  let status = $state('');
  let error = $state<ProviderApiError>();
  let controller: AbortController | undefined;
  let refreshController: AbortController | undefined;
  let nextRefresh = 0;
  let noticeId: number | undefined;
  let detailHeading = $state<HTMLHeadingElement>();

  const messages = $derived(chatHistory?.page ?? latestChat);
  const messageOffset = $derived(chatHistory?.offset ?? latestChat?.offset ?? 0);
  const amountCents = $derived(parseEuroAmount(amount));
  const canSearch = $derived(
    amountCents !== null && (!country || /^[A-Z]{2}$/.test(country.trim().toUpperCase()))
  );
  const actionLabels = {
    mark_paid: 'Mark payment sent',
    cancel_unfunded: 'Cancel trade request',
    open_dispute: 'Open dispute',
    withdraw_dispute: 'Withdraw dispute'
  } as const;
  const transactionLabels: Record<ProviderTransactionType, string> = {
    DEPOSIT: 'Deposit',
    WITHDRAW: 'Withdrawal',
    ESCROW: 'Escrow funding',
    ESCROW_RELEASE: 'Escrow release',
    ESCROW_REFUND: 'Escrow refund',
    ESCROW_FEE: 'Escrow fee'
  };
  const tradeStates: Record<string, string> = {
    CREATED: 'Trade requested',
    ACCEPTED: 'Trade accepted',
    REJECTED: 'Trade declined',
    WAITING_FOR_ESCROW: 'Waiting for escrow',
    BROADCASTING_ESCROW: 'Funding escrow',
    WAITING_FOR_MIN_ESCROW_CONFIRMS: 'Confirming escrow',
    BROADCASTING_ESCROW_FAILED: 'Escrow funding failed',
    CRYPTO_ESC_FAILED: 'Escrow funding failed',
    CRYPTO_ESC: 'Escrow funded',
    FUND_PAID: 'Payment marked sent',
    FUND_RECEIVED: 'Receipt confirmed',
    CRYPTO_REL: 'Bitcoin released',
    COMPLETED: 'Trade complete',
    EXPIRED: 'Trade expired',
    CANCELLED: 'Trade cancelled',
    CANCELLED_AFTER_ESCROW: 'Trade cancelled',
    CANCELLATION_REQUESTED: 'Cancellation requested',
    CANCELLATION_REJECTED: 'Cancellation declined',
    BROADCASTING_RELEASE: 'Releasing bitcoin',
    WAITING_FOR_CRYPTO_RELEASE_CONFIRMS: 'Confirming bitcoin release',
    BROADCASTING_RELEASE_FAILED: 'Bitcoin release failed',
    CRYPTO_REL_FAILED: 'Bitcoin release failed',
    DISPUTED: 'Disputed',
    WAITING_FOR_DISPUTE_CONFIRMS: 'Confirming dispute outcome',
    DISPUTE_RESOLVE_BUYER: 'Dispute resolved for buyer',
    DISPUTE_RESOLVE_SELLER: 'Dispute resolved for seller'
  };
  const errors: Record<string, string> = {
    invalid_request: 'Check the details and try again.',
    unauthorized: 'Enter the local access code to connect.',
    provider_auth: 'Check the API key for this trading account.',
    provider_unauthenticated: 'Check the API key for this trading account.',
    provider_forbidden: 'This trading account or key cannot perform that action.',
    provider_rejected: 'The trading service rejected the request. Check the trade details.',
    forbidden: 'This action is unavailable for the connected account.',
    not_found: 'The provider record or request could not be found.',
    wrong_trade_state: 'The trade status changed. Review the current step.',
    conflict: 'The request conflicts with the current trade or an earlier request.',
    rate_limited: 'Too many requests. Wait before trying again.',
    invalid_response: 'The provider response could not be verified.',
    invalid_provider_response: 'The provider response could not be verified.',
    operation_unknown:
      'The request may have reached the trading service. Check its result before acting again.',
    operation_pending: 'A request for this trade is already being processed.',
    writes_disabled: 'Trade actions are disabled for this connection.',
    provider_unavailable: 'The trading service is temporarily unavailable.',
    unavailable: 'The trading service is temporarily unavailable.'
  };

  function t(value: string) {
    return translate($locale, value);
  }
  function euro(cents: number) {
    return new Intl.NumberFormat($locale, { style: 'currency', currency: 'EUR' }).format(
      cents / 100
    );
  }
  function offerPrice(item: ProviderOffer) {
    const price = euro(item.pricePerBtcCents);
    return item.country === null
      ? translate($locale, '{price} per BTC', { price })
      : translate($locale, '{price} per BTC · {country}', { price, country: item.country });
  }
  function statusText(value: string) {
    return t(Object.hasOwn(tradeStates, value) ? tradeStates[value] : 'Awaiting provider update');
  }
  function errorText(code: string) {
    return t(
      Object.hasOwn(errors, code) ? errors[code] : 'The trading service is temporarily unavailable.'
    );
  }
  async function run(task: (signal: AbortSignal) => Promise<void>) {
    if (!enabled || busy) return;
    refreshController?.abort();
    if (noticeId !== undefined) dismissToast(noticeId);
    busy = true;
    error = undefined;
    status = '';
    const active = new AbortController();
    controller = active;
    try {
      await task(active.signal);
    } catch (cause) {
      if (!active.signal.aborted) {
        error = cause instanceof ProviderApiError ? cause : new ProviderApiError('unavailable');
        noticeId = toast({ title: errorText(error.code), tone: 'danger' });
      }
    } finally {
      if (controller === active) {
        controller = undefined;
        busy = false;
      }
    }
  }
  function announce(copy: string) {
    status = copy;
    noticeId = toast({ title: t(copy), tone: 'success' });
  }
  async function initialize() {
    await run(async (signal) => {
      capabilities = await api.capabilities({ signal });
    });
  }
  async function connect() {
    const entered = accessInput.trim();
    accessInput = '';
    await run(async (signal) => {
      const result = await api.capabilities({ token: entered, signal });
      if (!result.authenticated) throw new ProviderApiError('unauthorized');
      const live = await api.trades(
        { stage: 'live', limit, offset: 0 },
        { token: entered, signal }
      );
      if (signal.aborted) return;
      token = entered;
      capabilities = result;
      stage = 'live';
      trades = live;
      offset = 0;
      announce('Trading account connected.');
    });
  }
  function disconnect() {
    token = '';
    accessInput = '';
    trades = undefined;
    transactions = undefined;
    trade = undefined;
    clearChat();
    draft = '';
    description = '';
    confirmation = undefined;
    pending = undefined;
    canRetryPending = false;
    if (capabilities) capabilities = { ...capabilities, authenticated: false, tradeActions: false };
    tab = 'offers';
    status = '';
    error = undefined;
  }
  function resetOffers() {
    offers = undefined;
    offer = undefined;
    offset = 0;
  }
  function switchTab(next: Tab) {
    refreshController?.abort();
    tab = next;
    offer = undefined;
    trade = undefined;
    clearChat();
    draft = '';
    error = undefined;
    status = '';
    offset = 0;
    offers = undefined;
    trades = undefined;
    transactions = undefined;
    if (next === 'transactions') void listTransactions();
  }
  async function search(next = 0) {
    const cents = amountCents;
    if (!canSearch || cents === null) return;
    await run(async (signal) => {
      const result = await api.offers(
        {
          intent,
          amountCents: cents,
          country: country.trim().toUpperCase() || undefined,
          limit,
          offset: next
        },
        { signal }
      );
      if (signal.aborted) return;
      offer = undefined;
      offers = result;
      offset = next;
    });
  }
  async function selectOffer(id: string) {
    offer = undefined;
    await run(async (signal) => {
      offer = await api.offer(id, { signal });
      await tick();
      detailHeading?.focus();
    });
  }
  async function listTrades(next = 0) {
    await run(async (signal) => {
      const result = await api.trades({ stage, limit, offset: next }, { token, signal });
      if (signal.aborted) return;
      trades = result;
      trade = undefined;
      clearChat();
      draft = '';
      offset = next;
    });
  }
  async function selectTrade(id: string) {
    trade = undefined;
    clearChat();
    draft = '';
    await run(async (signal) => {
      trade = await api.trade(id, { token, signal });
      updatesPaused = false;
      nextRefresh = 0;
      await tick();
      detailHeading?.focus();
    });
    void refreshTrade();
  }
  async function listTransactions(next = 0) {
    await run(async (signal) => {
      const result = await api.transactions({ limit, offset: next }, { token, signal });
      if (signal.aborted) return;
      transactions = result;
      offset = next;
    });
  }
  function clearChat() {
    latestChat = undefined;
    chatHistory = undefined;
  }
  async function loadEarlierMessages(next: number, size: number) {
    const selected = trade;
    const end = chatHistory?.end ?? latestChat?.offset;
    if (!selected || end === undefined || next >= end) return;
    await run(async (signal) => {
      const page = await api.messages(
        selected.id,
        { limit: size, offset: next },
        { token, signal }
      );
      chatHistory = { offset: next, end, page };
    });
  }
  function beginAction(action: ProviderAction['action']) {
    confirmationStatus = trade?.status;
    description = '';
    confirmation = action;
  }
  async function submitAction() {
    const selected = trade;
    const action = confirmation;
    const expectedStatus = confirmationStatus;
    if (!selected || !action || !expectedStatus || pending) return;
    const body: ProviderAction =
      action === 'open_dispute'
        ? { action, expectedStatus, description: description.trim() }
        : { action, expectedStatus };
    confirmation = undefined;
    description = '';
    await run((signal) =>
      writeTrade({ key: crypto.randomUUID(), tradeId: selected.id, kind: 'action', body }, signal)
    );
  }
  async function writeTrade(write: TradeWrite, signal: AbortSignal) {
    const { tradeId, key } = write;
    try {
      if (write.kind === 'message') {
        const result = await api.send(tradeId, write.content, { token, signal, key });
        if (signal.aborted) return;
        if (trade?.id === tradeId) {
          draft = '';
          chatHistory = undefined;
          if (latestChat && !latestChat.items.some((item) => item.id === result.id)) {
            const items = [...latestChat.items, result].slice(-limit);
            const total = latestChat.total + 1;
            latestChat = { items, total, offset: total - items.length, nextOffset: null };
          }
        }
        announce('Message sent.');
      } else {
        const result = await api.act(tradeId, write.body, { token, signal, key });
        if (signal.aborted) return;
        if (trade?.id === tradeId) trade = { ...trade, status: result.status };
        announce('Trade updated.');
      }
      pending = undefined;
      canRetryPending = false;
      nextRefresh = 0;
    } catch (cause) {
      canRetryPending = false;
      if (
        cause instanceof ProviderApiError &&
        (cause.code === 'operation_unknown' || cause.code === 'operation_pending')
      )
        pending = write;
      else pending = undefined;
      throw cause;
    }
  }
  async function send() {
    const selected = trade;
    const content = draft.trim();
    if (!selected || !content || pending) return;
    await run((signal) =>
      writeTrade(
        { key: crypto.randomUUID(), tradeId: selected.id, kind: 'message', content },
        signal
      )
    );
  }
  async function checkOperation() {
    const write = pending;
    if (!write) return;
    await run(async (signal) => {
      if (canRetryPending) {
        await writeTrade(write, signal);
        return;
      }
      const result = await api.operation(write.key, { token, signal }).catch((cause: unknown) => {
        if (!(cause instanceof ProviderApiError) || cause.code !== 'not_found') throw cause;
        canRetryPending = true;
        announce('No receipt was found. You can retry this request safely.');
      });
      if (!result) return;
      if (result.status === 'pending' || result.status === 'unknown')
        throw new ProviderApiError(
          result.status === 'pending' ? 'operation_pending' : 'operation_unknown'
        );
      if (
        result.status === 'succeeded' &&
        write.kind === 'message' &&
        write.tradeId === trade?.id
      ) {
        draft = '';
        chatHistory = undefined;
      }
      pending = undefined;
      if (result.status === 'rejected')
        throw new ProviderApiError(result.error?.code ?? 'conflict');
      nextRefresh = 0;
      announce('Request confirmed.');
    });
    void refreshTrade();
  }
  async function refreshTrade() {
    const id = trade?.id;
    if (
      !id ||
      tab !== 'trades' ||
      busy ||
      refreshController ||
      document.hidden ||
      Date.now() < nextRefresh
    )
      return;
    const active = new AbortController();
    refreshController = active;
    try {
      const options = { token, signal: active.signal };
      const [detail, chat] = await Promise.allSettled([
        api.trade(id, options),
        api.latestMessages(id, limit, options)
      ]);
      if (active.signal.aborted || trade?.id !== id || busy) return;
      if (detail.status === 'fulfilled') trade = detail.value;
      if (chat.status === 'fulfilled') latestChat = chat.value;
      updatesPaused = detail.status === 'rejected' || chat.status === 'rejected';
      const retryAfter = [detail, chat].reduce(
        (seconds, result) =>
          result.status === 'rejected' && result.reason instanceof ProviderApiError
            ? Math.max(seconds, result.reason.retryAfterSeconds ?? 0)
            : seconds,
        0
      );
      nextRefresh = Date.now() + Math.max(updatesPaused ? 15 : 4, retryAfter) * 1000;
    } finally {
      if (refreshController === active) refreshController = undefined;
    }
  }
  onMount(() => {
    if (!enabled) return;
    void initialize();
    const timer = setInterval(() => void refreshTrade(), 1000);
    return () => {
      clearInterval(timer);
      refreshController?.abort();
      controller?.abort();
      if (noticeId !== undefined) dismissToast(noticeId);
      token = '';
    };
  });
</script>

<svelte:head><title>{t('Trade bitcoin')} {t('· Groot')}</title></svelte:head>
<section class="page provider-page">
  <header class="page-header">
    <div>
      <h1>{t('Trade bitcoin')}</h1>
      <p>{t('Bitcoin trades · EUR · SEPA Instant')}</p>
    </div>
    {#if enabled}
      <Button variant="ghost" size="small" onclick={() => (termsOpen = true)}
        >{t('Trading terms')}</Button
      >
    {/if}
  </header>
  {#if !enabled}
    <WarningNotice
      title={t('Provider testing is disabled')}
      body={t('Open Groot with the provider test launcher.')}
    />
    <Button href="/marketplace" variant="secondary">{t('Back to marketplace')}</Button>
  {:else if !capabilities}
    {#if error}
      <WarningNotice role="alert" tone="danger" body={errorText(error.code)} />
      <Button onclick={initialize}>{t('Try again')}</Button>
    {:else}
      <p role="status">{t('Checking the provider connection…')}</p>
    {/if}
  {:else}
    {#if capabilities.mode === 'fixture'}
      <WarningNotice
        title={t('Practice mode')}
        body={t('Use sample offers and trades to rehearse messages, payment claims and disputes.')}
      />
    {/if}
    {#if error}
      <WarningNotice role="alert" tone="danger" body={errorText(error.code)} />
      {#if error.retryAfterSeconds !== undefined}
        <p role="status">
          {translate($locale, 'Try again in {seconds} seconds.', {
            seconds: error.retryAfterSeconds
          })}
        </p>
      {/if}
    {/if}
    {#if status}<p role="status">{t(status)}</p>{/if}
    {#if pending}
      <InstructionCard title={t('Check the request result')}>
        <p>{t('Keep this reference until the provider result is known.')}</p>
        <code>{pending.key}</code>
        <small>{pending.tradeId}</small>
        <Button variant="secondary" loading={busy} onclick={checkOperation}
          >{t(canRetryPending ? 'Retry request' : 'Check request')}</Button
        >
      </InstructionCard>
    {/if}
    <nav class="provider-tabs" aria-label={t('Marketplace')}>
      <Button
        variant={tab === 'offers' ? 'secondary' : 'ghost'}
        ariaPressed={tab === 'offers'}
        disabled={busy}
        onclick={() => switchTab('offers')}>{t('Offers')}</Button
      >
      {#if capabilities.mode !== 'public'}
        <Button
          variant={tab === 'trades' ? 'secondary' : 'ghost'}
          ariaPressed={tab === 'trades'}
          disabled={busy}
          onclick={() => switchTab('trades')}>{t('Your trades')}</Button
        >
      {/if}
      {#if capabilities.authenticated}
        <Button
          variant={tab === 'transactions' ? 'secondary' : 'ghost'}
          ariaPressed={tab === 'transactions'}
          disabled={busy}
          onclick={() => switchTab('transactions')}>{t('Transactions')}</Button
        >
      {/if}
      {#if capabilities.mode === 'account' && capabilities.authenticated}
        <Button variant="ghost" disabled={busy} onclick={disconnect}>{t('Disconnect')}</Button>
      {/if}
    </nav>
    {#if tab === 'offers'}
      {#if !offer}
        <InstructionCard>
          <form
            onsubmit={(event) => {
              event.preventDefault();
              void search();
            }}
          >
            <div class="provider-tabs">
              <Button
                variant={intent === 'buy' ? 'secondary' : 'ghost'}
                ariaPressed={intent === 'buy'}
                disabled={busy}
                onclick={() => {
                  intent = 'buy';
                  resetOffers();
                }}>{t('Buy')}</Button
              >
              <Button
                variant={intent === 'sell' ? 'secondary' : 'ghost'}
                ariaPressed={intent === 'sell'}
                disabled={busy}
                onclick={() => {
                  intent = 'sell';
                  resetOffers();
                }}>{t('Sell')}</Button
              >
            </div>
            <div class="provider-fields">
              <label class="field"
                ><span>{t('Amount (EUR)')}</span><input
                  bind:value={amount}
                  oninput={resetOffers}
                  inputmode="decimal"
                  maxlength="12"
                  disabled={busy}
                /></label
              >
              <label class="field"
                ><span>{t('Country code (optional)')}</span><input
                  bind:value={country}
                  oninput={resetOffers}
                  maxlength="2"
                  placeholder={exampleCountry}
                  disabled={busy}
                /></label
              >
            </div>
            <p>{t('€50–€250. Prices are indicative and exclude final trade fees.')}</p>
            {#if capabilities.mode !== 'fixture'}
              <p>
                {t(
                  'Offer search shares the currency pair, selected country and connection IP with the trading provider.'
                )}
              </p>
            {/if}
            <Button type="submit" loading={busy} disabled={!canSearch}>{t('Find offers')}</Button>
          </form>
        </InstructionCard>
        {#if offers}
          {#if offers.items.length === 0}<p role="status">
              {t('No offers on this page match your amount.')}
            </p>{/if}
          {#each offers.items as item (item.id)}
            <InstructionCard>
              <h2>{item.maker}</h2>
              <p>{offerPrice(item)}</p>
              <p>{euro(item.minFiatCents)} – {euro(item.maxFiatCents)}</p>
              <Button variant="secondary" disabled={busy} onclick={() => selectOffer(item.id)}
                >{t('Review offer')}</Button
              >
            </InstructionCard>
          {/each}
          {@render pagination(offset, offers.nextOffset, search)}
        {/if}
      {:else}
        <InstructionCard title={t('Offer details')}>
          <h2 tabindex="-1" bind:this={detailHeading}>{offer.maker}</h2>
          <p>{offerPrice(offer)}</p>
          {#if offer.terms}<p class="preserve-lines">{offer.terms}</p>{/if}
          <WarningNotice body={t('Starting new trades is unavailable in this preview.')} />
          <Button variant="ghost" onclick={() => (offer = undefined)}>{t('Back to offers')}</Button>
        </InstructionCard>
      {/if}
    {:else if !capabilities.authenticated}
      <InstructionCard title={t('Connect your trading account')}>
        <form
          onsubmit={(event) => {
            event.preventDefault();
            void connect();
          }}
        >
          <PasswordField
            bind:value={accessInput}
            label={t('Local access code')}
            autocomplete="off"
            disabled={busy}
          />
          <Button type="submit" loading={busy} disabled={!accessInput.trim()}>{t('Connect')}</Button
          >
        </form>
      </InstructionCard>
    {:else if tab === 'transactions'}
      <h2>{t('Trading transactions')}</h2>
      {#if transactions}
        {#if transactions.items.length === 0}
          <p role="status">{t('No bitcoin transactions yet.')}</p>
        {/if}
        {#each transactions.items as transaction (transaction.id)}
          <InstructionCard>
            <div class="transaction-heading">
              <h3>{t(transactionLabels[transaction.type])}</h3>
              {#if transaction.sats !== null}
                <Amount value={transaction.sats} hidden={$discreetMode} interactive />
              {/if}
            </div>
            <p>
              {t(
                transaction.confirmed === null
                  ? 'Confirmation unavailable'
                  : transaction.confirmed
                    ? 'Confirmed'
                    : 'Pending'
              )}
              {#if (transaction.confirmedAtMs ?? transaction.firstSeenAtMs) !== null}
                · <LocalTimestamp
                  value={String(transaction.confirmedAtMs ?? transaction.firstSeenAtMs)}
                />
              {/if}
            </p>
            {#if transaction.txid}
              <details>
                <summary>{t('Transaction ID')}</summary>
                <code>{transaction.txid}</code>
              </details>
            {/if}
          </InstructionCard>
        {/each}
        {@render pagination(offset, transactions.nextOffset, listTransactions)}
      {:else if busy}
        <p role="status">{t('Loading transactions…')}</p>
      {:else}
        <Button variant="secondary" onclick={() => listTransactions()}>{t('Try again')}</Button>
      {/if}
    {:else}
      {#if !trade}
        <InstructionCard>
          <div class="provider-tabs">
            <Button
              variant={stage === 'live' ? 'secondary' : 'ghost'}
              ariaPressed={stage === 'live'}
              disabled={busy}
              onclick={() => {
                stage = 'live';
                void listTrades();
              }}>{t('Active trades')}</Button
            >
            <Button
              variant={stage === 'past' ? 'secondary' : 'ghost'}
              ariaPressed={stage === 'past'}
              disabled={busy}
              onclick={() => {
                stage = 'past';
                void listTrades();
              }}>{t('Past trades')}</Button
            >
          </div>
        </InstructionCard>
        {#if trades}
          {#if trades.items.length === 0}<p role="status">{t('No trades in this view.')}</p>{/if}
          {#each trades.items as item (item.id)}
            <InstructionCard>
              <h2>{statusText(item.status)} · {euro(item.fiatCents)}</h2>
              <p>{item.buyer} → {item.seller}</p>
              <Button variant="secondary" disabled={busy} onclick={() => selectTrade(item.id)}
                >{t('View trade')}</Button
              >
            </InstructionCard>
          {/each}
          {@render pagination(offset, trades.nextOffset, listTrades)}
        {:else}
          <Button variant="secondary" loading={busy} onclick={() => listTrades()}
            >{t('Load trades')}</Button
          >
        {/if}
      {:else}
        {#if updatesPaused}<p role="status">{t('Updates paused. Reconnecting…')}</p>{/if}
        <InstructionCard>
          <h2 tabindex="-1" bind:this={detailHeading}>{statusText(trade.status)}</h2>
          <dl class="details-list">
            <div>
              <dt>{t('Buyer')}</dt>
              <dd>{trade.buyer}</dd>
            </div>
            <div>
              <dt>{t('Seller')}</dt>
              <dd>{trade.seller}</dd>
            </div>
            <div>
              <dt>{t('Amount (EUR)')}</dt>
              <dd>{euro(trade.fiatCents)}</dd>
            </div>
            <div>
              <dt>{t('Bitcoin')}</dt>
              <dd><Amount value={trade.bitcoinSats} hidden={$discreetMode} interactive /></dd>
            </div>
            <div>
              <dt>{t('Trade ID')}</dt>
              <dd><code>{trade.id}</code></dd>
            </div>
            {#if trade.expiresAtMs !== null}
              <div>
                <dt>{t('Provider deadline')}</dt>
                <dd><LocalTimestamp value={String(trade.expiresAtMs)} /></dd>
              </div>
            {/if}
          </dl>
          <div class="provider-tabs">
            {#if capabilities.tradeActions}
              {#if trade.status === 'CRYPTO_ESC'}
                <Button disabled={busy || Boolean(pending)} onclick={() => beginAction('mark_paid')}
                  >{t(actionLabels.mark_paid)}</Button
                >
              {:else if trade.status === 'CREATED'}
                <Button
                  variant="secondary"
                  disabled={busy || Boolean(pending)}
                  onclick={() => beginAction('cancel_unfunded')}
                  >{t(actionLabels.cancel_unfunded)}</Button
                >
              {/if}
              {#if trade.status === 'CRYPTO_ESC' || trade.status === 'FUND_PAID'}
                <Button
                  variant="secondary"
                  disabled={busy || Boolean(pending)}
                  onclick={() => beginAction('open_dispute')}>{t(actionLabels.open_dispute)}</Button
                >
              {:else if trade.status === 'DISPUTED'}
                <Button
                  variant="secondary"
                  disabled={busy || Boolean(pending)}
                  onclick={() => beginAction('withdraw_dispute')}
                  >{t(actionLabels.withdraw_dispute)}</Button
                >
              {/if}
            {/if}
          </div>
        </InstructionCard>
        <Button
          variant="ghost"
          disabled={busy}
          onclick={() => {
            refreshController?.abort();
            trade = undefined;
            clearChat();
            draft = '';
            void listTrades(offset);
          }}>{t('Back to trades')}</Button
        >
        <InstructionCard title={t('Trade chat')}>
          {#if messages}
            {#if messages.items.length === 0}<p role="status">{t('No messages yet.')}</p>{/if}
            <ul class="provider-messages" aria-label={t('Trade chat')}>
              {#each messages.items as item (item.id)}
                <li>
                  <strong>{item.sender}</strong>
                  <p class="preserve-lines">{item.content}</p>
                  {#if item.hasAttachment}<small
                      >{t('Attachments are available with the trading provider.')}</small
                    >{/if}
                </li>
              {/each}
            </ul>
            {#if messageOffset > 0 || chatHistory}
              <div class="provider-tabs">
                {#if messageOffset > 0}
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onclick={() =>
                      loadEarlierMessages(
                        Math.max(0, messageOffset - limit),
                        Math.min(limit, messageOffset)
                      )}>{t('Earlier messages')}</Button
                  >
                {/if}
                {#if chatHistory}
                  {@const next = messages.nextOffset}
                  {@const end = chatHistory.end}
                  {#if next !== null && next < end}
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onclick={() => loadEarlierMessages(next, Math.min(limit, end - next))}
                      >{t('Later messages')}</Button
                    >
                  {/if}
                  <Button variant="ghost" disabled={busy} onclick={() => (chatHistory = undefined)}
                    >{t('Latest messages')}</Button
                  >
                {/if}
              </div>
            {/if}
          {:else}
            <p role="status">{t('Connecting to chat…')}</p>
          {/if}
          {#if capabilities.tradeActions}
            <form
              onsubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <label class="field"
                ><span>{t('Message')}</span><textarea
                  bind:value={draft}
                  maxlength="1000"
                  rows="2"
                  disabled={busy || Boolean(pending)}></textarea></label
              >
              <Button type="submit" loading={busy} disabled={!draft.trim() || Boolean(pending)}
                >{t('Send message')}</Button
              >
            </form>
          {/if}
        </InstructionCard>
      {/if}
    {/if}
  {/if}
</section>

<Modal open={termsOpen} title={t('Trading terms')} onclose={() => (termsOpen = false)}>
  <div class="modal-form">
    <p>
      {t('LocalCoinSwap provides the offer book, trading accounts, escrow and dispute support.')}
    </p>
    <div class="provider-tabs">
      <a href="https://localcoinswap.com/terms-of-service" target="_blank" rel="noopener noreferrer"
        >{t('Terms of service')}</a
      >
      <a href="https://localcoinswap.com/privacy" target="_blank" rel="noopener noreferrer"
        >{t('Privacy policy')}</a
      >
    </div>
  </div>
</Modal>

{#snippet pagination(previous: number, next: number | null, load: (page: number) => Promise<void>)}
  {#if previous > 0 || next !== null}
    <div class="provider-tabs">
      <Button
        variant="ghost"
        disabled={busy || previous === 0}
        onclick={() => load(Math.max(0, previous - limit))}>{t('Previous page')}</Button
      >
      <Button
        variant="ghost"
        disabled={busy || next === null}
        onclick={() => next !== null && load(next)}>{t('Next page')}</Button
      >
    </div>
  {/if}
{/snippet}

<Modal
  open={Boolean(confirmation)}
  title={confirmation ? t(actionLabels[confirmation]) : ''}
  onclose={() => (confirmation = undefined)}
>
  <div class="modal-form">
    {#if confirmation === 'mark_paid'}
      <WarningNotice body={t('Confirm only after you have sent the full bank payment.')} />
    {:else if confirmation === 'cancel_unfunded'}
      <WarningNotice body={t('Cancel only while you are still waiting for escrow.')} />
    {:else if confirmation === 'open_dispute'}
      <label class="field"
        ><span>{t('Describe the dispute')}</span><textarea
          bind:value={description}
          maxlength="1000"
          rows="4"></textarea></label
      >
    {:else}
      <p>{t('This withdraws your dispute.')}</p>
    {/if}
    <Button
      disabled={busy || (confirmation === 'open_dispute' && !description.trim())}
      onclick={submitAction}>{t('Confirm')}</Button
    >
  </div>
</Modal>

<style>
  .provider-page {
    display: grid;
    gap: 14px;
    max-width: 760px;
  }
  .provider-page .page-header {
    min-height: 0;
    margin-bottom: 6px;
  }
  .transaction-heading {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 8px;
  }
  .transaction-heading h3 {
    font-size: inherit;
    margin: 0;
  }
  .provider-page form {
    display: grid;
    gap: 10px;
  }
  .provider-tabs,
  .provider-fields {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: end;
  }
  .provider-fields label {
    flex: 1 1 12rem;
    margin: 0;
  }
  .provider-page h2,
  .provider-page p {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .provider-page h2 {
    font-size: 1rem;
  }
  .provider-page code {
    overflow-wrap: anywhere;
  }
  .provider-messages {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .provider-messages li {
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
    overflow-wrap: anywhere;
  }
  .preserve-lines {
    white-space: pre-wrap;
  }
</style>
