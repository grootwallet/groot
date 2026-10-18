<script lang="ts">
  import { formatInteger, locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { ArrowRight, ArrowUp, Check, Copy, ExternalLink, Layers } from '@lucide/svelte';
  import Modal from './Modal.svelte';
  import Button from './Button.svelte';
  import { copyText } from '$lib/clipboard';
  import { defaultConfig, transactionExplorerUrl } from '$lib/config';
  import Amount from './Amount.svelte';
  import { toast } from '$lib/stores/toasts';
  import type { Transaction } from '$lib/types';
  import { compactAddress, compactIdentifier } from '$lib/address-display';
  import ReadableAddress from './ReadableAddress.svelte';
  import LocalTimestamp from './LocalTimestamp.svelte';
  import { discreetMode } from '$lib/privacy';
  import { denomination, setDenomination } from '$lib/denomination';
  import PermanentLabelTags from './PermanentLabelTags.svelte';
  import { walletService } from '$lib/wallet';

  let {
    transaction,
    multisig = false,
    onclose
  } = $props<{ transaction: Transaction | null; multisig?: boolean; onclose: () => void }>();
  let showAddress = $state(false);
  let showMore = $state(false);
  let addressCopied = $state(false);
  let txidCopied = $state(false);
  let explorerError = $state('');
  let explorerUrl = $derived(
    transaction ? transactionExplorerUrl(defaultConfig.network, transaction.id) : null
  );
  let isSelfSpend = $derived(transaction?.kind === 'self_spend');
  let canIncreaseFee = $derived(
    transaction?.status === 'pending' &&
      transaction.direction === 'sent' &&
      !isSelfSpend &&
      transaction.rbf === true
  );
  let canSpendOutput = $derived(
    transaction?.status === 'pending' && (transaction.walletOutputAmount ?? 0) > 0
  );
  let transactionLabels = $derived(
    transaction
      ? transaction.direction === 'received' && transaction.provenance.labels.length
        ? transaction.provenance.labels
        : transaction.intentLabel
          ? [transaction.intentLabel]
          : [transaction.label]
      : []
  );

  $effect(() => {
    transaction?.id;
    showAddress = false;
    showMore = false;
    txidCopied = false;
  });

  async function copyTxid() {
    if (!transaction) return;
    try {
      await copyText(transaction.id, 'identifier');
      txidCopied = true;
      toast({ title: 'Transaction ID copied', tone: 'success' });
      setTimeout(() => (txidCopied = false), 1_500);
    } catch {
      toast({ title: 'Copy failed', tone: 'danger' });
    }
  }

  async function copyAddress() {
    if (!transaction?.address) return;
    try {
      await copyText(transaction.address, 'bitcoin-address');
      addressCopied = true;
      toast({ title: 'Address copied', tone: 'success' });
      setTimeout(() => (addressCopied = false), 1_500);
    } catch {
      toast({ title: 'Copy failed', tone: 'danger' });
    }
  }

  async function openExplorer() {
    if (!transaction || !explorerUrl) return;
    explorerError = '';
    try {
      await walletService.openTransactionExplorer(transaction.id);
    } catch (cause) {
      explorerError =
        cause instanceof Error ? cause.message : 'The system browser could not open the explorer.';
      toast({
        title: translate($locale, 'Could not open explorer'),
        description: explorerError,
        tone: 'danger'
      });
    }
  }

  function lineageDescription(history: NonNullable<Transaction['rbfHistory']>) {
    if (history.outcome === 'replacement_confirmed')
      return translate($locale, 'Confirmed with the higher fee.');
    if (history.outcome === 'original_confirmed')
      return translate($locale, 'The original payment confirmed first.');
    return translate($locale, 'Waiting for confirmation.');
  }

  function originalLineageStatus(history: NonNullable<Transaction['rbfHistory']>) {
    return history.outcome === 'original_confirmed'
      ? translate($locale, 'Confirmed')
      : translate($locale, 'Replaced');
  }

  function replacementLineageStatus(history: NonNullable<Transaction['rbfHistory']>) {
    if (history.outcome === 'replacement_confirmed') return translate($locale, 'Confirmed');
    if (history.outcome === 'original_confirmed') return translate($locale, 'Did not confirm');
    return translate($locale, 'Broadcast');
  }

  function lineageInsight(history: NonNullable<Transaction['rbfHistory']>) {
    if (history.outcome === 'replacement_confirmed')
      return translate(
        $locale,
        'The payment is counted once through the confirmed replacement. The earlier version remains only as history.'
      );
    if (history.outcome === 'original_confirmed')
      return translate(
        $locale,
        'The payment is counted once through the original transaction, which confirmed before its replacement.'
      );
    return translate(
      $locale,
      'The payment is counted once while the higher-fee replacement awaits confirmation.'
    );
  }
</script>

<Modal open={!!transaction} title={translate($locale, 'Transaction details')} {onclose}>
  {#if transaction}
    <div class="detail-hero">
      <span
        class:pending={transaction.status === 'pending'}
        class:replaced={transaction.status === 'replaced'}>{transaction.status}</span
      >
      <button
        class="detail-amount"
        class:positive={transaction.direction === 'received'}
        class:replaced={transaction.status === 'replaced'}
        type="button"
        aria-label={translate(
          $locale,
          $denomination === 'btc'
            ? 'Show transaction amount in sats'
            : 'Show transaction amount in BTC'
        )}
        title={translate(
          $locale,
          $denomination === 'btc'
            ? 'Show transaction amount in sats'
            : 'Show transaction amount in BTC'
        )}
        onclick={() => setDenomination($denomination === 'btc' ? 'sats' : 'btc')}
      >
        <Amount
          value={transaction.amount}
          sign={transaction.direction === 'received' ? '+' : '−'}
          hidden={$discreetMode}
        />
      </button>
      {#if isSelfSpend}<p>{translate($locale, 'Self-spend · network fee')}</p>{:else}<div
          class="detail-hero-labels"
        >
          <PermanentLabelTags labels={transactionLabels} hidden={$discreetMode} prominent />
        </div>{/if}
    </div>
    {#if transaction.rbfHistory}
      <aside class="transaction-lineage" aria-label={translate($locale, 'Transaction history')}>
        <div class="transaction-lineage-heading">
          <span class="transaction-lineage-icon" aria-hidden="true"><ArrowUp size={16} /></span>
          <div>
            <strong>{translate($locale, 'Fee increased')}</strong>
            <p>
              {lineageDescription(transaction.rbfHistory)}
            </p>
          </div>
        </div>
        <details class="transaction-lineage-details">
          <summary>{translate($locale, 'View fee increase details')}</summary>
          <div class="transaction-lineage-journey">
            <div class="transaction-lineage-stop earlier">
              <span>{translate($locale, 'Earlier transaction')}</span>
              <code>{compactIdentifier(transaction.rbfHistory.originalTxid, 8, 6)}</code>
              <small>
                {#if transaction.rbfHistory.originalFeeRate != null}
                  {transaction.rbfHistory.originalFeeRate} {translate($locale, 'sat/vB')} ·
                {/if}
                {originalLineageStatus(transaction.rbfHistory)}
              </small>
            </div>
            <div class="transaction-lineage-connector" aria-hidden="true">
              <span>{translate($locale, 'Fee increased')}</span>
              <i></i><ArrowRight size={14} />
            </div>
            <div class="transaction-lineage-stop current">
              <span>{translate($locale, 'Higher-fee replacement')}</span>
              <code>{compactIdentifier(transaction.rbfHistory.replacementTxid, 8, 6)}</code>
              <small>
                {#if transaction.rbfHistory.replacementFeeRate != null}
                  {transaction.rbfHistory.replacementFeeRate} {translate($locale, 'sat/vB')} ·
                {/if}
                {replacementLineageStatus(transaction.rbfHistory)}
              </small>
            </div>
          </div>
          <p class="transaction-lineage-insight">
            {lineageInsight(transaction.rbfHistory)}
          </p>
        </details>
      </aside>
    {/if}
    <dl class="details-list transaction-summary-list">
      <div>
        <dt>
          {translate(
            $locale,
            transaction.blockTimestamp && transaction.date !== transaction.blockTimestamp
              ? 'First seen'
              : transaction.blockTimestamp
                ? 'Block time'
                : 'Date'
          )}
        </dt>
        <dd><LocalTimestamp value={transaction.date} /></dd>
      </div>
      {#if transaction.blockTimestamp && transaction.date !== transaction.blockTimestamp}<div>
          <dt>{translate($locale, 'Block timestamp')}</dt>
          <dd><LocalTimestamp value={transaction.blockTimestamp} /></dd>
        </div>{/if}
      <div>
        <dt>{translate($locale, 'Confirmations')}</dt>
        <dd>{transaction.confirmations}</dd>
      </div>
      {#if transaction.fee}<div>
          <dt>{translate($locale, 'Network fee')}</dt>
          <dd><Amount value={transaction.fee} hidden={$discreetMode} /></dd>
        </div>{/if}
      {#if transaction.address && !showAddress}<div>
          <dt>
            {translate($locale, transaction.direction === 'received' ? 'Received at' : 'Sent to')}
          </dt>
          <dd>
            <button
              type="button"
              class="compact-address-button"
              aria-expanded="false"
              onclick={() => (showAddress = true)}>{compactAddress(transaction.address)}</button
            >
          </dd>
        </div>{/if}
    </dl>
    {#if showAddress && transaction.address}<div class="expanded-transaction-address">
        <ReadableAddress
          address={transaction.address}
          copied={addressCopied}
          oncopy={copyAddress}
        /><button type="button" onclick={() => (showAddress = false)}
          >{translate($locale, 'Show compact address')}</button
        >
      </div>{/if}
    <details class="proposal-review-details transaction-more-details" bind:open={showMore}>
      <summary>{translate($locale, showMore ? 'View less details' : 'View more details')}</summary>
      <dl class="details-list">
        {#if transaction.inputCount != null}<div>
            <dt>{translate($locale, 'Inputs')}</dt>
            <dd>
              {transaction.inputCount}{#if transaction.walletInputAmount != null}{' · '}<Amount
                  value={transaction.walletInputAmount}
                  hidden={$discreetMode}
                />
                {translate($locale, 'from this wallet')}{/if}
            </dd>
          </div>{/if}
        {#if transaction.outputCount != null}<div>
            <dt>{translate($locale, 'Outputs')}</dt>
            <dd>
              {transaction.outputCount}{#if transaction.walletOutputAmount != null}{' · '}<Amount
                  value={transaction.walletOutputAmount}
                  hidden={$discreetMode}
                />
                {translate($locale, 'to this wallet')}{/if}
            </dd>
          </div>{/if}
        {#if transaction.feeRate != null}<div>
            <dt>{translate($locale, 'Fee rate')}</dt>
            <dd>{transaction.feeRate} {translate($locale, 'sat/vB')}</dd>
          </div>{/if}
        <div>
          <dt>
            {translate(
              $locale,
              transaction.direction === 'sent' ? 'Payment intent' : 'Received provenance'
            )}
          </dt>
          <dd>
            {#if transaction.direction === 'received' && transaction.provenance.state === 'unknown'}
              {translate($locale, $discreetMode ? 'Hidden in discreet mode' : 'Source unknown')}
            {:else}
              <PermanentLabelTags labels={transactionLabels} hidden={$discreetMode} prominent />
            {/if}
          </dd>
        </div>
        {#if transaction.provenance.state === 'mixed'}<div>
            <dt>{translate($locale, 'Privacy')}</dt>
            <dd>
              {translate(
                $locale,
                $discreetMode
                  ? 'Hidden in discreet mode'
                  : `${transaction.provenance.clusterCount} source clusters combined`
              )}
            </dd>
          </div>{/if}
        {#if transaction.locktime != null && transaction.rbf != null}<div>
            <dt>{translate($locale, 'Locktime / RBF')}</dt>
            <dd>
              {formatInteger(transaction.locktime, $locale)}{' · '}{translate(
                $locale,
                transaction.rbf ? 'Enabled' : 'Disabled'
              )}
            </dd>
          </div>{/if}
        {#if transaction.status === 'replaced' && transaction.replacedBy}<div>
            <dt>{translate($locale, 'Replaced by')}</dt>
            <dd class="mono"><code>{compactIdentifier(transaction.replacedBy)}</code></dd>
          </div>{/if}
        {#if transaction.replaces}<div>
            <dt>{translate($locale, 'Replaces')}</dt>
            <dd class="mono"><code>{compactIdentifier(transaction.replaces)}</code></dd>
          </div>{/if}
        {#if transaction.block}<div>
            <dt>{translate($locale, 'Block')}</dt>
            <dd>{formatInteger(transaction.block, $locale)}</dd>
          </div>{/if}
        {#if isSelfSpend}<div>
            <dt>{translate($locale, 'Transaction type')}</dt>
            <dd>{translate($locale, 'Self-spend')}</dd>
          </div>{/if}
      </dl>
      <button class="hash-box" onclick={copyTxid}
        ><span>{translate($locale, 'Transaction ID')}</span><code
          >{compactIdentifier(transaction.id)}</code
        >{#if txidCopied}<Check size={16} />{:else}<Copy size={16} />{/if}</button
      >
      {#if explorerUrl}
        <div class="explorer-panel">
          <button class="explorer-link" type="button" onclick={openExplorer}
            >{translate($locale, 'View on mempool.space')} <ExternalLink size={14} /></button
          >{#if explorerError}<p class="form-error" role="alert">{explorerError}</p>{/if}
          <p class="explorer-privacy">
            {translate($locale, 'Opening this shares the transaction lookup with mempool.space.')}
          </p>
        </div>
      {:else if defaultConfig.network === 'regtest'}
        <p class="explorer-unavailable">
          {translate($locale, 'mempool.space cannot see local regtest transactions.')}
        </p>
      {/if}
    </details>
    {#if canIncreaseFee || canSpendOutput}<div
        class="psbt-actions transaction-acceleration-actions"
      >
        {#if canIncreaseFee}<Button
            variant="secondary"
            href={`${multisig ? '/multisig/send' : '/send'}?accelerate=rbf&txid=${transaction.id}`}
            ><ArrowUp size={15} />{translate($locale, 'Increase fee (RBF)')}</Button
          >{/if}{#if canSpendOutput}<Button
            variant="secondary"
            href={`${multisig ? '/multisig/send' : '/send'}?accelerate=cpfp&txid=${transaction.id}`}
            ><Layers size={15} />{translate($locale, 'Spend output (CPFP)')}</Button
          >{/if}
      </div>{/if}
  {/if}
</Modal>

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.detail-hero):where(.detail-hero) :global(.detail-amount small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    font-weight: 500;
    letter-spacing: 0;
  }
  :global(.expanded-transaction-address):where(.expanded-transaction-address) {
    display: grid;
    justify-items: center;
    gap: 7px;
    padding-top: 14px;
  }
  :global(.expanded-transaction-address):where(.expanded-transaction-address)
    :global(.readable-address-block) {
    width: 100%;
  }
  :global(.expanded-transaction-address):where(.expanded-transaction-address) > :global(button) {
    padding: 4px 8px;
    border: 0;
    color: var(--link);
    background: transparent;
    font: inherit;
    font-size: var(--font-size-meta);
    cursor: pointer;
  }
  :global(.detail-hero):where(.detail-hero) {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2px 0 23px;
  }
  :global(.detail-hero):where(.detail-hero) > :global(span) {
    border-radius: var(--radius-inset);
    background: color-mix(in srgb, var(--success) 10%, transparent);
    color: var(--success);
    font-size: var(--font-size-meta);
    padding: 4px 8px;
    text-transform: capitalize;
  }
  :global(.detail-hero):where(.detail-hero) > :global(span.pending) {
    color: var(--accent);
    background: var(--accent-soft);
  }
  :global(.detail-hero):where(.detail-hero) > :global(span.replaced) {
    color: var(--muted);
    background: var(--surface-icon);
  }
  :global(.detail-hero):where(.detail-hero) :global(.detail-amount) {
    appearance: none;
    border: 0;
    background: none;
    color: var(--text);
    font-size: 27px;
    margin-top: 15px;
    padding: 0;
    cursor: pointer;
  }
  :global(.detail-hero):where(.detail-hero) :global(.detail-amount.replaced) {
    color: var(--muted);
    text-decoration: line-through;
  }
  :global(.detail-hero):where(.detail-hero) :global(.detail-amount:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: 5px;
    border-radius: 4px;
  }
  :global(.detail-hero):where(.detail-hero) :global(p) {
    color: var(--muted);
    margin: 6px 0 0;
    font-size: var(--font-size-meta);
  }
  :global(.detail-hero-labels):where(.detail-hero-labels) {
    max-width: 100%;
    margin-top: 8px;
  }
  :global(.detail-hero-labels):where(.detail-hero-labels) :global(.permanent-label-tags.prominent) {
    justify-content: center;
  }
  :global(.transaction-more-details):where(.transaction-more-details) {
    margin-top: 12px;
    border-bottom: 0;
  }
  :global(.transaction-more-details):where(.transaction-more-details) > :global(.details-list) {
    border-top: 0;
  }
  .transaction-summary-list > :global(div:last-child) {
    border-bottom: 0;
  }
  .transaction-summary-list {
    border-top: 0;
  }
  :global(.transaction-more-details):where(.transaction-more-details)
    > :global(.details-list:empty) {
    display: none;
  }
  :global(.transaction-more-details):where(.transaction-more-details) :global(.hash-box) {
    margin: 12px 0 0;
  }
  :global(.transaction-more-details):where(.transaction-more-details) :global(.explorer-panel),
  :global(.transaction-more-details):where(.transaction-more-details)
    :global(.explorer-unavailable) {
    margin-bottom: 12px;
  }
  :global(.explorer-unavailable):where(.explorer-unavailable) {
    margin: 0;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.4;
    text-align: center;
  }
  :global(.explorer-unavailable):where(.explorer-unavailable) {
    margin-top: 15px;
  }
  :global(.transaction-lineage):where(.transaction-lineage) {
    margin-bottom: 14px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-inset);
  }
  :global(.transaction-lineage-heading):where(.transaction-lineage-heading) {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    align-items: start;
    gap: 10px;
  }
  :global(.transaction-lineage-icon):where(.transaction-lineage-icon) {
    width: 30px;
    height: 30px;
    border-radius: var(--radius-control);
    display: grid;
    place-items: center;
    color: var(--link);
    background: var(--surface-icon);
  }
  :global(.transaction-lineage-heading):where(.transaction-lineage-heading) :global(strong) {
    display: block;
    color: var(--text);
    font-size: 14px;
    line-height: 1.35;
  }
  :global(.transaction-lineage-heading):where(.transaction-lineage-heading) :global(p) {
    max-width: 48ch;
    margin: 3px 0 0;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.45;
  }
  :global(.transaction-lineage-journey):where(.transaction-lineage-journey) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(82px, 0.7fr) minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    margin-top: 14px;
  }
  :global(.transaction-lineage-stop):where(.transaction-lineage-stop) {
    min-width: 0;
  }
  :global(.transaction-lineage-stop):where(.transaction-lineage-stop) > :global(span),
  :global(.transaction-lineage-stop):where(.transaction-lineage-stop) > :global(code),
  :global(.transaction-lineage-stop):where(.transaction-lineage-stop) > :global(small) {
    display: block;
  }
  :global(.transaction-lineage-stop):where(.transaction-lineage-stop) > :global(span) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.transaction-lineage-stop):where(.transaction-lineage-stop) > :global(code) {
    margin-top: 3px;
    overflow: hidden;
    color: var(--text);
    font-size: var(--font-size-meta);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.transaction-lineage-stop):where(.transaction-lineage-stop) > :global(small) {
    margin-top: 3px;
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.transaction-lineage-stop.current):where(.transaction-lineage-stop) {
    text-align: right;
  }
  :global(.transaction-lineage-stop.current):where(.transaction-lineage-stop) > :global(code) {
    color: var(--link);
  }
  :global(.transaction-lineage-connector):where(.transaction-lineage-connector) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    color: var(--link);
  }
  :global(.transaction-lineage-connector):where(.transaction-lineage-connector) > :global(span) {
    grid-column: 1 / -1;
    margin-bottom: 4px;
    color: var(--muted);
    font-size: var(--font-size-meta);
    text-align: center;
  }
  :global(.transaction-lineage-connector):where(.transaction-lineage-connector) > :global(i) {
    height: 1px;
    background: var(--link);
  }
  :global(.transaction-lineage-details):where(.transaction-lineage-details) {
    margin-top: 10px;
  }
  :global(.transaction-lineage-details):where(.transaction-lineage-details) > :global(summary) {
    width: max-content;
    color: var(--link);
    font-size: var(--font-size-meta);
    font-weight: 600;
    cursor: pointer;
  }
  :global(.transaction-lineage-insight):where(.transaction-lineage-insight) {
    margin: 12px 0 0;
    padding-top: 10px;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.5;
  }
  .transaction-acceleration-actions {
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  }
  .transaction-acceleration-actions :global(.button > svg) {
    flex: 0 0 auto;
  }

  @media (max-width: 760px) {
    :global(.transaction-lineage):where(.transaction-lineage) {
      padding: 12px;
    }
    :global(.transaction-lineage-journey):where(.transaction-lineage-journey) {
      grid-template-columns: minmax(0, 1fr) 68px minmax(0, 1fr);
      gap: 5px;
    }
  }
</style>
