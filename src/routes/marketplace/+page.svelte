<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ArrowDownLeft,
    ArrowUpRight,
    ArrowRight,
    Check,
    Clock3,
    CircleUserRound,
    Landmark,
    LockKeyhole,
    ShieldCheck
  } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import InstructionCard from '$lib/components/InstructionCard.svelte';
  import WarningNotice from '$lib/components/WarningNotice.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import SetupProgress from '$lib/components/SetupProgress.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { toast } from '$lib/stores/toasts';
  import { isPrototypeWallet } from '$lib/wallet';
  import {
    REHEARSAL_SCENARIOS,
    prepareRehearsal,
    type RehearsalScenarioId
  } from '$lib/marketplace/rehearsal';
  import {
    createPreviewMarketplace,
    parseEuroAmount,
    startPreviewTrade,
    applyTradeEvent,
    MarketError,
    type Intent,
    type PreviewQuote,
    type PreviewScenario,
    type Trade,
    type EventKind
  } from '$lib/marketplace';

  const market = isPrototypeWallet ? createPreviewMarketplace() : null;
  let intent = $state<Intent>('buy');
  let amount = $state('150');
  let scenario = $state<PreviewScenario>('available');
  let quotes = $state<PreviewQuote[]>([]);
  let selected = $state(0);
  let busy = $state(false);
  let error = $state('');
  let searched = $state(false);
  let reviewOpen = $state(false);
  let receiptOpen = $state(false);
  let paymentOpen = $state(false);
  let disputeOpen = $state(false);
  let receiptChecked = $state(false);
  let paymentChecked = $state(false);
  let rehearsalOpen = $state(false);
  let rehearsalChoice = $state<RehearsalScenarioId>('buy');
  let activeRehearsal = $state<RehearsalScenarioId | null>(null);
  let feedback = $state('');
  let trade = $state<Trade | null>(null);
  let now = $state(Date.now());
  let generation = 0;
  const cents = $derived(parseEuroAmount(amount));
  const quote = $derived(quotes[selected] ?? null);
  const rehearsalDetails = $derived(
    REHEARSAL_SCENARIOS.find((entry) => entry.id === activeRehearsal)
  );
  const selectedRehearsal = $derived(
    REHEARSAL_SCENARIOS.find((entry) => entry.id === rehearsalChoice)
  );
  const publicDiscoveryEnabled = isPrototypeWallet && __GROOT_MARKETPLACE_DISCOVERY__;
  const expired = $derived(quote !== null && now >= quote.expiresAt);
  const terminal = $derived(
    trade !== null && ['completed', 'cancelled', 'refunded', 'disputed'].includes(trade.state)
  );
  const step = $derived(
    !trade
      ? 1
      : trade.state === 'escrow_pending'
        ? 2
        : ['awaiting_payment', 'payment_sent', 'receipt_review'].includes(trade.state)
          ? 3
          : 4
  );
  const stateTitles = {
    escrow_pending: 'First, secure the bitcoin',
    awaiting_payment: 'Bitcoin secured. Time to pay.',
    payment_sent: 'Payment sent. Waiting for the seller.',
    receipt_review: 'Has the money reached your bank?',
    release_pending: 'Releasing the bitcoin',
    completed: 'Trade complete',
    disputed: 'Trade paused for review',
    cancelled: 'Trade cancelled',
    refund_pending: 'Refund requested',
    refunded: 'Bitcoin refunded'
  } as const;

  function stateTitle(value: Trade) {
    return value.state === 'awaiting_payment' && value.quote.intent === 'sell'
      ? 'Waiting for the buyer’s transfer'
      : stateTitles[value.state];
  }

  function euro(value: number) {
    return new Intl.NumberFormat($locale, { style: 'currency', currency: 'EUR' }).format(
      value / 100
    );
  }
  function sats(value: number) {
    return new Intl.NumberFormat($locale).format(value);
  }
  function fail(cause: unknown) {
    error =
      cause instanceof MarketError && cause.code === 'quote_expired'
        ? 'This estimate expired. Refresh offers before continuing.'
        : cause instanceof MarketError && cause.code === 'unavailable'
          ? 'Offers are unavailable. Your wallet is unaffected. Try again.'
          : 'This action could not be completed. The trade has not advanced.';
    toast({ title: translate($locale, error), tone: 'warning' });
  }
  function invalidate() {
    generation++;
    quotes = [];
    selected = 0;
    searched = false;
    error = '';
    busy = false;
    reviewOpen = false;
    feedback = '';
    activeRehearsal = null;
  }
  function chooseIntent(next: Intent) {
    intent = next;
    invalidate();
  }
  async function search() {
    if (!market || cents === null || busy) return;
    const request = ++generation;
    busy = true;
    feedback = '';
    error = '';
    quotes = [];
    try {
      const result = await market.findQuotes(intent, cents, scenario);
      if (request !== generation) return;
      quotes = result;
      selected = 0;
      searched = true;
      now = Date.now();
    } catch (cause) {
      if (request !== generation) return;
      searched = true;
      fail(cause);
    } finally {
      if (request === generation) busy = false;
    }
  }
  async function restoreDemoOffers() {
    if (!market || trade || busy) return;
    scenario = 'available';
    invalidate();
    await search();
  }
  function start() {
    if (!quote || !isPrototypeWallet) return;
    try {
      trade = startPreviewTrade(quote, Date.now());
      reviewOpen = false;
      error = '';
      toast({ title: translate($locale, 'Demo trade started'), tone: 'success' });
    } catch (cause) {
      reviewOpen = false;
      fail(cause);
    }
  }
  function advance(kind: EventKind, bankReceiptChecked = false) {
    if (!trade || !isPrototypeWallet) return;
    try {
      trade = applyTradeEvent(trade, {
        id: `event-${trade.revision + 1}`,
        tradeId: trade.id,
        revision: trade.revision + 1,
        kind,
        bankReceiptChecked
      });
      error = '';
      receiptOpen = false;
      paymentOpen = false;
      disputeOpen = false;
      receiptChecked = false;
      paymentChecked = false;
      toast({
        title: translate($locale, stateTitle(trade)),
        tone: trade.state === 'disputed' ? 'warning' : 'success'
      });
    } catch (cause) {
      fail(cause);
    }
  }
  function reset() {
    trade = null;
    activeRehearsal = null;
    clearDialogs();
    invalidate();
    feedback = 'Demo reset. No money moved.';
    toast({ title: translate($locale, feedback) });
  }
  function clearDialogs() {
    reviewOpen = false;
    receiptOpen = false;
    paymentOpen = false;
    disputeOpen = false;
    rehearsalOpen = false;
    receiptChecked = false;
    paymentChecked = false;
  }
  function openRehearsal() {
    rehearsalChoice = activeRehearsal ?? intent;
    error = '';
    rehearsalOpen = true;
  }
  function closeRehearsal() {
    rehearsalOpen = false;
    generation++;
    busy = false;
  }
  async function beginRehearsal() {
    if (!isPrototypeWallet || busy) return;
    const choice = rehearsalChoice;
    const request = ++generation;
    busy = true;
    error = '';
    try {
      const prepared = await prepareRehearsal(choice, Date.now());
      if (request !== generation) return;
      intent = prepared.intent;
      amount = prepared.amount;
      scenario = prepared.scenario;
      trade = prepared.trade;
      quotes = [];
      selected = 0;
      searched = false;
      feedback = '';
      now = Date.now();
      clearDialogs();
      activeRehearsal = choice;
      toast({ title: translate($locale, 'Test scenario ready'), tone: 'success' });
    } catch (cause) {
      if (request === generation) fail(cause);
    } finally {
      if (request === generation) busy = false;
    }
  }
  onMount(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => {
      clearInterval(timer);
      generation++;
    };
  });
