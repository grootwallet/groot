<script lang="ts">
  import { Copy, ExternalLink } from '@lucide/svelte';
  import Modal from './Modal.svelte';
  import { copyText } from '$lib/clipboard';
  import { defaultConfig } from '$lib/config';
  import { shortSats } from '$lib/data';
  import { toast } from '$lib/stores/toasts';
  import type { Transaction } from '$lib/types';

  let { transaction, onclose } = $props<{ transaction: Transaction | null; onclose: () => void }>();

  async function copyTxid() {
    if (!transaction) return;
    try {
      await copyText(transaction.id);
      toast({ title: 'Transaction ID copied', tone: 'success' });
    } catch {
      toast({ title: 'Copy failed', tone: 'danger' });
    }
  }
</script>

<Modal open={!!transaction} title="Transaction details" {onclose}>
  {#if transaction}
    <div class="detail-hero">
      <span class:pending={transaction.status === 'pending'}>{transaction.status}</span>
      <strong class:positive={transaction.direction === 'received'}>{transaction.direction === 'received' ? '+' : '−'}{shortSats(transaction.amount)} <small>sats</small></strong>
      <p>{transaction.label}</p>
    </div>
    <dl class="details-list">
      <div><dt>Date</dt><dd>{transaction.date}</dd></div>
      <div><dt>Confirmations</dt><dd>{transaction.confirmations}</dd></div>
      {#if transaction.block}<div><dt>Block</dt><dd>{transaction.block}</dd></div>{/if}
      {#if transaction.fee}<div><dt>Network fee</dt><dd>{shortSats(transaction.fee)} sats</dd></div>{/if}
      <div><dt>{transaction.direction === 'received' ? 'Received at' : 'Sent to'}</dt><dd class="mono">{transaction.address}</dd></div>
    </dl>
    <button class="hash-box" onclick={copyTxid}><span>Transaction ID</span><code>{transaction.id}</code><Copy size={16} /></button>
    {#if defaultConfig.explorerUrl}<a class="explorer-link" href="{defaultConfig.explorerUrl}/tx/{transaction.id}" target="_blank" rel="noopener noreferrer">View on mempool.space <ExternalLink size={14} /></a>{/if}
  {/if}
</Modal>
