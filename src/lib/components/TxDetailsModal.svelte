<script lang="ts">
  import { ArrowUp, Copy, ExternalLink, Layers } from '@lucide/svelte';
  import Modal from './Modal.svelte';
  import Button from './Button.svelte';
  import { copyText } from '$lib/clipboard';
  import { defaultConfig, transactionExplorerUrl } from '$lib/config';
  import { shortSats } from '$lib/data';
  import { toast } from '$lib/stores/toasts';
  import type { Transaction } from '$lib/types';
  import { compactAddress } from '$lib/address-display';
  import ReadableAddress from './ReadableAddress.svelte';
  import LocalTimestamp from './LocalTimestamp.svelte';
  import { discreetMode } from '$lib/privacy';

  let { transaction, multisig = false, onclose } = $props<{ transaction: Transaction | null; multisig?: boolean; onclose: () => void }>();
  let showAddress = $state(false);
  let addressCopied = $state(false);
  let explorerUrl = $derived(transaction ? transactionExplorerUrl(defaultConfig.network, transaction.id) : null);
  let isSelfSpend = $derived(transaction?.kind === 'self_spend');

  $effect(() => {
    transaction?.id;
    showAddress = false;
  });

  async function copyTxid() {
    if (!transaction) return;
    try {
      await copyText(transaction.id);
      toast({ title: 'Transaction ID copied', tone: 'success' });
    } catch {
      toast({ title: 'Copy failed', tone: 'danger' });
    }
  }

  async function copyAddress() {
    if (!transaction?.address) return;
    try {
      await copyText(transaction.address);
      addressCopied = true;
      toast({ title: 'Address copied', tone: 'success' });
      setTimeout(() => addressCopied = false, 1_500);
    } catch {
      toast({ title: 'Copy failed', tone: 'danger' });
    }
  }
</script>

<Modal open={!!transaction} title="Transaction details" preserveTop {onclose}>
  {#if transaction}
    <div class="detail-hero">
      <span class:pending={transaction.status === 'pending'}>{transaction.status}</span>
      <strong class:positive={transaction.direction === 'received'}>{#if $discreetMode}••••••{:else}{transaction.direction === 'received' ? '+' : '−'}{shortSats(transaction.amount)}{/if} <small>sats</small></strong>
      <p>{isSelfSpend ? 'Self-spend · network fee' : transaction.label}</p>
    </div>
    <dl class="details-list">
      <div><dt>Date</dt><dd><LocalTimestamp value={transaction.date} /></dd></div>
      <div><dt>Confirmations</dt><dd>{transaction.confirmations}</dd></div>
      {#if transaction.block}<div><dt>Block</dt><dd>{transaction.block}</dd></div>{/if}
      {#if transaction.fee}<div><dt>Network fee</dt><dd>{$discreetMode ? '••••••' : shortSats(transaction.fee)} sats</dd></div>{/if}
      {#if transaction.address && !showAddress}<div><dt>{transaction.direction === 'received' ? 'Received at' : 'Sent to'}</dt><dd><button type="button" class="compact-address-button" aria-expanded="false" onclick={() => showAddress = true}>{compactAddress(transaction.address)}</button></dd></div>{/if}
      {#if isSelfSpend}<div><dt>Transaction type</dt><dd>Self-spend</dd></div>{/if}
    </dl>
    {#if showAddress && transaction.address}<div class="expanded-transaction-address"><ReadableAddress address={transaction.address} copied={addressCopied} oncopy={copyAddress}/><button type="button" onclick={() => showAddress = false}>Show compact address</button></div>{/if}
    <button class="hash-box" onclick={copyTxid}><span>Transaction ID</span><code>{transaction.id}</code><Copy size={16} /></button>
    {#if transaction.status === 'pending'}<div class="psbt-actions"><Button variant="secondary" href={`${multisig?'/multisig/send':'/send'}?accelerate=rbf&txid=${transaction.id}`}><ArrowUp size={15}/>Increase fee</Button><Button variant="secondary" href={`${multisig?'/multisig/send':'/send'}?accelerate=cpfp&txid=${transaction.id}`}><Layers size={15}/>Spend output (CPFP)</Button></div>{/if}
    {#if explorerUrl}
      <div class="explorer-panel">
        <a class="explorer-link" href={explorerUrl} target="_blank" rel="noopener noreferrer">View on mempool.space <ExternalLink size={14} /></a>
        <p class="explorer-privacy">Opening this shares the transaction lookup with mempool.space.</p>
      </div>
    {:else if defaultConfig.network === 'regtest'}
      <p class="explorer-unavailable">mempool.space cannot see local regtest transactions.</p>
    {/if}
  {/if}
</Modal>