</script>

<svelte:head
  ><title>{translate($locale, 'Trade bitcoin')}{translate($locale, ' · Groot')}</title></svelte:head
>

<div class="page marketplace-page">
  <header class="page-header">
    <div>
      <h1>{translate($locale, 'Trade bitcoin')}</h1>
      <p class="subtitle">{translate($locale, 'Buy or sell with a bank transfer.')}</p>
    </div>
    {#if isPrototypeWallet}<Button
        variant="secondary"
        size="small"
        disabled={busy}
        onclick={openRehearsal}
        >{translate($locale, trade ? 'Restart demo' : 'Test scenarios')}</Button
      >{:else}<span class="info-badge">{translate($locale, 'Optional add-on')}</span>{/if}
  </header>

  {#if !isPrototypeWallet}
    <WarningNotice
      title={translate($locale, 'Live trading is not enabled')}
      body={translate(
        $locale,
        'The marketplace design preview is available in the browser prototype.'
      )}
    />
  {:else}
    <WarningNotice
      title={translate($locale, 'Design preview')}
      body={translate(
        $locale,
        'Simulated offers and money. No bank, provider or wallet is connected. Progress resets when you leave.'
      )}
    />

    <div class="market-layout">
      <div class="market-main">
        {#if !trade}
          <section class="form-card">
            <div
              class="market-intent"
              role="group"
              aria-label={translate($locale, 'Trade direction')}
            >
              <Button
                variant={intent === 'buy' ? 'default' : 'secondary'}
                ariaPressed={intent === 'buy'}
                onclick={() => chooseIntent('buy')}
                ><ArrowDownLeft size={17} />{translate($locale, 'Buy bitcoin')}</Button
              >
              <Button
                variant={intent === 'sell' ? 'default' : 'secondary'}
                ariaPressed={intent === 'sell'}
                onclick={() => chooseIntent('sell')}
                ><ArrowUpRight size={17} />{translate($locale, 'Sell bitcoin')}</Button
              >
            </div>
            <form
              onsubmit={(event) => {
                event.preventDefault();
                void search();
              }}
            >
              <label class="field">
                <span>{translate($locale, intent === 'buy' ? 'You pay' : 'You receive')}</span>
                <div class="amount-input">
                  <input
                    inputmode="decimal"
                    autocomplete="off"
                    aria-label={translate($locale, intent === 'buy' ? 'You pay' : 'You receive')}
                    bind:value={amount}
                    oninput={invalidate}
                    aria-invalid={cents === null}
                    aria-describedby="market-amount-hint"
                  /><b>{translate($locale, 'EUR')}</b>
                </div>
                <small id="market-amount-hint"
                  >{translate(
                    $locale,
                    cents === null
                      ? 'Enter €50–€250 with at most two decimal places.'
                      : '€50–€250 per trade in this preview.'
                  )}</small
                >
              </label>
              <dl class="details-list">
                <div>
                  <dt>{translate($locale, 'Payment method')}</dt>
                  <dd><Landmark size={15} />{translate($locale, 'SEPA Instant')}</dd>
                </div>
              </dl>
              {#if !quote && !(error && scenario === 'offline')}<Button
                  type="submit"
                  class="market-primary"
                  loading={busy}
                  loadingLabel={translate($locale, 'Finding offers…')}
                  disabled={cents === null}
                  >{translate($locale, searched ? 'Refresh offers' : 'Find an offer')}<ArrowRight
                    size={16}
                  /></Button
                >{/if}
            </form>

            {#if error}
              <WarningNotice tone="danger" role="alert" body={translate($locale, error)}>
                {#if scenario === 'offline'}<Button
                    class="market-primary"
                    onclick={restoreDemoOffers}
                  >
                    {translate($locale, 'Restore demo offers')}
                  </Button>{/if}
              </WarningNotice>
            {:else if searched && !quote && !busy}
              <EmptyState
                compact
                title={translate($locale, 'No matching offers')}
                description={translate(
                  $locale,
                  'No one can fill this amount with SEPA Instant right now. Try again later.'
                )}
              />
            {/if}
            {#if feedback}<p class="muted" role="status">{translate($locale, feedback)}</p>{/if}

            {#if quote}
              <div class="estimate" aria-live="polite">
                <span
                  >{translate(
                    $locale,
                    intent === 'buy'
                      ? 'Estimated bitcoin you receive'
                      : 'Estimated total bitcoin you send'
                  )}</span
                >
                <div class="review-amount">
                  <strong
                    >{sats(quote.bitcoinSats)} <small>{translate($locale, 'sats')}</small></strong
                  >
                </div>
                <span>{translate($locale, 'Includes estimated platform and mining fees.')}</span>
              </div>
              <InstructionCard>
                <div class="offer-heading">
                  <CircleUserRound size={27} />
                  <div>
                    <strong>{quote.offer.alias}</strong>
                    <p>{translate($locale, 'Synthetic trader · preview only')}</p>
                  </div>
                  {#if selected === 0}<span class="info-badge"
                      >{translate($locale, 'Best total')}</span
                    >{/if}
                </div>
                <p class="muted">
                  {translate($locale, '{trades} completed trades · {percent}% completion', {
                    trades: quote.offer.completedTrades,
                    percent: quote.offer.completionPercent
                  })}
                </p>
              </InstructionCard>
              <div class="review-actions">
                {#if expired}<WarningNotice
                    role="status"
                    body={translate(
                      $locale,
                      'This estimate expired. Refresh offers before continuing.'
                    )}
                  /><Button class="market-primary" onclick={search}
                    >{translate($locale, 'Refresh offers')}</Button
                  >
                {:else}<Button
                    class="market-primary"
                    onclick={() => {
                      reviewOpen = true;
                    }}
                    >{translate(
                      $locale,
                      intent === 'buy' ? 'Review purchase' : 'Review sale'
                    )}<ArrowRight size={16} /></Button
                  >
                  <p class="muted estimate-lifetime">
                    {translate(
                      $locale,
                      'Estimate valid for {seconds}s. Availability is not reserved.',
                      { seconds: Math.max(0, Math.ceil((quote.expiresAt - now) / 1000)) }
                    )}
                  </p>{/if}
              </div>
              <details class="market-disclosure">
                <summary>{translate($locale, 'Price and fee breakdown')}</summary>
                <dl class="details-list">
                  <div>
                    <dt>{translate($locale, 'Offer price per bitcoin')}</dt>
                    <dd>{euro(quote.offer.priceCentsPerBtc)}</dd>
                  </div>
                  <div>
                    <dt>{translate($locale, 'Platform fee estimate')}</dt>
                    <dd>{sats(quote.platformFeeSats)} {translate($locale, 'sats')}</dd>
                  </div>
                  <div>
                    <dt>{translate($locale, 'Release mining estimate')}</dt>
                    <dd>{sats(quote.releaseFeeSats)} {translate($locale, 'sats')}</dd>
                  </div>
                  {#if intent === 'sell'}<div>
                      <dt>{translate($locale, 'Funding mining estimate')}</dt>
                      <dd>{sats(quote.fundingFeeSats)} {translate($locale, 'sats')}</dd>
                    </div>{/if}
                </dl>
                <p class="muted">
                  {translate(
                    $locale,
                    'Illustrative 0.75% platform fee and fixed mining estimates. Live costs must come from the provider and the actual transaction.'
                  )}
                </p>
              </details>
              <details class="market-disclosure">
                <summary>{translate($locale, 'Other matching offers')}</summary>
                {#each quotes as alternative, index}
                  <Button
                    variant={selected === index ? 'default' : 'secondary'}
                    ariaPressed={selected === index}
                    class="alternative"
                    onclick={() => {
                      selected = index;
                    }}
                    >{alternative.offer.alias}<span
                      >{sats(alternative.bitcoinSats)} {translate($locale, 'sats')}</span
                    ></Button
                  >
                {/each}
              </details>
            {/if}
          </section>
        {:else}
          <section class="form-card trade-card" aria-live="polite">
            <div class="trade-title">
              {#if trade.state === 'completed' || trade.state === 'refunded'}<Check
                  size={28}
                />{:else if trade.state === 'escrow_pending'}<LockKeyhole size={28} />{:else}<Clock3
                  size={28}
                />{/if}
              <h2>{translate($locale, stateTitle(trade))}</h2>
            </div>
            {#if !['cancelled', 'refund_pending', 'refunded', 'disputed'].includes(trade.state)}<SetupProgress
                steps={[
                  translate($locale, 'Review'),
                  translate($locale, 'Secure'),
                  translate($locale, 'Pay'),
                  translate($locale, 'Outcome')
                ]}
                current={step}
                label={translate($locale, 'Trade progress')}
              />{/if}
            <dl class="details-list trade-summary">
              <div>
                <dt>{translate($locale, 'Bank transfer')}</dt>
                <dd>{euro(trade.quote.fiatCents)}</dd>
              </div>
              <div>
                <dt>
                  {translate(
                    $locale,
                    trade.quote.intent === 'buy'
                      ? 'Estimated bitcoin you receive'
                      : 'Estimated total bitcoin you send'
                  )}
                </dt>
                <dd>{sats(trade.quote.bitcoinSats)} {translate($locale, 'sats')}</dd>
              </div>
              <div>
                <dt>{translate($locale, 'Trading with')}</dt>
                <dd>{trade.quote.offer.alias}</dd>
              </div>
            </dl>

            {#if trade.state === 'escrow_pending'}
              <InstructionCard title={translate($locale, 'Do not send a bank payment yet')}
                ><p>
                  {translate(
                    $locale,
                    trade.quote.intent === 'buy'
                      ? 'The seller must fund escrow first. Groot must verify the deposit and required Bitcoin confirmations before showing payment instructions.'
                      : 'A live sale requires a separate Groot transaction review before you fund escrow. This preview cannot spend bitcoin.'
                  )}
                </p></InstructionCard
              >
              <Button class="market-primary" onclick={() => advance('escrow_confirmed')}
                >{translate($locale, 'Simulate confirmed escrow')}</Button
              >
              <Button variant="ghost" onclick={() => advance('cancel')}
                >{translate($locale, 'Cancel demo trade')}</Button
              >
            {:else if trade.state === 'awaiting_payment' && trade.quote.intent === 'buy'}
              <InstructionCard title={translate($locale, 'Pay from your own bank account')}
                ><p>
                  {translate(
                    $locale,
                    'A live trade shows the seller’s exact account details here, after escrow is verified. This preview has no real bank details.'
                  )}
                </p>
                <p>
                  {translate(
                    $locale,
                    'Send the exact amount once. Keep all communication in the trade. Never follow payment changes sent by chat.'
                  )}
                </p></InstructionCard
              >
              <Button
                class="market-primary"
                onclick={() => {
                  paymentOpen = true;
                }}>{translate($locale, 'Mark demo payment as sent')}</Button
              >
            {:else if trade.state === 'awaiting_payment'}
              <InstructionCard
                ><p>
                  {translate(
                    $locale,
                    'Your bitcoin stays in escrow. A timer or payment screenshot is never proof that money arrived.'
                  )}
                </p></InstructionCard
              >
              <Button class="market-primary" onclick={() => advance('buyer_marked_paid')}
                >{translate($locale, 'Simulate buyer payment claim')}</Button
              >
            {:else if trade.state === 'payment_sent'}
              <InstructionCard title={translate($locale, 'No second payment needed')}
                ><p>
                  {translate(
                    $locale,
                    'The seller checks their bank before releasing bitcoin. If the transfer is delayed, keep the trade open and ask for help.'
                  )}
                </p></InstructionCard
              >
              <Button class="market-primary" onclick={() => advance('release_confirmed')}
                >{translate($locale, 'Simulate release and confirmation')}</Button
              >
            {:else if trade.state === 'receipt_review'}
              <WarningNotice
                title={translate($locale, 'Check your bank yourself')}
                body={translate(
                  $locale,
                  'Match the exact amount and sender to this trade. A buyer’s message, screenshot or pending transfer is not enough. Bank fraud and recall risks can remain.'
                )}
              />
              <Button
                class="market-primary"
                onclick={() => {
                  receiptOpen = true;
                }}>{translate($locale, 'Review payment and release')}</Button
              >
            {:else if trade.state === 'release_pending'}
              <InstructionCard
                ><p>
                  {translate(
                    $locale,
                    'Receipt confirmed in the simulation. A live release requires authenticated approval of the exact escrow transaction. Wait for Bitcoin confirmation.'
                  )}
                </p></InstructionCard
              >
              <Button class="market-primary" onclick={() => advance('release_confirmed')}
                >{translate($locale, 'Simulate release and confirmation')}</Button
              >
            {:else if trade.state === 'disputed'}
              <WarningNotice
                title={translate($locale, 'Release is paused')}
                body={translate(
                  $locale,
                  'Keep the transfer receipt and trade messages. A live provider’s dispute team would review the evidence. No support request was sent from this preview.'
                )}
              />
            {:else if trade.state === 'refund_pending'}
              <InstructionCard
                ><p>
                  {translate(
                    $locale,
                    'A refund request does not mean bitcoin has returned. A live trade must confirm the refund on Bitcoin. Do not send a bank payment.'
                  )}
                </p></InstructionCard
              >
              <Button class="market-primary" onclick={() => advance('refund_confirmed')}
                >{translate($locale, 'Simulate confirmed refund')}</Button
              >
              <Button variant="secondary" onclick={() => advance('buyer_marked_paid')}
                >{translate($locale, 'Simulate late payment claim')}</Button
              >
            {:else if trade.state === 'completed'}
              <InstructionCard title={translate($locale, 'Demo completed')}
                ><p>
                  {translate(
                    $locale,
                    'No money moved. A live trade is complete only after the actual release is verified; its wallet receipt keeps a permanent label.'
                  )}
                </p></InstructionCard
              >
            {:else if trade.state === 'cancelled'}
              <InstructionCard
                ><p>
                  {translate($locale, 'Cancelled before escrow funding. No money moved.')}
                </p></InstructionCard
              >
            {:else if trade.state === 'refunded'}
              <InstructionCard
                ><p>
                  {translate($locale, 'Refund confirmed in the simulation. No money moved.')}
                </p></InstructionCard
              >
            {/if}

            {#if error}<WarningNotice
                role="alert"
                tone="danger"
                body={translate($locale, error)}
              />{/if}
            {#if trade.state === 'awaiting_payment'}<Button
                variant="ghost"
                onclick={() => advance('request_refund')}
                >{translate($locale, 'Request cancellation and refund')}</Button
              >{/if}
            {#if !terminal && trade.state !== 'escrow_pending'}<Button
                variant="ghost"
                onclick={() => {
                  disputeOpen = true;
                }}>{translate($locale, 'There is a problem')}</Button
              >{/if}
            {#if terminal}<Button class="market-primary" onclick={reset}
                >{translate($locale, 'Back to offers')}</Button
              >{/if}
          </section>
        {/if}
      </div>

      <aside class="market-aside">
        {#if rehearsalDetails}<InstructionCard title={translate($locale, 'Your test scenario')}>
            <p><strong>{translate($locale, rehearsalDetails.title)}</strong></p>
            <p>{translate($locale, rehearsalDetails.description)}</p>
          </InstructionCard>{/if}
        <details class="market-disclosure">
          <summary>{translate($locale, 'How trading works')}</summary>
          <InstructionCard>
            <div class="explanation">
              <LockKeyhole size={20} />
              <p>
                <strong>{translate($locale, 'Bitcoin first, payment second')}</strong><span
                  >{translate($locale, 'Pay only after escrow is funded and verified.')}</span
                >
              </p>
            </div>
            <div class="explanation">
              <Landmark size={20} />
              <p>
                <strong>{translate($locale, 'Your bank, your choice')}</strong><span
                  >{translate(
                    $locale,
                    'EUR and SEPA Instant to start. No bank login in Groot.'
                  )}</span
                >
              </p>
            </div>
            <div class="explanation">
              <ShieldCheck size={20} />
              <p>
                <strong>{translate($locale, 'Know who sees what')}</strong><span
                  >{translate(
                    $locale,
                    'Your trading partner sees payment details, often your name. Provider and bank requirements still apply.'
                  )}</span
                >
              </p>
            </div>
          </InstructionCard>
          <p class="muted">
            {translate(
              $locale,
              'Provider under evaluation: LocalCoinSwap. Live access depends on provider, legal and liquidity checks. Groot-operated escrow is deferred.'
            )}
          </p>
        </details>
        <details class="market-disclosure preview-controls">
          <summary>{translate($locale, 'Preview conditions')}</summary>
          <label class="field"
            ><span>{translate($locale, 'Offer availability')}</span><select
              aria-label={translate($locale, 'Offer availability')}
              bind:value={scenario}
              onchange={invalidate}
              disabled={trade !== null}
              ><option value="available">{translate($locale, 'Offers available')}</option><option
                value="empty">{translate($locale, 'No offers')}</option
              ><option value="offline">{translate($locale, 'Provider unavailable')}</option></select
            ></label
          >
          {#if trade}<p class="muted">
              {translate($locale, 'Return to offers before changing preview conditions.')}
            </p>{/if}
          <p class="muted">
            {translate(
              $locale,
              'Synthetic people, reputation and estimates. These controls test failure states; they do not change a real market.'
            )}
          </p>
        </details>
        {#if publicDiscoveryEnabled}<details class="market-disclosure">
            <summary>{translate($locale, 'Public listing research')}</summary>
            <p class="muted">
              {translate(
                $locale,
                'This separate read-only page can contact a real provider after consent. It cannot continue a demo trade.'
              )}
            </p>
            <Button href="/marketplace/discover" variant="secondary" disabled={trade !== null}
              >{translate($locale, 'Browse public listings')}</Button
            >
            {#if trade}<p class="muted">
                {translate($locale, 'Return to offers before opening public research.')}
              </p>{/if}
          </details>{/if}
      </aside>
    </div>
  {/if}
</div>

<Modal
  open={rehearsalOpen}
  title={translate($locale, 'Choose a test scenario')}
  onclose={closeRehearsal}
>
  <div class="modal-form">
    <InstructionCard title={translate($locale, 'Practice without real money')}>
      <p>
        {translate(
          $locale,
          'Every trade, payment and confirmation in these scenarios is simulated. No bank details, account or funds are needed.'
        )}
      </p>
    </InstructionCard>
    {#if trade}<WarningNotice
        body={translate(
          $locale,
          'Starting a scenario clears this demo’s progress. Your wallet and real money are unaffected.'
        )}
      />{/if}
    <label class="field">
      <span>{translate($locale, 'Test scenario')}</span>
      <select
        aria-label={translate($locale, 'Test scenario')}
        bind:value={rehearsalChoice}
        disabled={busy}
      >
        {#each REHEARSAL_SCENARIOS as entry}<option value={entry.id}
            >{translate($locale, entry.title)}</option
          >{/each}
      </select>
    </label>
    {#if selectedRehearsal}<p>{translate($locale, selectedRehearsal.description)}</p>{/if}
    {#if error}<WarningNotice tone="danger" role="alert" body={translate($locale, error)} />{/if}
    <Button
      onclick={beginRehearsal}
      loading={busy}
      loadingLabel={translate($locale, 'Preparing scenario…')}
      >{translate($locale, 'Start scenario')}</Button
    >
    <Button variant="ghost" onclick={closeRehearsal}
      >{translate($locale, 'Keep current demo')}</Button
    >
  </div>
</Modal>

<Modal
  open={reviewOpen && quote !== null}
  title={translate($locale, intent === 'buy' ? 'Review purchase' : 'Review sale')}
  onclose={() => {
    reviewOpen = false;
  }}
>
  {#if quote}<div class="modal-form">
      <div class="review-amount">
        <span>{translate($locale, intent === 'buy' ? 'You pay' : 'You receive')}</span><strong
          >{euro(quote.fiatCents)}</strong
        ><span
          >{sats(quote.bitcoinSats)}
          {translate($locale, 'sats')} · {translate($locale, 'estimated')}</span
        >
      </div>
      <InstructionCard
        title={translate($locale, 'What happens next')}
        steps={[
          translate($locale, 'The seller funds a trade-specific escrow.'),
          translate($locale, 'The buyer pays after Bitcoin confirmations.'),
          translate($locale, 'The seller checks their bank and approves release.')
        ]}
      />
      <WarningNotice
        body={translate(
          $locale,
          'A live pilot will hand off to the provider for account setup, contract confirmation and disputes. No provider account is created here.'
        )}
      />
      {#if expired}<WarningNotice
          role="status"
          body={translate($locale, 'This estimate expired. Refresh offers before continuing.')}
        />{/if}
      <Button disabled={expired} onclick={start}>{translate($locale, 'Start demo trade')}</Button>
    </div>{/if}
</Modal>

<Modal
  open={paymentOpen}
  title={translate($locale, 'Mark payment as sent?')}
  onclose={() => {
    paymentOpen = false;
    paymentChecked = false;
  }}
>
  <div class="modal-form">
    <p>
      {translate(
        $locale,
        'In a live trade, use this only after your bank confirms that you sent the exact transfer. This does not release bitcoin.'
      )}
    </p>
    <label class="check-row"
      ><input type="checkbox" bind:checked={paymentChecked} /><span
        >{translate($locale, 'I understand the buyer’s claim does not prove receipt.')}</span
      ></label
    ><Button disabled={!paymentChecked} onclick={() => advance('buyer_marked_paid')}
      >{translate($locale, 'Confirm demo payment sent')}</Button
    >
  </div>
</Modal>

<Modal
  open={receiptOpen}
  title={translate($locale, 'Confirm receipt before release')}
  onclose={() => {
    receiptOpen = false;
    receiptChecked = false;
  }}
>
  <div class="modal-form">
    <WarningNotice
      body={translate(
        $locale,
        'Releasing bitcoin is irreversible. In a live trade, verify the posted bank credit, exact amount and sender yourself. Never rely on a screenshot.'
      )}
    /><label class="check-row"
      ><input type="checkbox" bind:checked={receiptChecked} /><span
        >{translate($locale, 'I checked the matching payment in my bank account.')}</span
      ></label
    ><Button
      disabled={!receiptChecked}
      onclick={() => advance('seller_confirmed_receipt', receiptChecked)}
      >{translate($locale, 'Confirm demo receipt and release')}</Button
    >
  </div>
</Modal>

<Modal
  open={disputeOpen}
  title={translate($locale, 'Pause and get help')}
  onclose={() => {
    disputeOpen = false;
  }}
>
  <div class="modal-form">
    <p>
      {translate(
        $locale,
        'Do not pay again or release bitcoin under pressure. A live dispute stays with the provider and keeps the trade record and evidence.'
      )}
    </p>
    <WarningNotice
      body={translate(
        $locale,
        'This simulates a dispute. It does not contact support or resolve who owns the escrow.'
      )}
    /><Button onclick={() => advance('open_dispute')}
      >{translate($locale, 'Simulate opening a dispute')}</Button
    >
  </div>
</Modal>

<style>
  .marketplace-page.page {
    max-width: 1010px;
    padding-top: 20px;
  }
  .marketplace-page .page-header {
    min-height: 0;
    margin-bottom: 16px;
  }
  .market-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(220px, 270px);
    gap: 24px;
    align-items: start;
    margin-top: 18px;
  }
  .market-main,
  .market-aside {
    min-width: 0;
  }
  .market-main .form-card {
    display: grid;
    gap: 14px;
    padding: 20px;
  }
  .market-intent {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .market-main form {
    display: grid;
    gap: 12px;
  }
  .market-main .details-list > div {
    min-height: 38px;
  }
  .amount-input b {
    right: 16px;
  }
  .details-list dd {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .marketplace-page :global(.market-primary) {
    width: 100%;
    min-height: 46px;
  }
  .modal-form :global(.button) {
    scroll-margin-block: 8px;
  }
  .marketplace-page :global(.instruction-card p) {
    margin: 0;
    font-size: var(--font-size-meta);
    line-height: 1.6;
  }
  .estimate {
    display: grid;
    gap: 8px;
    text-align: center;
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  .estimate .review-amount {
    padding: 0;
  }
  .offer-heading {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .offer-heading > div {
    flex: 1;
    min-width: 0;
  }
  .offer-heading > :global(svg),
  .explanation > :global(svg) {
    flex-shrink: 0;
    color: var(--link);
  }
  .offer-heading p {
    color: var(--muted);
  }
  .muted {
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.6;
    margin: 0;
  }
  .market-disclosure summary {
    cursor: pointer;
    min-height: 44px;
    display: list-item;
    align-content: center;
    font-size: var(--font-size-meta);
    color: var(--link);
  }
  .market-disclosure > p {
    margin-top: 12px;
  }
  .marketplace-page :global(.alternative) {
    display: flex;
    width: 100%;
    justify-content: space-between;
    margin-top: 8px;
  }
  .estimate-lifetime {
    text-align: center;
  }
  .review-actions {
    display: grid;
    gap: 10px;
  }
  .market-aside {
    display: grid;
    gap: 20px;
  }
  .explanation {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding-top: 14px;
  }
  .explanation p {
    display: grid;
    gap: 4px;
  }
  .explanation span {
    color: var(--muted);
  }
  .trade-title {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .trade-title > :global(svg) {
    color: var(--link);
    flex-shrink: 0;
  }
  .trade-title h2 {
    margin: 0;
    font-size: 17px;
  }
  .trade-summary {
    margin-top: 12px;
  }
  .check-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    min-height: 44px;
    line-height: 1.6;
  }
  .check-row input {
    margin-top: 5px;
    flex-shrink: 0;
  }
  @media (max-width: 960px) {
    .market-layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .market-aside {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 760px) {
    :global(.app-shell.prototype-shell) .marketplace-page.page {
      padding-top: 20px;
    }
    .marketplace-page.page {
      padding-top: 76px;
      padding-bottom: max(130px, calc(100px + env(safe-area-inset-bottom)));
    }
    .marketplace-page .page-header {
      align-items: flex-start;
      gap: 12px;
    }
    .marketplace-page .page-header > .info-badge {
      display: none;
    }
    .market-main .form-card {
      padding: 18px;
    }
    .market-layout {
      margin-top: 18px;
      gap: 20px;
    }
    .offer-heading {
      flex-wrap: wrap;
    }
  }
</style>
