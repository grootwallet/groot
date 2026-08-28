<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { ArrowRight, ArrowUp, Copy, ExternalLink, Layers } from '@lucide/svelte';
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
  let explorerError = $state('');
  let explorerUrl = $derived(
    transaction ? transactionExplorerUrl(defaultConfig.network, transaction.id) : null
  );
  let isSelfSpend = $derived(transaction?.kind === 'self_spend');
  let canIncreaseFee = $derived(
    transaction?.status === 'pending' &&
      transaction.direction === 'sent' &&
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
  });

  async function copyTxid() {
    if (!transaction) return;
    try {
      await copyText(transaction.id, 'identifier');
      toast({ title: 'Transaction ID copied', tone: 'success' });
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
    {#if transaction.replaces || (transaction.status === 'replaced' && transaction.replacedBy)}
      <aside class="transaction-lineage" aria-label={translate($locale, 'Transaction history')}>
        <div class="transaction-lineage-heading">
          <span class="transaction-lineage-icon" aria-hidden="true"><ArrowUp size={16} /></span>
          <div>
            <strong>{translate($locale, 'Fee increased')}</strong>
            <p>
              {translate(
                $locale,
                transaction.replaces
                  ? 'This is the newer transaction. It replaces an earlier version with a higher fee.'
                  : 'A newer transaction replaced this version with a higher fee.'
              )}
            </p>
          </div>
        </div>
        <div class="transaction-lineage-journey">
          <div class="transaction-lineage-stop earlier">
            <span
              >{translate(
                $locale,
                transaction.replaces ? 'Earlier transaction' : 'This transaction'
              )}</span
            >
            <code>{compactIdentifier(transaction.replaces ?? transaction.id, 8, 6)}</code>
            <small>
              {#if !transaction.replaces && transaction.feeRate != null}
                {transaction.feeRate} {translate($locale, 'sat/vB')} ·
              {/if}
              {translate($locale, 'Replaced')}
            </small>
          </div>
          <div class="transaction-lineage-connector" aria-hidden="true">
            <span>{translate($locale, 'Fee increased')}</span>
            <i></i><ArrowRight size={14} />
          </div>
          <div class="transaction-lineage-stop current">
            <span
              >{translate(
                $locale,
                transaction.replaces ? 'This transaction' : 'Newer transaction'
              )}</span
            >
            <code>{compactIdentifier(transaction.replacedBy ?? transaction.id, 8, 6)}</code>
            <small>
              {#if transaction.replaces && transaction.feeRate != null}
                {transaction.feeRate} {translate($locale, 'sat/vB')} ·
              {/if}
              {translate($locale, transaction.replaces ? 'Current' : 'Replacement')}
            </small>
          </div>
        </div>
        <details class="transaction-lineage-insight">
          <summary>{translate($locale, 'Why are both shown?')}</summary>
          <p>
            {translate(
              $locale,
              'Only the newer transaction can confirm. Groot keeps the earlier version as history and excludes it from balance totals.'
            )}
          </p>
        </details>
      </aside>
    {/if}
    <dl class="details-list">
      <div>
        <dt>{translate($locale, 'Date')}</dt>
        <dd><LocalTimestamp value={transaction.date} /></dd>
      </div>
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
      <summary>{translate($locale, 'View more details')}</summary>
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
              {transaction.locktime}{' · '}{translate(
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
            <dd>{transaction.block}</dd>
          </div>{/if}
        {#if isSelfSpend}<div>
            <dt>{translate($locale, 'Transaction type')}</dt>
            <dd>{translate($locale, 'Self-spend')}</dd>
          </div>{/if}
      </dl>
      <button class="hash-box" onclick={copyTxid}
        ><span>{translate($locale, 'Transaction ID')}</span><code
          >{compactIdentifier(transaction.id)}</code
        ><Copy size={16} /></button
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
