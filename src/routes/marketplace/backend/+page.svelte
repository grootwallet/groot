<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { Copy } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import Amount from '$lib/components/Amount.svelte';
  import PasswordField from '$lib/components/PasswordField.svelte';
  import InstructionCard from '$lib/components/InstructionCard.svelte';
  import SetupProgress from '$lib/components/SetupProgress.svelte';
  import WarningNotice from '$lib/components/WarningNotice.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import ToastHost from '$lib/components/ToastHost.svelte';
  import LocalTimestamp from '$lib/components/LocalTimestamp.svelte';
  import { copyText } from '$lib/clipboard';
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import type { MessageValues } from '$lib/locales/types';
  import { toast, dismissToast } from '$lib/stores/toasts';
  import { isPrototypeWallet } from '$lib/wallet';
  import { parseEuroAmount } from '$lib/marketplace';
  import {
    sandboxEscrowPayment,
    sandboxPaymentReference,
    TRADE_STEPS,
    tradeEventLabel,
    tradeProgress
  } from '$lib/marketplace/trade-presentation';
  import {
    backendRequest,
    BackendError,
    decodeSession,
    decodeQuote,
    decodeTrade,
    decodeTradeMessages,
    decodePaymentInstructions,
    decodeWorkspace,
    mutation,
    type Session,
    type Counterparty,
    type Quote,
    type Trade,
    type Message,
    type TradeEvent,
    type Mutation,
    type PaymentInstructions,
    type Workspace,
    PRACTICE_ACCOUNT_HOLDER
  } from '$lib/marketplace/backend-client';

  const enabled = isPrototypeWallet && __GROOT_MARKETPLACE_BACKEND__;
  const exampleHolder = 'TEST SELLER01';
  const exampleIban = 'DE00 0000 0000 0000 1234 56';
  let session = $state<Session>({ account: null });
  let username = $state('');
  let password = $state('');
  let registering = $state(true);
  let checkingSession = $state(enabled);
  let sessionReadFailed = $state(false);
  let busy = $state(false);
  let error = $state('');
  let status = $state('');
  let intent = $state<'buy' | 'sell'>('buy');
  let amount = $state('150');
  let quote = $state<Quote | null>(null);
  let trade = $state<Trade | null>(null);
  let counterparty = $state<Counterparty | null>(null);
  let trades = $state<Trade[]>([]);
  let messages = $state<Message[]>([]);
  let events = $state<TradeEvent[]>([]);
  let message = $state('');
  let chatThread = $state<HTMLOListElement>();
  let depositQr = $state('');
  let depositQrFailed = $state(false);
  let bankDetails = $state<PaymentInstructions | null>(null);
  let bankHolder = $state('');
  let bankIban = $state('');
  let reconnecting = $state(false);
  const toolLabels = {
    options: 'Trade options',
    test: 'Test controls',
    activity: 'Trade activity',
    trades: 'Trade history',
    account: 'Account'
  } as const;
  type TradeTool = keyof typeof toolLabels;
  let panel = $state<TradeTool | null>(null);
  let receiptOpen = $state(false);
  let receiptChecked = $state(false);
  let pending = $state<Mutation | null>(null);
  let savedTradeId = $state<string | undefined>();
  const needsRefresh = $derived(savedTradeId !== undefined);
  let expiredQuoteId = $state<string>();
  let stageHeading: HTMLHeadingElement | undefined = $state();
  let chatHeading: HTMLHeadingElement | undefined = $state();
  let amountInput: HTMLInputElement | undefined = $state();
  const locked = $derived(busy || pending !== null || needsRefresh);
  const simulatedPeer = $derived(counterparty?.isSystem === true);
  const chatTradeId = $derived(trade?.id);
  const chatAccountId = $derived(session.account?.id);
  const chatCsrf = $derived(session.csrfToken);
  const deposit = $derived(
    trade?.role === 'seller' && trade.state === 'escrow_pending' && (simulatedPeer || bankDetails)
      ? sandboxEscrowPayment(trade.id, trade.quote.grossSats)
      : null
  );
  const depositUri = $derived(deposit?.uri);
  const buyerBankDetails = $derived(
    trade?.role === 'buyer' && trade.state === 'awaiting_payment'
      ? (bankDetails ??
          (simulatedPeer
            ? {
                recipient: 'TEST SELLER',
                iban: 'DE00 0000 0000 0000 0000 00',
                reference: sandboxPaymentReference(trade.id)
              }
            : null))
      : null
  );
  const receiptReference = $derived(
    bankDetails?.reference ?? (trade && simulatedPeer ? sandboxPaymentReference(trade.id) : null)
  );
  const latestMessageId = $derived(messages.at(-1)?.id);
  const validBankDetails = $derived(
    PRACTICE_ACCOUNT_HOLDER.test(bankHolder.trim().toUpperCase()) &&
      /^DE00000000000000[0-9]{6}$/.test(bankIban.toUpperCase().replaceAll(' ', ''))
  );
  const progress = $derived(trade ? tradeProgress(trade.state, events) : null);
  const quoteExpired = $derived(quote !== null && expiredQuoteId === quote.id);
  const quickAmounts = [5000, 10000, 15000, 25000];
  let current: AbortController | null = null;
  let alive = true;
  let feedbackToast: number | undefined;
  let viewEpoch = 0;
  let flushUpdates: (() => Promise<void>) | undefined;
  function clearFeedback() {
    if (feedbackToast !== undefined) dismissToast(feedbackToast);
    feedbackToast = undefined;
  }
  function showFeedback(input: Parameters<typeof toast>[0]) {
    clearFeedback();
    if (alive) feedbackToast = toast(input);
  }
  const cents = $derived(parseEuroAmount(amount));
  const terminal = $derived(
    trade !== null && ['completed', 'cancelled', 'refunded'].includes(trade.state)
  );
  const tradeTools = $derived(
    (Object.keys(toolLabels) as TradeTool[]).filter((tool) => {
      switch (tool) {
        case 'options':
          return trade !== null && !terminal && trade.state !== 'disputed';
        case 'test':
          return (
            trade?.state === 'disputed' ||
            (trade?.state === 'refund_pending' && trade.role === 'seller' && simulatedPeer)
          );
        case 'activity':
          return trade !== null;
        case 'trades':
          return trades.length > 0;
        case 'account':
          return true;
      }
    })
  );
  const stateCopy = {
    escrow_pending: 'Waiting for seller',
    awaiting_payment: 'Send payment',
    payment_sent: 'Waiting for the seller',
    release_pending: 'Release pending',
    completed: 'Trade complete',
    cancelled: 'Trade cancelled',
    refund_pending: 'Refund pending',
    refunded: 'Bitcoin refunded',
    disputed: 'Trade paused'
  } as const;
  function tradeHeading(value: Trade) {
    if (value.role === 'seller') {
      if (value.state === 'escrow_pending') return 'Lock bitcoin';
      if (value.state === 'awaiting_payment') return 'Waiting for payment';
      if (value.state === 'payment_sent') return 'Check your bank';
    }
    return stateCopy[value.state];
  }
  function t(value: string, values?: MessageValues) {
    return translate($locale, value, values);
  }
  async function focusStage() {
    await tick();
    if (alive) stageHeading?.focus();
  }
  function jumpToChat(event: MouseEvent) {
    event.preventDefault();
    chatHeading?.focus();
    chatHeading?.scrollIntoView({ block: 'start' });
  }
  function closeReceipt() {
    receiptOpen = false;
    receiptChecked = false;
  }
  function openReceipt() {
    if (
      !alive ||
      checkSessionDeadline() ||
      !trade ||
      trade.role !== 'seller' ||
      trade.state !== 'payment_sent' ||
      !counterparty ||
      !receiptReference
    )
      return;
    clearFeedback();
    receiptChecked = false;
    receiptOpen = true;
  }
  function clearConversation() {
    message = '';
    panel = null;
    bankHolder = '';
    bankIban = '';
  }
  function toggleTool(tool: TradeTool) {
    clearFeedback();
    panel = panel === tool ? null : tool;
  }
  function clearSelection() {
    trade = null;
    counterparty = null;
    bankDetails = null;
    quote = null;
    expiredQuoteId = undefined;
    messages = [];
    events = [];
    clearConversation();
    closeReceipt();
  }
  function euro(c: number, compact = false) {
    return new Intl.NumberFormat($locale, {
      style: 'currency',
      currency: 'EUR',
      ...(compact ? { minimumFractionDigits: 0 } : {})
    }).format(c / 100);
  }
  function copyBankPayment(value: Trade, details: PaymentInstructions) {
    return copyPayment(
      [
        `${t('Amount')}: ${euro(value.quote.fiatCents)}`,
        `${t('Account holder')}: ${details.recipient}`,
        `${t('IBAN')}: ${details.iban}`,
        `${t('Payment reference')}: ${details.reference}`
      ].join('\n')
    );
  }
  async function copyPayment(value: string, kind: 'bitcoin-address' | 'identifier' = 'identifier') {
    if (checkSessionDeadline()) return;
    const epoch = viewEpoch;
    try {
      await copyText(value, kind);
      if (!alive || epoch !== viewEpoch) return;
      status = 'Copied to clipboard.';
      showFeedback({ title: t(status), tone: 'success' });
    } catch {
      if (!alive || epoch !== viewEpoch) return;
      status = 'Could not copy. Select the value to copy it.';
      showFeedback({ title: t(status), tone: 'warning' });
    }
  }
  async function request<T>(
    path: string,
    decode: (v: unknown) => T,
    options: Parameters<typeof backendRequest<T>>[2] = {}
  ) {
    return backendRequest(path, decode, {
      ...options,
      csrf: session.csrfToken,
      signal: current?.signal
    });
  }
  function resetSessionView(preserveUsername = false) {
    const enteredUsername = preserveUsername ? username : '';
    session = { account: null };
    username = enteredUsername;
    password = '';
    clearSelection();
    trades = [];
    pending = null;
    savedTradeId = undefined;
    intent = 'buy';
    amount = '150';
    status = '';
  }
  function failure(cause: unknown, startedSignedIn = false) {
    const code = cause instanceof BackendError ? cause.code : 'unavailable';
    const wasSignedIn = startedSignedIn || session.account !== null;
    if (code === 'quote_expired') expiredQuoteId = quote?.id;
    if (code === 'unauthenticated') {
      // Retain an entered login name for a wrong-password retry, while removing
      // every draft and acknowledgment belonging to a previously signed-in user.
      resetSessionView(!wasSignedIn);
      if (wasSignedIn) registering = false;
    }
    error =
      code === 'unauthenticated'
        ? wasSignedIn
          ? 'Sign in again to continue.'
          : 'Check your test username and password, then try again.'
        : code === 'quote_expired'
          ? 'Quote expired.'
          : code === 'conflict'
            ? wasSignedIn
              ? 'The trade changed. Refresh its status before continuing.'
              : 'That test username already exists. Sign in or choose another.'
            : code === 'forbidden'
              ? 'This action is not available to your account.'
              : code === 'rate_limited'
                ? 'Too many requests. Wait a minute before trying again.'
                : code === 'invalid_request'
                  ? 'Check the entered details and try again.'
                  : needsRefresh
                    ? 'Your action was saved. Refresh status to continue.'
                    : 'The test service is unavailable. Your saved trades are kept.';
    showFeedback({ title: t(error), tone: 'warning' });
  }
  async function run(action: () => Promise<unknown>) {
    if (busy || !enabled || checkSessionDeadline()) return;
    clearFeedback();
    const startedSignedIn = session.account !== null;
    viewEpoch += 1;
    busy = true;
    error = '';
    status = '';
    const controller = new AbortController();
    current = controller;
    try {
      await action();
    } catch (cause) {
      if (alive && !controller.signal.aborted) failure(cause, startedSignedIn);
    } finally {
      if (alive) busy = false;
      current = null;
      if (alive) void flushUpdates?.();
    }
  }
  function expireSession() {
    current?.abort();
    viewEpoch += 1;
    failure(new BackendError('unauthenticated'), true);
  }
  function checkSessionDeadline() {
    if (session.expiresAt === undefined || Date.now() < session.expiresAt) return false;
    expireSession();
    return true;
  }
  async function restoreSession() {
    checkingSession = true;
    let restored = false;
    await run(async () => {
      await refresh(undefined, true);
      restored = true;
    });
    if (alive) {
      checkingSession = false;
      sessionReadFailed = !restored;
    }
  }
  async function refresh(selectedTradeId = savedTradeId ?? trade?.id, allowAnonymous = false) {
    // The HttpOnly cookie may have changed in another tab. One canonical read
    // binds identity, trades and history to the same database snapshot.
    const workspace = await backendRequest(
      selectedTradeId ? `/v1/workspace?tradeId=${selectedTradeId}` : '/v1/workspace',
      decodeWorkspace,
      { signal: current?.signal }
    );
    if (!workspace.session.account) {
      resetSessionView();
      if (!allowAnonymous) {
        registering = false;
        throw new BackendError('unauthenticated');
      }
      return;
    }
    if (
      workspace.session.account.id !== session.account?.id ||
      workspace.session.csrfToken !== session.csrfToken
    )
      resetSessionView();
    applyWorkspace(workspace);
    savedTradeId = undefined;
  }
  function applyWorkspace(workspace: Workspace) {
    if (workspace.selected?.trade.id !== trade?.id) clearConversation();
    if (
      workspace.selected?.trade.id !== trade?.id ||
      workspace.selected?.trade.revision !== trade?.revision
    )
      closeReceipt();
    session = workspace.session;
    trades = workspace.trades;
    trade = workspace.selected?.trade ?? null;
    counterparty = workspace.selected?.counterparty ?? null;
    bankDetails = workspace.selected?.paymentInstructions ?? null;
    messages = workspace.selected?.messages ?? [];
    events = workspace.selected?.events ?? [];
    if (trade) quote = null;
  }
  async function authenticate() {
    const entered = password;
    password = '';
    await run(async () => {
      try {
        session = await backendRequest(
          registering ? '/v1/accounts' : '/v1/sessions',
          decodeSession,
          { method: 'POST', body: { username, password: entered }, signal: current?.signal }
        );
        username = '';
        await refresh();
        status = 'Signed in to the test marketplace.';
        showFeedback({ title: t(status), tone: 'success' });
      } finally {
        password = '';
      }
    });
  }
  async function mutate<T>(operation: Mutation, decode: (value: unknown) => T): Promise<T> {
    pending = operation;
    try {
      const result = await request(operation.path, decode, {
        method: 'POST',
        body: operation.body,
        key: operation.key
      });
      pending = null;
      return result;
    } catch (cause) {
      if (cause instanceof BackendError && !cause.ambiguous) pending = null;
      throw cause;
    }
  }
  async function readQuote(operation: Mutation) {
    const expected = operation.body as { intent: Quote['intent']; amountCents: number };
    quote = await mutate(operation, (value) => {
      const next = decodeQuote(value);
      if (next.intent !== expected.intent || next.fiatCents !== expected.amountCents)
        throw new BackendError('invalid_response', true);
      return next;
    });
    expiredQuoteId = undefined;
    await focusStage();
  }
  function review(preset?: number) {
    if (locked) return;
    const requested = preset ?? cents;
    if (requested === null) return;
    if (preset !== undefined) amount = String(preset / 100);
    return run(async () => {
      try {
        await readQuote(mutation('/v1/sandbox/quotes', { intent, amountCents: requested }));
      } catch (cause) {
        if (!(cause instanceof BackendError) || cause.code !== 'not_found') throw cause;
        status = 'No matching offers';
        showFeedback({ title: t(status), tone: 'warning' });
      }
    });
  }
  async function editAmount() {
    if (locked) return;
    quote = null;
    expiredQuoteId = undefined;
    error = '';
    status = '';
    clearFeedback();
    await tick();
    if (alive) amountInput?.focus();
  }
  async function saveTrade(operation: Mutation) {
    const saved = await mutate(operation, decodeTrade);
    savedTradeId = saved.id;
    await refresh();
    status = 'Trade status saved.';
    showFeedback({
      title: t(tradeEventLabel(trade?.id === saved.id ? (events.at(-1)?.kind ?? '') : '')),
      tone: 'success'
    });
    await focusStage();
  }
  function startTrade() {
    if (locked || !quote || quoteExpired) return;
    const quoteId = quote.id;
    if (Date.now() >= quote.expiresAt) {
      expiredQuoteId = quoteId;
      return;
    }
    return run(() => saveTrade(mutation('/v1/trades', { quoteId })));
  }
  async function command(action: string, simulated = false) {
    if (!trade) return;
    if (action === 'mark_paid' && trade.state === 'awaiting_payment' && !buyerBankDetails) return;
    return saveTrade(
      mutation(
        simulated ? `/v1/sandbox/trades/${trade.id}/events` : `/v1/trades/${trade.id}/commands`,
        { action, expectedRevision: trade.revision }
      )
    );
  }
  async function saveBankDetails(operation: Mutation, tradeId: string) {
    await mutate(operation, (value) => decodePaymentInstructions(value, tradeId));
    savedTradeId = tradeId;
    await refresh();
    bankHolder = '';
    bankIban = '';
    status = 'Bank details saved.';
    showFeedback({ title: t(status), tone: 'success' });
  }
  function release() {
    if (
      locked ||
      !receiptChecked ||
      !receiptOpen ||
      trade?.role !== 'seller' ||
      trade.state !== 'payment_sent' ||
      !counterparty ||
      !receiptReference
    )
      return;
    const operation = mutation(`/v1/trades/${trade.id}/commands`, {
      action: 'confirm_receipt',
      expectedRevision: trade.revision,
      receiptAcknowledged: true
    });
    closeReceipt();
    return run(() => saveTrade(operation));
  }
  async function retry() {
    if (!pending) return;
    const operation = pending;
    if (trade && operation.path === `/v1/trades/${trade.id}/payment-instructions`) {
      await saveBankDetails(operation, trade.id);
      return;
    } else if (operation.path === '/v1/sandbox/quotes') {
      await readQuote(operation);
    } else {
      if (operation.path.endsWith('/messages')) {
        await mutate(operation, (value) => value);
        message = '';
        savedTradeId = trade?.id;
      } else {
        const saved = await mutate(operation, decodeTrade);
        savedTradeId = saved.id;
      }
      await refresh();
      await focusStage();
    }
    status = 'Request recovered. No duplicate action was created.';
    showFeedback({ title: t(status), tone: 'success' });
  }
  function refreshStatus() {
    return run(async () => {
      await refresh();
      await focusStage();
    });
  }
  $effect(() => {
    const tradeId = chatTradeId;
    const accountId = chatAccountId;
    const csrf = chatCsrf;
    const selected = untrack(() => trade);
    if (!enabled || !tradeId || !accountId || !csrf || !selected) return;

    const controller = new AbortController();
    const path = `/v1/trades/${tradeId}`;
    const stream = new EventSource(`${path}/chat-updates`);
    let chatDirty = false;
    let tradeDirty = false;
    let tradeReadFailed = false;
    let reading = false;
    let offlineTimer: ReturnType<typeof setTimeout> | undefined;
    const sameView = () =>
      !controller.signal.aborted &&
      chatTradeId === tradeId &&
      chatAccountId === accountId &&
      chatCsrf === csrf;
    const markReconnecting = () => {
      offlineTimer ??= setTimeout(() => {
        if (sameView()) reconnecting = true;
      }, 3000);
    };
    const flush = async () => {
      if ((!chatDirty && !tradeDirty) || reading || locked || !sameView()) return;
      const readTrade = tradeDirty || tradeReadFailed;
      chatDirty = false;
      tradeDirty = false;
      reading = true;
      const epoch = viewEpoch;
      const options = { csrf, signal: controller.signal };
      try {
        const update = readTrade
          ? {
              workspace: await backendRequest(
                `/v1/workspace?tradeId=${tradeId}`,
                decodeWorkspace,
                options
              )
            }
          : {
              thread: await backendRequest(
                `${path}/messages`,
                (value) => decodeTradeMessages(value, selected),
                options
              )
            };
        if (!sameView()) return;
        // A foreground operation may have saved a later revision during this read.
        if (locked || viewEpoch !== epoch) {
          if (readTrade) tradeDirty = true;
          else chatDirty = true;
          return;
        }
        if (update.workspace) {
          const next = update.workspace;
          if (
            next.session.account?.id !== accountId ||
            next.session.csrfToken !== csrf ||
            next.selected?.trade.id !== tradeId
          )
            throw new BackendError('unauthenticated');
          applyWorkspace(next);
        } else {
          messages = update.thread;
        }
        clearTimeout(offlineTimer);
        offlineTimer = undefined;
        tradeReadFailed = false;
        reconnecting = false;
      } catch (cause) {
        if (!sameView() || locked || viewEpoch !== epoch) return;
        if (
          cause instanceof BackendError &&
          ['unauthenticated', 'forbidden'].includes(cause.code)
        ) {
          failure(new BackendError('unauthenticated'), true);
        } else {
          tradeReadFailed ||= readTrade;
          markReconnecting();
        }
      } finally {
        reading = false;
        if (chatDirty || tradeDirty) void flush();
      }
    };
    const chatUpdate = () => {
      chatDirty = true;
      void flush();
    };
    const tradeUpdate = () => {
      tradeDirty = true;
      void flush();
    };
    flushUpdates = flush;
    stream.addEventListener('chat-update', chatUpdate);
    stream.addEventListener('trade-update', tradeUpdate);
    stream.addEventListener('open', tradeUpdate);
    stream.addEventListener('error', markReconnecting);
    return () => {
      clearTimeout(offlineTimer);
      controller.abort();
      stream.close();
      reconnecting = false;
      if (flushUpdates === flush) flushUpdates = undefined;
    };
  });
  $effect(() => {
    const thread = chatThread;
    if (!thread || !latestMessageId) return;
    void tick().then(() => {
      if (chatThread === thread) thread.scrollTop = thread.scrollHeight;
    });
  });
  $effect(() => {
    const payload = depositUri;
    depositQr = '';
    depositQrFailed = false;
    if (!payload) return;
    let active = true;
    void import('qrcode')
      .then(({ default: encoder }) =>
        active
          ? encoder.toDataURL(payload, { width: 160, margin: 2, errorCorrectionLevel: 'M' })
          : ''
      )
      .then((image) => {
        if (active) depositQr = image;
      })
      .catch(() => {
        if (active) depositQrFailed = true;
      });
    return () => {
      active = false;
    };
  });
  function watchDeadline(deadline: number, onCheck: (currentTime: number) => void) {
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      clearTimeout(timer);
      const currentTime = Date.now();
      onCheck(currentTime);
      if (currentTime < deadline)
        timer = setTimeout(check, Math.min(deadline - currentTime, 2_147_483_647));
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    untrack(check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }
  $effect(() => {
    const displayed = quote;
    if (!displayed) return;
    return watchDeadline(displayed.expiresAt, (currentTime) => {
      if (currentTime >= displayed.expiresAt && quote?.id === displayed.id)
        expiredQuoteId = displayed.id;
    });
  });
  $effect(() => {
    const deadline = session.expiresAt;
    const csrf = session.csrfToken;
    if (deadline === undefined || !csrf) return;
    return watchDeadline(deadline, (currentTime) => {
      if (currentTime >= deadline && session.csrfToken === csrf) expireSession();
    });
  });
  onMount(() => {
    if (enabled) void restoreSession();
    return () => {
      alive = false;
      clearFeedback();
      current?.abort();
      password = '';
      session = { account: null };
    };
  });
</script>

<svelte:head><title>{t('Trade bitcoin')} {t('· Groot')}</title></svelte:head>
<section class="page backend-page" class:trade-active={trade !== null}>
  <header class="page-header trade-header">
    <div>
      <h1>{t('Trade bitcoin')}</h1>
      {#if enabled && session.account}
        <p class="trade-account" data-trade-account>{session.account.username}</p>
      {/if}
    </div>
    {#if enabled && session.account}
      <nav class="trade-tools account-tools" aria-label={t('Account')}>
        {#each tradeTools.filter((tool) => tool === 'trades' || tool === 'account') as tool (tool)}
          <Button variant="ghost" ariaPressed={panel === tool} onclick={() => toggleTool(tool)}
            >{t(toolLabels[tool])}</Button
          >
        {/each}
      </nav>
    {/if}
  </header>
  {#if !enabled}
    <WarningNotice
      title={t('Test service disabled')}
      body={t('Open this page with the dedicated backend test launcher.')}
    />
    <Button href="/marketplace">{t('Back to demo')}</Button>
  {:else}
    {#if error}<WarningNotice role="alert" tone="danger" body={t(error)} />{/if}
    {#if needsRefresh && !busy}<Button variant="secondary" onclick={refreshStatus}
        >{t('Refresh status')}</Button
      >{/if}
    {#if pending && !busy}
      <InstructionCard title={t('Request result unknown')}>
        <p>{t('Retry safely. This won’t repeat the action.')}</p>
        <Button onclick={() => run(retry)}>{t('Retry request')}</Button>
      </InstructionCard>
    {/if}
    {#if status}
      <p
        class:sr-only={status === 'Trade status saved.' ||
          status === 'Message saved.' ||
          status === 'Copied to clipboard.' ||
          status === 'Signed in to the test marketplace.'}
        role="status"
      >
        {t(status)}
      </p>
    {/if}
    {#if checkingSession || sessionReadFailed}
      <InstructionCard>
        {#if checkingSession}
          <p role="status">{t('Checking for a saved trade…')}</p>
        {:else}
          <Button variant="secondary" onclick={restoreSession}>{t('Try again')}</Button>
        {/if}
      </InstructionCard>
    {:else if !session.account}
      <InstructionCard title={t(registering ? 'Create a test account' : 'Sign in')}>
        <form
          onsubmit={(event) => {
            event.preventDefault();
            void authenticate();
          }}
        >
          <label class="field"
            ><span>{t('Test username')}</span><input
              aria-label={t('Test username')}
              bind:value={username}
              minlength="3"
              maxlength="32"
              autocomplete="username"
              autocapitalize="none"
              autocorrect="off"
              spellcheck={false}
              disabled={busy}
            /></label
          >
          <PasswordField
            bind:value={password}
            label={t('Test password')}
            autocomplete={registering ? 'new-password' : 'current-password'}
            disabled={busy}
            hint={t('Use 12 or more characters. Never reuse your wallet passphrase.')}
          />
          <Button
            type="submit"
            loading={busy}
            disabled={!/^[a-z][a-z0-9_]{2,31}$/.test(username) || [...password].length < 12}
            >{t(registering ? 'Create test account' : 'Sign in')}</Button
          >
        </form>
        <Button
          variant="ghost"
          disabled={busy}
          onclick={() => {
            registering = !registering;
            password = '';
            error = '';
          }}>{t(registering ? 'Already have a test account?' : 'Create a test account')}</Button
        >
      </InstructionCard>
    {:else}
      {#if panel === 'account' || panel === 'trades'}{@render tradePanel(panel)}{/if}
      {#if reconnecting}<WarningNotice role="status" body={t('Reconnecting to this trade…')} />{/if}
      <p class="sr-only" aria-live="polite">{trade ? t(tradeHeading(trade)) : ''}</p>
      <div class="trade-layout">
        <div class="trade-column">
          <div class="trade-stage" data-market-stage>
            <InstructionCard>
              {#if !trade && !quote}
                <div class="trade-segments" role="group" aria-label={t('Trade direction')}>
                  <Button
                    disabled={locked}
                    ariaPressed={intent === 'buy'}
                    variant="ghost"
                    onclick={() => (intent = 'buy')}>{t('Buy')}</Button
                  >
                  <Button
                    disabled={locked}
                    ariaPressed={intent === 'sell'}
                    variant="ghost"
                    onclick={() => (intent = 'sell')}>{t('Sell')}</Button
                  >
                </div>
                <form
                  onsubmit={(event) => {
                    event.preventDefault();
                    void review();
                  }}
                >
                  <label class="field trade-amount">
                    <span>{t(intent === 'buy' ? 'You pay' : 'You receive')}</span>
                    <span class="trade-amount-field">
                      <span aria-hidden="true">€</span><input
                        bind:this={amountInput}
                        aria-label={t(intent === 'buy' ? 'You pay' : 'You receive')}
                        bind:value={amount}
                        inputmode="decimal"
                        maxlength="12"
                        disabled={locked}
                        aria-describedby="trade-amount-hint"
                        aria-invalid={cents === null}
                      />
                    </span>
                    <small id="trade-amount-hint">{t('€50–€250 · SEPA Instant')}</small>
                  </label>
                  <div class="quick-amounts" role="group" aria-label={t('Quick amounts')}>
                    {#each quickAmounts as preset}
                      <Button
                        variant="ghost"
                        size="small"
                        disabled={locked}
                        ariaLabel={t('Review {amount}', { amount: euro(preset, true) })}
                        onclick={() => review(preset)}>{euro(preset, true)}</Button
                      >
                    {/each}
                  </div>
                  <Button
                    type="submit"
                    size="large"
                    loading={busy}
                    loadingLabel={t('Getting quote…')}
                    disabled={cents === null || locked}>{t('Review trade')}</Button
                  >
                </form>
              {:else if !trade && quote}
                <h2 tabindex="-1" bind:this={stageHeading}>
                  {t(quote.intent === 'buy' ? 'Review purchase' : 'Review sale')}
                </h2>
                <dl class="details-list trade-totals exchange-summary">
                  <div>
                    <dt>{t(quote.intent === 'buy' ? 'You pay' : 'You receive')}</dt>
                    <dd>{euro(quote.fiatCents)}</dd>
                  </div>
                  <div>
                    <dt>{t(quote.intent === 'buy' ? 'You receive' : 'You pay')}</dt>
                    <dd><Amount value={quote.bitcoinSats} interactive /></dd>
                  </div>
                </dl>
                <div class="quote-context">
                  <p>{quote.alias} · {t('SEPA Instant')}</p>
                  {#if !quoteExpired}
                    <p>
                      {t('Quote valid until {time}', {
                        time: new Date(quote.expiresAt).toLocaleTimeString($locale, {
                          hour: 'numeric',
                          minute: '2-digit',
                          second: '2-digit'
                        })
                      })}
                    </p>
                  {/if}
                </div>
                <details class="fee-details">
                  <summary>
                    <span>{t('Fee details')}</span>
                    <Amount
                      value={quote.platformFeeSats +
                        (quote.intent === 'buy' ? quote.releaseFeeSats : quote.fundingFeeSats)}
                    />
                  </summary>
                  <dl class="details-list">
                    <div>
                      <dt>{t('Platform fee')}</dt>
                      <dd><Amount value={quote.platformFeeSats} /></dd>
                    </div>
                    <div>
                      <dt>{t(quote.intent === 'buy' ? 'Release fee' : 'Funding fee')}</dt>
                      <dd>
                        <Amount
                          value={quote.intent === 'buy'
                            ? quote.releaseFeeSats
                            : quote.fundingFeeSats}
                        />
                      </dd>
                    </div>
                  </dl>
                </details>
                {#if quoteExpired}
                  {#if error !== 'Quote expired.'}<WarningNotice
                      role="alert"
                      tone="danger"
                      body={t('Quote expired.')}
                    />{/if}
                  <Button
                    size="large"
                    loading={busy}
                    loadingLabel={t('Getting quote…')}
                    disabled={locked}
                    onclick={() => review()}>{t('Get new quote')}</Button
                  >
                {:else}
                  <Button size="large" disabled={locked} onclick={startTrade}
                    >{t('Start trade')}</Button
                  >
                {/if}
                <Button variant="ghost" disabled={locked} onclick={editAmount}
                  >{t('Edit amount')}</Button
                >
              {:else if trade}
                {#if progress !== null}
                  <div class="trade-progress">
                    <SetupProgress
                      steps={TRADE_STEPS.map((label) => t(label))}
                      current={progress}
                      label={t('Trade progress')}
                      context={progress > TRADE_STEPS.length
                        ? t('All steps complete')
                        : t('Step {step} of {total}', {
                            step: progress,
                            total: TRADE_STEPS.length
                          })}
                    />
                  </div>
                {/if}
                <div class="trade-step-heading">
                  <h2 tabindex="-1" bind:this={stageHeading}>{t(tradeHeading(trade))}</h2>
                  <Button
                    variant="ghost"
                    size="small"
                    class="chat-shortcut"
                    href="#trade-chat-title"
                    onclick={jumpToChat}>{t('Jump to chat')}</Button
                  >
                </div>
                <p class="trade-note">
                  {t(trade.role === 'buyer' ? 'Buy' : 'Sell')} · {t('SEPA Instant')}
                  {#if counterparty}· {counterparty.alias}{/if}
                </p>
                {@const taker = trade.quote.intent === (trade.role === 'buyer' ? 'buy' : 'sell')}
                <dl class="details-list trade-totals exchange-summary">
                  <div>
                    <dt>{t(trade.role === 'buyer' ? 'You pay' : 'You receive')}</dt>
                    <dd>{euro(trade.quote.fiatCents)}</dd>
                  </div>
                  <div>
                    <dt>{t(trade.role === 'buyer' ? 'You receive' : 'You send')}</dt>
                    <dd>
                      <Amount
                        value={taker ? trade.quote.bitcoinSats : trade.quote.grossSats}
                        interactive
                      />
                    </dd>
                  </div>
                </dl>
                {#if trade.state === 'escrow_pending'}
                  {#if trade.role === 'seller' && !simulatedPeer && !bankDetails}
                    <section class="payment-preview" aria-label={t('Bank details')}>
                      <h3>{t('Where should the buyer pay?')}</h3>
                      <p class="trade-note">
                        {t('Use practice details. The buyer will see them after escrow is locked.')}
                      </p>
                      <form
                        onsubmit={(event) => {
                          event.preventDefault();
                          if (!trade || locked || !validBankDetails) return;
                          const tradeId = trade.id;
                          const operation = mutation(`/v1/trades/${tradeId}/payment-instructions`, {
                            expectedRevision: trade.revision,
                            recipient: bankHolder.trim().toUpperCase(),
                            iban: bankIban.toUpperCase().replaceAll(' ', '')
                          });
                          void run(() => saveBankDetails(operation, tradeId));
                        }}
                      >
                        <label class="field">
                          <span>{t('Account holder')}</span>
                          <input
                            bind:value={bankHolder}
                            placeholder={exampleHolder}
                            maxlength="29"
                            autocomplete="off"
                            autocapitalize="characters"
                            spellcheck={false}
                            disabled={locked}
                          />
                        </label>
                        <label class="field">
                          <span>{t('IBAN')}</span>
                          <input
                            bind:value={bankIban}
                            placeholder={exampleIban}
                            maxlength="27"
                            autocomplete="off"
                            autocapitalize="characters"
                            spellcheck={false}
                            disabled={locked}
                          />
                        </label>
                        <Button size="large" type="submit" disabled={locked || !validBankDetails}
                          >{t('Save bank details')}</Button
                        >
                        <Button
                          variant="ghost"
                          disabled={locked}
                          onclick={() => {
                            bankHolder = exampleHolder;
                            bankIban = exampleIban;
                          }}>{t('Use example details')}</Button
                        >
                      </form>
                    </section>
                  {:else if trade.role === 'seller' && deposit}
                    <section class="payment-preview" aria-label={t('Escrow deposit')}>
                      <h3>{t('Escrow deposit')}</h3>
                      <p class="trade-note">
                        {t('Regtest only. Use this address with a Regtest wallet.')}
                      </p>
                      <dl class="details-list bank-details">
                        <div>
                          <dt>{t('Amount to deposit')}</dt>
                          <dd><Amount value={trade.quote.grossSats} interactive /></dd>
                        </div>
                      </dl>
                      <div class="deposit-preview">
                        <div class="deposit-qr">
                          {#if depositQr}<img
                              src={depositQr}
                              alt={t('Escrow deposit QR')}
                              width="124"
                              height="124"
                            />{:else if depositQrFailed}<small
                              >{t('QR unavailable. Copy the payment link.')}</small
                            >{/if}
                        </div>
                        <dl class="details-list bank-details">
                          <div class="payment-address">
                            <dt>{t('Bitcoin address')}</dt>
                            <dd><code>{deposit.address}</code></dd>
                          </div>
                        </dl>
                      </div>
                      <div class="payment-actions">
                        <Button
                          variant="secondary"
                          size="small"
                          onclick={() => copyPayment(deposit.address, 'bitcoin-address')}
                          >{t('Copy address')}</Button
                        >
                        <Button
                          variant="secondary"
                          size="small"
                          onclick={() => copyPayment(deposit.amount)}>{t('Copy amount')}</Button
                        >
                        <Button
                          variant="secondary"
                          size="small"
                          onclick={() => copyPayment(deposit.uri)}>{t('Copy payment link')}</Button
                        >
                      </div>
                    </section>
                  {:else}
                    <p class="trade-note">
                      {t('The seller locks bitcoin first. Wait for escrow before paying.')}
                    </p>
                  {/if}
                  {#if (trade.role === 'seller' && bankDetails) || simulatedPeer}
                    <Button
                      size="large"
                      disabled={locked}
                      onclick={() => run(() => command('confirm_escrow', true))}
                      >{t(
                        trade.role === 'seller'
                          ? 'Lock test bitcoin'
                          : 'Simulate seller locking bitcoin'
                      )}</Button
                    >
                  {/if}
                {:else if trade.state === 'awaiting_payment'}
                  {#if trade.role === 'buyer'}
                    {#if buyerBankDetails}
                      <section class="payment-preview" aria-label={t('Bank details')}>
                        <h3>{t('Bank details')}</h3>
                        <dl class="details-list bank-details bank-payment">
                          {#each [{ label: 'Account holder', copy: 'Copy account holder', value: buyerBankDetails.recipient }, { label: 'IBAN', copy: 'Copy IBAN', value: buyerBankDetails.iban }, { label: 'Payment reference', copy: 'Copy reference', value: buyerBankDetails.reference }] as field (field.label)}
                            <div>
                              <dt>{t(field.label)}</dt>
                              <dd>
                                <code>{field.value}</code>
                                <Button
                                  variant="ghost"
                                  size="small"
                                  ariaLabel={t(field.copy)}
                                  onclick={() => copyPayment(field.value)}
                                  ><Copy size={16} /></Button
                                >
                              </dd>
                            </div>
                          {/each}
                        </dl>
                        <Button
                          variant="secondary"
                          onclick={() => trade && copyBankPayment(trade, buyerBankDetails)}
                          >{t('Copy payment details')}</Button
                        >
                        <p class="trade-note">
                          {t('Use these details for practice only. Do not send money.')}
                        </p>
                      </section>
                      <Button
                        size="large"
                        disabled={locked}
                        onclick={() => run(() => command('mark_paid'))}
                        >{t('Mark payment sent')}</Button
                      >
                    {:else}
                      <WarningNotice
                        role="alert"
                        title={t('Payment details unavailable')}
                        body={t('Use chat to ask the seller or open Trade options for help.')}
                      />
                    {/if}
                  {:else}
                    <p class="trade-note">{t('The buyer needs to mark the payment as sent.')}</p>
                    {#if simulatedPeer}
                      <Button
                        size="large"
                        disabled={locked}
                        onclick={() => run(() => command('buyer_paid', true))}
                        >{t('Simulate buyer payment')}</Button
                      >
                    {/if}
                  {/if}
                {:else if trade.state === 'payment_sent'}
                  {#if trade.role === 'seller'}
                    <p class="trade-note">
                      {t(
                        'The buyer marked payment as sent. Check the amount and sender before release.'
                      )}
                    </p>
                    {#if receiptReference}
                      <Button size="large" disabled={locked} onclick={openReceipt}
                        >{t('Review payment')}</Button
                      >
                    {:else}
                      <WarningNotice
                        role="alert"
                        title={t('Payment details unavailable')}
                        body={t('Open Trade options to report a problem.')}
                      />
                    {/if}
                  {:else}
                    <p class="trade-note">
                      {t('The seller checks the amount and sender before release.')}
                    </p>
                    {#if simulatedPeer}
                      <Button
                        size="large"
                        disabled={locked}
                        onclick={() => run(() => command('seller_received', true))}
                        >{t('Simulate seller receipt')}</Button
                      >
                    {/if}
                  {/if}
                {:else if trade.state === 'release_pending'}
                  <p class="trade-note">{t('The release is waiting for confirmation.')}</p>
                  <Button
                    size="large"
                    disabled={locked}
                    onclick={() => run(() => command('confirm_release', true))}
                    >{t('Simulate release confirmation')}</Button
                  >
                {:else if trade.state === 'refund_pending'}
                  <p class="trade-note">
                    {t('Bitcoin stays in escrow until the refund confirms.')}
                  </p>
                  <Button
                    size="large"
                    disabled={locked}
                    onclick={() => run(() => command('confirm_refund', true))}
                    >{t('Simulate confirmed refund')}</Button
                  >
                  {#if trade.role === 'buyer'}
                    <Button
                      variant="secondary"
                      disabled={locked}
                      onclick={() => run(() => command('mark_paid'))}
                      >{t('I already sent payment')}</Button
                    >
                  {/if}
                {:else if trade.state === 'disputed'}
                  <WarningNotice
                    body={t(
                      'Release is paused. This is a saved test dispute; no real support request was sent.'
                    )}
                  />
                {:else if terminal}
                  <p class="trade-note">
                    {t(
                      trade.state === 'completed'
                        ? 'Release confirmed.'
                        : trade.state === 'refunded'
                          ? 'Bitcoin returned to the seller.'
                          : 'The trade ended before bitcoin was locked.'
                    )}
                  </p>
                  <Button
                    size="large"
                    disabled={locked}
                    onclick={async () => {
                      clearFeedback();
                      clearSelection();
                      status = '';
                      await tick();
                      if (alive) amountInput?.focus();
                    }}>{t('Back to offers')}</Button
                  >
                {/if}
              {/if}
            </InstructionCard>
          </div>
          {#if trade}
            <nav class="trade-tools" aria-label={t('Trade tools')}>
              {#each tradeTools.filter((tool) => tool !== 'trades' && tool !== 'account') as tool (tool)}
                <Button
                  variant="ghost"
                  ariaPressed={panel === tool}
                  onclick={() => toggleTool(tool)}>{t(toolLabels[tool])}</Button
                >
              {/each}
            </nav>
            {#if panel && panel !== 'account' && panel !== 'trades' && tradeTools.includes(panel)}
              {@render tradePanel(panel)}
            {/if}
          {/if}
          <ToastHost inline />
        </div>
        {#if trade}
          <section class="trade-chat" aria-labelledby="trade-chat-title">
            <InstructionCard>
              <div class="chat-heading">
                <h2 id="trade-chat-title" tabindex="-1" bind:this={chatHeading}>
                  {t('Trade chat')}
                </h2>
                <span>{counterparty?.alias}</span>
              </div>
              <div role="log" aria-label={t('Trade chat')} aria-relevant="additions">
                {#if messages.length === 0}
                  <p class="trade-note">{t('No messages yet.')}</p>
                {/if}
                <ol class="chat-list" bind:this={chatThread}>
                  {#each messages as item (item.id)}
                    <li class:mine={item.actorId === session.account.id}>
                      <strong>
                        {#if item.actorId === session.account.id}{t(
                            'You'
                          )}{:else}{counterparty?.alias}{/if}
                      </strong>
                      <p>{item.text}</p>
                    </li>
                  {/each}
                </ol>
              </div>
              <form
                class="chat-composer"
                onsubmit={(event) => {
                  event.preventDefault();
                  if (locked) return;
                  void run(async () => {
                    if (!trade || !message.trim()) return;
                    await mutate(
                      mutation(`/v1/trades/${trade.id}/messages`, { text: message }),
                      (v) => v
                    );
                    message = '';
                    savedTradeId = trade.id;
                    await refresh();
                    status = 'Message saved.';
                    showFeedback({ title: t(status), tone: 'success' });
                  });
                }}
              >
                <label class="field">
                  <span>{t('Test message')}</span>
                  <textarea
                    aria-label={t('Test message')}
                    aria-describedby="trade-message-hint"
                    bind:value={message}
                    rows="2"
                    maxlength="2000"
                    disabled={locked}></textarea>
                  <small id="trade-message-hint">{t('No personal or bank details.')}</small>
                </label>
                <div class="chat-actions">
                  <Button variant="secondary" type="submit" disabled={locked || !message.trim()}
                    >{t('Send message')}</Button
                  >
                </div>
              </form>
            </InstructionCard>
          </section>
        {/if}
      </div>
    {/if}
    {#if !session.account}<ToastHost inline />{/if}
  {/if}
</section>

{#snippet tradePanel(panel: TradeTool)}
  <section aria-label={t(toolLabels[panel])} data-trade-panel={panel}>
    <InstructionCard>
      {#if panel === 'options' && trade}
        {#if trade.state === 'escrow_pending'}
          <Button variant="ghost" disabled={locked} onclick={() => run(() => command('cancel'))}
            >{t('Cancel trade')}</Button
          >
        {:else}
          {#if trade.state === 'awaiting_payment'}
            <Button
              variant="ghost"
              disabled={locked}
              onclick={() => run(() => command('request_refund'))}
              >{t('Request cancellation and refund')}</Button
            >
          {/if}
          <Button variant="ghost" disabled={locked} onclick={() => run(() => command('dispute'))}
            >{t('There is a problem')}</Button
          >
        {/if}
      {:else if panel === 'test' && trade}
        {#if trade.state === 'refund_pending'}
          <Button
            variant="secondary"
            disabled={locked}
            onclick={() => run(() => command('buyer_paid', true))}
            >{t('Simulate late payment claim')}</Button
          >
        {:else}
          <Button
            variant="secondary"
            disabled={locked}
            onclick={() => run(() => command('resolve_refund', true))}
            >{t('Simulate dispute refund decision')}</Button
          >
          <Button
            variant="secondary"
            disabled={locked}
            onclick={() => run(() => command('resolve_release', true))}
            >{t('Simulate dispute release decision')}</Button
          >
        {/if}
      {:else if panel === 'activity'}
        <ol class="trade-activity">
          {#each events as event (event.id)}
            <li>
              <strong>{t(tradeEventLabel(event.kind))}</strong><LocalTimestamp
                value={String(event.createdAt)}
              />
            </li>
          {/each}
        </ol>
      {:else if panel === 'trades'}
        {#each trades as saved (saved.id)}
          <Button
            variant="ghost"
            disabled={locked}
            onclick={() =>
              run(async () => {
                await refresh(saved.id);
                await focusStage();
              })}>{t(tradeHeading(saved))} · {euro(saved.quote.fiatCents)}</Button
          >
        {/each}
      {:else if panel === 'account'}
        <div class="account-actions">
          {#if !needsRefresh}
            <Button variant="secondary" disabled={busy} onclick={refreshStatus}
              >{t('Refresh status')}</Button
            >
          {/if}
          <Button
            variant="ghost"
            disabled={busy || pending !== null}
            onclick={() =>
              run(async () => {
                await request('/v1/session', (v) => v, { method: 'DELETE' });
                resetSessionView();
                status = 'Signed out.';
                showFeedback({ title: t(status) });
              })}>{t('Sign out')}</Button
          >
        </div>
      {/if}
    </InstructionCard>
  </section>
{/snippet}

<Modal open={receiptOpen} title={t('Check payment')} onclose={closeReceipt}>
  <div class="modal-form">
    <WarningNotice body={t('A payment claim is not proof of bank receipt.')} />
    {#if trade && counterparty}
      <dl class="details-list trade-totals">
        <div>
          <dt>{t('Trade partner')}</dt>
          <dd>{counterparty.alias}</dd>
        </div>
        <div>
          <dt>{t('Expected bank receipt')}</dt>
          <dd>{euro(trade.quote.fiatCents)}</dd>
        </div>
        {#if receiptReference}
          <div>
            <dt>{t('Payment reference')}</dt>
            <dd><code>{receiptReference}</code></dd>
          </div>
        {/if}
        <div>
          <dt>{t('Bitcoin to release')}</dt>
          <dd><Amount value={trade.quote.grossSats} interactive /></dd>
        </div>
      </dl>
    {/if}
    <label class="check-row"
      ><input type="checkbox" bind:checked={receiptChecked} />{t(
        'I checked the amount and sender.'
      )}</label
    >
    <Button size="large" disabled={!receiptChecked || locked} onclick={release}
      >{t('Release test bitcoin')}</Button
    >
  </div>
</Modal>

<style>
  .backend-page {
    display: grid;
    gap: 12px;
    max-width: 550px;
  }
  .trade-layout,
  .trade-column {
    display: grid;
    min-width: 0;
    gap: 12px;
  }
  .trade-step-heading,
  .quote-context {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 4px 12px;
  }
  .trade-step-heading :global(.chat-shortcut) {
    min-height: 44px;
    color: var(--link);
  }
  .quote-context {
    color: var(--text-soft);
    font-size: var(--font-size-meta);
  }
  .trade-header {
    min-height: 0;
    margin-bottom: 0;
    gap: 12px;
  }
  .trade-note,
  .trade-account {
    color: var(--text-soft);
  }
  .trade-note,
  .trade-account,
  .backend-page h2,
  .backend-page h3 {
    margin: 0;
  }
  .backend-page h2 {
    font-size: 1rem;
    outline: none;
  }
  .backend-page h3 {
    font-size: 1rem;
  }
  .trade-account {
    font-size: var(--font-size-meta);
  }
  .backend-page form {
    display: grid;
    gap: 12px;
  }
  .trade-segments,
  .quick-amounts {
    display: grid;
    gap: 8px;
  }
  .trade-segments {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 3px;
    gap: 3px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
  }
  .trade-segments :global([aria-pressed='true']) {
    background: var(--surface-icon);
    color: var(--text);
  }
  .quick-amounts {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .quick-amounts :global(button) {
    min-height: 44px;
    padding-inline: 4px;
    color: var(--link);
  }
  .trade-amount {
    text-align: center;
  }
  .trade-amount-field {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 2.25rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  .trade-amount-field input {
    width: 9ch;
    max-width: 100%;
    min-width: 0;
    font: inherit;
    text-align: center;
    font-variant-numeric: tabular-nums;
    background: transparent;
    border-color: transparent;
  }
  .trade-amount-field input:focus-visible {
    border-color: var(--focus);
  }
  .trade-totals {
    margin-block: 0;
  }
  .trade-totals dd {
    font-variant-numeric: tabular-nums;
  }
  .exchange-summary {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    border: 1px solid var(--border);
    border-radius: var(--radius-inset);
    background: var(--panel);
  }
  .exchange-summary > div {
    display: grid;
    gap: 4px;
    align-content: center;
    justify-content: initial;
    min-width: 0;
    padding: 10px 12px;
    border: 0;
  }
  .exchange-summary > div + div {
    border-inline-start: 1px solid var(--border);
  }
  .exchange-summary dd {
    margin: 0;
    max-width: none;
    font-size: 1rem;
    font-weight: 650;
    text-align: start;
  }
  .backend-page :global(.formatted-amount),
  .modal-form :global(.formatted-amount) {
    white-space: nowrap;
  }
  .trade-totals dd,
  .backend-page p,
  .trade-account {
    overflow-wrap: anywhere;
  }
  .account-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .backend-page summary {
    min-height: 44px;
    align-content: center;
    cursor: pointer;
  }
  .fee-details summary {
    list-style: none;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-soft);
    font-size: var(--font-size-meta);
  }
  .fee-details summary::after {
    content: '›';
    margin-inline-start: auto;
  }
  .fee-details[open] summary::after {
    transform: rotate(90deg);
  }
  .fee-details dl {
    margin-block: 0;
  }
  .trade-progress :global(.setup-progress) {
    margin: 0;
  }
  .trade-progress :global(.setup-progress-context) {
    color: var(--text-soft);
    letter-spacing: normal;
  }
  .trade-progress :global(.setup-progress li + li) {
    margin-top: 0;
  }
  .payment-preview {
    display: grid;
    gap: 7px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--panel);
  }
  .deposit-preview {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 10px;
  }
  .deposit-qr {
    display: grid;
    place-items: center;
    width: min(124px, 34vw);
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 6px;
    background: var(--surface-inset);
  }
  .deposit-qr small {
    padding: 8px;
    text-align: center;
  }
  .deposit-qr img {
    display: block;
    width: 100%;
    height: auto;
  }
  .payment-preview code {
    overflow-wrap: anywhere;
  }
  .payment-preview .field,
  .chat-composer .field {
    margin-bottom: 0;
  }
  .bank-details {
    margin: 0;
  }
  .bank-details dd {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .bank-details .payment-address {
    display: grid;
    gap: 3px;
    justify-content: start;
  }
  .payment-address dd {
    max-width: none;
    text-align: left;
  }
  .payment-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .payment-actions :global(button) {
    min-height: 44px;
  }
  .bank-payment > div {
    gap: 10px;
  }
  .bank-payment dd {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    max-width: 72%;
  }
  .bank-payment :global(button) {
    flex: 0 0 44px;
    inline-size: 44px;
    min-height: 44px;
    padding: 0;
    color: var(--link);
  }
  .chat-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 4px 10px;
  }
  .chat-heading span {
    color: var(--text-soft);
    font-size: var(--font-size-meta);
    overflow-wrap: anywhere;
  }
  .chat-list,
  .trade-activity {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .chat-list > li,
  .trade-activity > li {
    padding-block: 9px;
    overflow-wrap: anywhere;
  }
  .chat-list {
    display: grid;
    gap: 6px;
    max-height: 190px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .chat-list > li {
    justify-self: start;
    max-width: 90%;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--panel);
  }
  .chat-list > li.mine {
    justify-self: end;
    background: var(--fr-blue-soft);
  }
  .trade-activity > li + li {
    border-top: 1px solid var(--border);
  }
  .trade-activity > li {
    display: grid;
    gap: 2px;
  }
  .trade-activity :global(time) {
    color: var(--muted);
  }
  .chat-list p {
    margin: 2px 0 0;
    white-space: pre-wrap;
  }
  .chat-composer {
    gap: 6px;
  }
  .chat-actions {
    display: flex;
    justify-content: flex-end;
  }
  .trade-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    border-top: 1px solid var(--border);
    padding-top: 4px;
  }
  .trade-tools :global(button) {
    min-height: 44px;
    padding-inline: 9px;
  }
  .trade-tools :global([aria-pressed='true']) {
    background: var(--surface-icon);
  }
  .account-tools {
    justify-content: flex-end;
    border: 0;
    padding: 0;
  }
  .trade-stage :global(button),
  .modal-form :global(button) {
    scroll-margin-block: 12px;
  }
  #trade-chat-title {
    scroll-margin-block-start: 24px;
  }
  @media (min-width: 1050px) {
    .backend-page.trade-active {
      max-width: 920px;
    }
    .trade-active .trade-layout {
      grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
      align-items: start;
      gap: 16px;
    }
    .trade-step-heading :global(.chat-shortcut) {
      display: none;
    }
  }
  @media (max-width: 760px) {
    .backend-page {
      padding-top: 16px;
    }
    :global(.app-shell.prototype-shell.wallet-unlocked) .backend-page {
      padding-top: 22px;
    }
  }
</style>
