<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ArrowDownLeft,
    ArrowUpRight,
    ArrowLeft,
    ArrowUpRight as ExternalLink,
    Landmark,
    CircleUserRound
  } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import InstructionCard from '$lib/components/InstructionCard.svelte';
  import WarningNotice from '$lib/components/WarningNotice.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import LocalTimestamp from '$lib/components/LocalTimestamp.svelte';
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { toast } from '$lib/stores/toasts';
  import { isPrototypeWallet } from '$lib/wallet';
  import { parseEuroAmount, type Intent } from '$lib/marketplace';
  import {
    loadPublicOffers,
    isPublicOfferSnapshotFresh,
    DiscoveryError,
    type PublicOfferSnapshot,
    type DiscoveryOffer
  } from '../../../../packages/marketplace/discovery';

  const enabled = isPrototypeWallet && __GROOT_MARKETPLACE_DISCOVERY__;
  let intent = $state<Intent>('buy');
  let amount = $state('150');
  let consentOpen = $state(false);
  let allowed = $state(false);
  let busy = $state(false);
  let snapshot = $state<PublicOfferSnapshot | null>(null);
  let error = $state('');
  let status = $state('');
  let retryAt = $state(0);
  let sourceOffer = $state<DiscoveryOffer | null>(null);
  let now = $state(Date.now());
  let generation = 0;
  let controller: AbortController | null = null;
  const cents = $derived(parseEuroAmount(amount));
  const expired = $derived(snapshot !== null && !isPublicOfferSnapshotFresh(snapshot, now));
  const coolingDown = $derived(now < retryAt);

  function euro(value: number) {
    return new Intl.NumberFormat($locale, { style: 'currency', currency: 'EUR' }).format(
      value / 100
    );
  }
  function integer(value: number) {
    return new Intl.NumberFormat($locale).format(value);
  }
  function invalidate() {
    generation++;
    controller?.abort();
    controller = null;
    busy = false;
    snapshot = null;
    error = '';
    status = '';
    sourceOffer = null;
    consentOpen = false;
  }
  function chooseIntent(next: Intent) {
    intent = next;
    invalidate();
  }
  function stop() {
    invalidate();
    allowed = false;
    status = 'Discovery stopped. No further provider requests will be made.';
    toast({ title: translate($locale, status) });
  }
  function cancel() {
    invalidate();
    status = 'Offer lookup cancelled.';
    toast({ title: translate($locale, status) });
  }
  async function discover() {
    if (!enabled || !allowed || cents === null || busy || Date.now() < retryAt) return;
    controller?.abort();
    const pending = new AbortController();
    controller = pending;
    const request = ++generation;
    busy = true;
    snapshot = null;
    error = '';
    status = '';
    sourceOffer = null;
    try {
      const result = await loadPublicOffers(
        { intent, amountCents: cents },
        { provider: 'localcoinswap', signal: pending.signal }
      );
      if (request !== generation) return;
      now = Date.now();
      snapshot = result;
      status = result.offers.length
        ? 'Public listings loaded. Fees and eligibility still need checking.'
        : 'No public listings match this amount and the visible newcomer requirements.';
      toast({ title: translate($locale, status) });
    } catch (cause) {
      if (request !== generation) return;
      if (cause instanceof DiscoveryError && cause.code === 'rate_limited') {
        retryAt = cause.retryAtMs ?? Date.now() + 60_000;
        error = 'The provider asked us to wait. Try again after the cooldown.';
      } else if (cause instanceof DiscoveryError && cause.code === 'invalid_response') {
        error = 'The provider response could not be verified. No listings are shown.';
      } else if (cause instanceof DiscoveryError && cause.code === 'aborted') {
        status = 'Offer lookup cancelled.';
      } else {
        error = 'Public listings are unavailable. Try again; the demo still works.';
      }
      if (error) toast({ title: translate($locale, error), tone: 'warning' });
    } finally {
      if (request === generation) {
        busy = false;
        controller = null;
      }
    }
  }
  function requestDiscovery() {
    if (!enabled || cents === null || busy || Date.now() < retryAt) return;
    if (!allowed) consentOpen = true;
    else void discover();
  }
  function canOpenSource(listing: DiscoveryOffer | null) {
    now = Date.now();
    return (
      listing !== null &&
      snapshot !== null &&
      snapshot.offers.includes(listing) &&
      isPublicOfferSnapshotFresh(snapshot, now)
    );
  }
  function openSource(listing: DiscoveryOffer) {
    if (canOpenSource(listing)) sourceOffer = listing;
    else {
      sourceOffer = null;
      status = 'These listings are stale. Refresh before viewing a source offer.';
    }
  }
  function confirmSource(event: MouseEvent) {
    if (!canOpenSource(sourceOffer)) {
      event.preventDefault();
      status = 'These listings are stale. Refresh before viewing a source offer.';
    }
    sourceOffer = null;
  }
  onMount(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => {
      clearInterval(timer);
      generation++;
      controller?.abort();
    };
  });
