<script lang="ts">
  import { locale } from '$lib/i18n';
  import { translate } from '$lib/i18n-catalog';
  import { ArrowUp, Copy, ExternalLink, Layers } from '@lucide/svelte';
  import Modal from './Modal.svelte';
  import Button from './Button.svelte';
  import { copyText } from '$lib/clipboard';
  import { defaultConfig, transactionExplorerUrl } from '$lib/config';
  import Amount from './Amount.svelte';
  import { toast } from '$lib/stores/toasts';
  import type { Transaction } from '$lib/types';
  import { compactAddress } from '$lib/address-display';
  import ReadableAddress from './ReadableAddress.svelte';
  import LocalTimestamp from './LocalTimestamp.svelte';
  import { discreetMode } from '$lib/privacy';
  import { denomination, setDenomination } from '$lib/denomination';

  let {
    transaction,
    multisig = false,
    onclose
  } = $props<{ transaction: Transaction | null; multisig?: boolean; onclose: () => void }>();
  let showAddress = $state(false);
  let showMore = $state(false);
  let addressCopied = $state(false);
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
      <p>
        {translate(
          $locale,
          $discreetMode
            ? 'Label hidden'
            : isSelfSpend
              ? 'Self-spend · network fee'
              : transaction.label
        )}
      </p>
    </div>
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
            {translate(
              $locale,
              $discreetMode
                ? 'Hidden in discreet mode'
                : transaction.direction === 'sent'
                  ? (transaction.intentLabel?.text ?? transaction.label)
                  : transaction.provenance.state === 'unknown'
                    ? 'Source unknown'
                    : transaction.provenance.labels
                        .map((label: { text: string }) => label.text)
                        .join(' + ') || transaction.label
            )}
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
            <dd><code>{transaction.replacedBy}</code></dd>
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
        ><span>{translate($locale, 'Transaction ID')}</span><code>{transaction.id}</code><Copy
          size={16}
        /></button
      >
      {#if explorerUrl}
        <div class="explorer-panel">
          <a class="explorer-link" href={explorerUrl} target="_blank" rel="noopener noreferrer"
            >{translate($locale, 'View on mempool.space')} <ExternalLink size={14} /></a
          >
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
