<script lang="ts">
  import { Blocks, Gauge, LockKeyhole, Network, Route, Server } from '@lucide/svelte';
  import { networkName, type SupportedNetwork } from '$lib/config';
  import { walletService } from '$lib/wallet';
  import type { CoreNodeConfig } from '$lib/wallet/contracts';

  let { network, locked = false } = $props<{ network: SupportedNetwork; locked?: boolean }>();
  let open = $state(false);
  let loading = $state(false);
  let checked = $state(false);
  let priorityFee = $state<number | null>(null);
  let nodeHeight = $state<number | null>(null);
  let nodeConfig = $state<CoreNodeConfig | null>(null);
  let nodeReachable = $state<boolean | null>(null);

  const backendLabel = $derived(nodeConfig?.backend.type === 'remote_core' ? 'Trusted remote node' : nodeConfig?.backend.type === 'local_core' ? 'Local Bitcoin Core' : 'Available after unlock');
  const transportLabel = $derived(nodeConfig ? (nodeConfig.torProxy ? 'Tor configured' : 'Direct connection') : 'Available after unlock');

  async function refresh() {
    if (loading) return;
    loading = true;
    try {
      try {
        const fees = await walletService.estimateFees();
        priorityFee = Number(fees.priority);
      } catch {
        priorityFee = null;
      }
      if (locked) {
        nodeHeight = null;
        nodeConfig = null;
        nodeReachable = null;
      } else {
        try {
          const [config, status] = await Promise.all([walletService.nodeConfig(), walletService.testNodeConnection()]);
          nodeConfig = config;
          nodeHeight = status.blocks;
          nodeReachable = status.connected;
        } catch {
          nodeHeight = null;
          nodeConfig = null;
          nodeReachable = false;
        }
      }
    } finally {
      checked = true;
      loading = false;
    }
  }

  function show() {
    open = true;
    if (!checked) void refresh();
  }

  function activate() {
    open = true;
    void refresh();
  }

  $effect(() => {
    if (locked) {
      checked = false;
      nodeHeight = null;
      nodeConfig = null;
      nodeReachable = null;
    }
  });
</script>

<div class="network-status" class:open role="group" aria-label="Network controls" onmouseenter={show} onmouseleave={() => open = false} onfocusin={show} onfocusout={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) open = false; }}>
  <button type="button" class="network-trigger" aria-label="{networkName(network)} network status" aria-expanded={open} aria-haspopup="dialog" onclick={activate}>
    <i class:online={nodeReachable === true} class:offline={nodeReachable === false}></i>
    <span>{networkName(network)}</span>
  </button>
  {#if open}
    <section class="network-popover" aria-label="Network status">
      <header><span><Network size={15} /></span><div><strong>{networkName(network)}</strong><small>{locked ? 'Wallet locked' : nodeReachable === true ? 'Node reachable' : nodeReachable === false ? 'Node unavailable' : 'Checking node…'}</small></div></header>
      <dl>
        <div><dt><Gauge size={14} /><span>Priority fee</span></dt><dd>{priorityFee === null ? (loading ? 'Checking…' : 'Unavailable') : `${priorityFee} sat/vB`}</dd></div>
        <div><dt><Blocks size={14} /><span>Network tip</span></dt><dd>{nodeHeight === null ? (locked ? 'Unlock to check' : 'Unavailable') : nodeHeight.toLocaleString()}</dd></div>
        <div><dt><Route size={14} /><span>Transport</span></dt><dd>{transportLabel}</dd></div>
        <div><dt><Server size={14} /><span>Bitcoin node</span></dt><dd>{backendLabel}</dd></div>
      </dl>
      {#if locked}<p><LockKeyhole size={13} />Node credentials remain sealed until a wallet is unlocked.</p>{/if}
      {#if !locked}<button type="button" class="network-refresh" disabled={loading} onclick={() => refresh()}>{loading ? 'Checking…' : 'Check again'}</button>{/if}
    </section>
  {/if}
</div>