</script>

<svelte:head
  ><title>{translate($locale, 'Public bitcoin listings')}{translate($locale, ' · Groot')}</title
  ></svelte:head
>

<div class="page discovery-page">
  <header class="page-header">
    <div>
      <h1>{translate($locale, 'Public bitcoin listings')}</h1>
      <p class="subtitle">
        {translate($locale, 'Explore a provider. Keep trading decisions separate.')}
      </p>
    </div>
    <Button href="/marketplace" variant={enabled ? 'ghost' : 'default'}
      ><ArrowLeft size={16} />{translate($locale, 'Back to demo')}</Button
    >
  </header>
  {#if !enabled}
    <div class="discovery-notice">
      <InstructionCard title={translate($locale, 'Discovery is not enabled')}
        ><p>
          {translate(
            $locale,
            'Public listings are unavailable in this demo. You can still practice with simulated trades.'
          )}
        </p></InstructionCard
      >
    </div>
  {:else}
    <WarningNotice
      title={translate($locale, 'Read-only research')}
      body={translate(
        $locale,
        'Listings are advertisements, not reserved quotes. Groot cannot open a trade, move money or verify your provider eligibility here.'
      )}
    />
    <div class="discovery-layout">
      <section class="form-card discovery-main">
        <div class="direction" role="group" aria-label={translate($locale, 'Trade direction')}>
          <Button
            variant={intent === 'buy' ? 'default' : 'secondary'}
            ariaPressed={intent === 'buy'}
            onclick={() => chooseIntent('buy')}
            ><ArrowDownLeft size={16} />{translate($locale, 'Buy bitcoin')}</Button
          >
          <Button
            variant={intent === 'sell' ? 'default' : 'secondary'}
            ariaPressed={intent === 'sell'}
            onclick={() => chooseIntent('sell')}
            ><ArrowUpRight size={16} />{translate($locale, 'Sell bitcoin')}</Button
          >
        </div>
        <form
          onsubmit={(event) => {
            event.preventDefault();
            requestDiscovery();
          }}
        >
          <label class="field"
            ><span>{translate($locale, intent === 'buy' ? 'You pay' : 'You receive')}</span>
            <div class="amount-input">
              <input
                inputmode="decimal"
                autocomplete="off"
                aria-label={translate($locale, intent === 'buy' ? 'You pay' : 'You receive')}
                bind:value={amount}
                oninput={invalidate}
                aria-invalid={cents === null}
                aria-describedby="discovery-amount-hint"
              /><b>{translate($locale, 'EUR')}</b>
            </div>
            <small id="discovery-amount-hint"
              >{translate(
                $locale,
                cents === null
                  ? 'Enter €50–€250 with at most two decimal places.'
                  : '€50–€250 for this research corridor.'
              )}</small
            ></label
          >
          <dl class="details-list">
            <div>
              <dt>{translate($locale, 'Payment method')}</dt>
              <dd><Landmark size={15} />{translate($locale, 'SEPA Instant')}</dd>
            </div>
            <div>
              <dt>{translate($locale, 'Source')}</dt>
              <dd>{translate($locale, 'LocalCoinSwap')}</dd>
            </div>
          </dl>
          <Button
            type="submit"
            class="discovery-primary"
            loading={busy}
            loadingLabel={translate($locale, 'Reading public listings…')}
            disabled={!enabled || cents === null || coolingDown}
            >{translate(
              $locale,
              snapshot ? 'Refresh public listings' : 'Find public listings'
            )}</Button
          >
        </form>
        {#if busy}<Button variant="ghost" onclick={cancel}
            >{translate($locale, 'Cancel lookup')}</Button
          >{/if}
        {#if coolingDown}<p class="muted" role="status">
            {translate($locale, 'Retry available in {seconds}s.', {
              seconds: Math.max(1, Math.ceil((retryAt - now) / 1000))
            })}
          </p>{/if}
        {#if error}<WarningNotice
            role="alert"
            tone="danger"
            body={translate($locale, error)}
          />{/if}
        {#if status && snapshot?.offers.length !== 0}<p class="muted" role="status">
            {translate($locale, status)}
          </p>{/if}

        {#if snapshot}
          <p class="muted">
            {translate($locale, 'Observed')}
            <LocalTimestamp value={new Date(snapshot.receivedAtMs).toISOString()} />
          </p>
          {#if expired}<WarningNotice
              role="status"
              body={translate(
                $locale,
                'These listings are stale. Refresh before viewing a source offer.'
              )}
            />{/if}
          {#if !snapshot.offers.length}<EmptyState
              compact
              title={translate($locale, 'No matching public listings')}
              description={translate(
                $locale,
                'No public listings match this amount and the visible newcomer requirements.'
              )}
            />
          {:else}
            <p class="muted">
              {translate(
                $locale,
                'One listing per trader, sorted by advertised price. Fees can change the total.'
              )}
            </p>
            {#each snapshot.offers.slice(0, 1) as listing}
              <InstructionCard>
                <div class="listing-heading">
                  <CircleUserRound size={25} />
                  <div>
                    <strong>{listing.offer.counterparty.alias}</strong>
                    <p>
                      {#if listing.offer.counterparty.completedTrades === null}{translate(
                          $locale,
                          'Trade history not supplied'
                        )}{:else}{translate($locale, '{count} provider-reported trades', {
                          count: listing.offer.counterparty.completedTrades
                        })}{/if}
                    </p>
                  </div>
                </div>
                <div class="review-amount">
                  <span>{translate($locale, 'Indicative bitcoin amount before fees')}</span><strong
                    >{integer(listing.grossEstimateSats)}
                    <small>{translate($locale, 'sats')}</small></strong
                  >
                </div>
                <dl class="details-list">
                  <div>
                    <dt>{translate($locale, 'Advertised price per bitcoin')}</dt>
                    <dd>{euro(listing.offer.pricePerBtcCents)}</dd>
                  </div>
                  <div>
                    <dt>{translate($locale, 'Listed euro range')}</dt>
                    <dd>{euro(listing.offer.minFiatCents)}–{euro(listing.offer.maxFiatCents)}</dd>
                  </div>
                </dl>
                <p class="muted">
                  {translate(
                    $locale,
                    'Platform, mining and banking fees are not included. This is not a net-receipt promise.'
                  )}
                </p>
                <details class="disclosure">
                  <summary>{translate($locale, 'Provider terms and eligibility')}</summary>
                  <p class="muted">
                    {translate(
                      $locale,
                      'Country, account, identity and bank requirements still need checking with the provider.'
                    )}
                  </p>
                  {#if listing.offer.terms}<p class="terms selectable-text">
                      {listing.offer.terms}
                    </p>{:else}<p class="muted">
                      {translate(
                        $locale,
                        'No additional terms were supplied in this public response.'
                      )}
                    </p>{/if}
                </details>
                <Button variant="secondary" disabled={expired} onclick={() => openSource(listing)}
                  >{translate($locale, 'View source offer')}<ExternalLink size={15} /></Button
                >
              </InstructionCard>
            {/each}
            {#if snapshot.offers.length > 1}<details class="disclosure">
                <summary>{translate($locale, 'Other public listings')}</summary
                >{#each snapshot.offers.slice(1, 10) as listing}<div class="alternative">
                    <span
                      >{listing.offer.counterparty.alias}<small
                        >{euro(listing.offer.pricePerBtcCents)}</small
                      ></span
                    ><Button
                      variant="secondary"
                      disabled={expired}
                      onclick={() => openSource(listing)}
                      >{translate($locale, 'View source offer')}</Button
                    >
                  </div>{/each}
              </details>{/if}
          {/if}
        {/if}
        {#if allowed}<Button variant="ghost" onclick={stop}
            >{translate($locale, 'Stop discovery and clear listings')}</Button
          >{/if}
      </section>
      <aside class="discovery-aside">
        <details class="disclosure">
          <summary>{translate($locale, 'About this research')}</summary>
          <InstructionCard title={translate($locale, 'Why LocalCoinSwap is being evaluated')}
            ><p>
              {translate(
                $locale,
                'Its public documentation invites custom interfaces and describes onchain bitcoin escrow. Provider approval, recovery, legal scope and usable EUR liquidity still need proof.'
              )}
            </p></InstructionCard
          >
          <InstructionCard title={translate($locale, 'Your wallet stays separate')}
            ><p>
              {translate(
                $locale,
                'Groot shares no balance, address, history, bank account, credential or key. This screen cannot sign or release bitcoin.'
              )}
            </p></InstructionCard
          >
          <p class="muted">
            {translate(
              $locale,
              'A first-page public search cannot prove market depth or availability. No other provider is contacted as a fallback.'
            )}
          </p>
        </details>
      </aside>
    </div>
  {/if}
</div>

<Modal
  open={consentOpen}
  title={translate($locale, 'Read public listings?')}
  onclose={() => {
    consentOpen = false;
  }}
>
  <div class="modal-form">
    <InstructionCard title={translate($locale, 'What this lookup shares')}
      ><p>
        {translate(
          $locale,
          'LocalCoinSwap receives this development server’s public IP address, EUR, bitcoin, SEPA Instant and your buy or sell choice. The euro amount is filtered locally and is not sent to the provider.'
        )}
      </p></InstructionCard
    >
    <p>
      {translate(
        $locale,
        'Groot sends no wallet or bank data. It reads only when you search or refresh, and never polls in the background. Consent lasts only for this page visit.'
      )}
    </p>
    <WarningNotice
      body={translate(
        $locale,
        'Consent to a lookup does not establish provider eligibility, integration permission or trading approval.'
      )}
    /><Button
      onclick={() => {
        allowed = true;
        consentOpen = false;
        void discover();
      }}>{translate($locale, 'Allow this lookup')}</Button
    >
  </div>
</Modal>

<Modal
  open={sourceOffer !== null}
  title={translate($locale, 'Open LocalCoinSwap?')}
  onclose={() => {
    sourceOffer = null;
  }}
>
  <div class="modal-form">
    <p>
      {translate(
        $locale,
        'You are opening the original public offer on localcoinswap.com. Your browser connects directly to the provider, which may recognize your account and apply its own terms.'
      )}
    </p>
    <WarningNotice
      body={translate(
        $locale,
        'You are leaving Groot’s read-only area. The provider’s website can offer real trades. Groot has not reserved a price, checked eligibility or started a trade.'
      )}
    />{#if sourceOffer && !expired}<a
        class="button default"
        href={sourceOffer.offer.url}
        target="_blank"
        rel="noopener noreferrer"
        referrerpolicy="no-referrer"
        onclick={confirmSource}
        >{translate($locale, 'Open original offer')}<ExternalLink size={15} /></a
      >{:else}<p class="muted">
        {translate($locale, 'These listings are stale. Refresh before viewing a source offer.')}
      </p>{/if}
  </div>
</Modal>

<style>
  .discovery-page.page {
    max-width: 1010px;
    padding-top: 20px;
  }
  .discovery-page .page-header {
    min-height: 0;
    margin-bottom: 18px;
    gap: 16px;
  }
  .discovery-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(220px, 270px);
    gap: 24px;
    margin-top: 18px;
    align-items: start;
  }
  .discovery-main,
  .discovery-aside {
    display: grid;
    gap: 16px;
    min-width: 0;
  }
  .discovery-main form {
    display: grid;
    gap: 14px;
  }
  .direction {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .amount-input b {
    right: 16px;
  }
  .details-list dd {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .details-list > div {
    min-height: 38px;
  }
  .discovery-page :global(.discovery-primary) {
    width: 100%;
    min-height: 44px;
  }
  .discovery-page :global(.instruction-card p) {
    margin: 0;
    font-size: var(--font-size-meta);
    line-height: 1.6;
  }
  .muted {
    margin: 0;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.6;
  }
  .listing-heading {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .listing-heading > :global(svg) {
    flex-shrink: 0;
    color: var(--link);
  }
  .listing-heading p {
    color: var(--muted);
  }
  .listing-heading > div {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .terms {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: var(--font-size-meta);
  }
  .disclosure summary {
    cursor: pointer;
    color: var(--link);
    min-height: 44px;
    align-content: center;
    font-size: var(--font-size-meta);
  }
  .disclosure > p {
    margin-block: 12px;
  }
  .alternative {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-block: 12px;
    border-bottom: 1px solid var(--border);
  }
  .alternative > span {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .alternative small {
    display: block;
    color: var(--muted);
  }
  .discovery-notice {
    margin-top: 18px;
  }
  @media (max-width: 960px) {
    .discovery-layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 760px) {
    :global(.app-shell.prototype-shell) .discovery-page.page {
      padding-top: 20px;
    }
    .discovery-page.page {
      padding-top: 76px;
      padding-bottom: max(120px, calc(90px + env(safe-area-inset-bottom)));
    }
    .discovery-main {
      padding: 18px;
    }
    .discovery-page .page-header {
      align-items: flex-start;
    }
    .discovery-page .page-header :global(.button) {
      max-width: 130px;
    }
  }
</style>
