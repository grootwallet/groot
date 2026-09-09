<script lang="ts">
  import { translate } from '$lib/i18n-catalog';
  import { Blocks, Gauge, LockKeyhole, Network, Route, Server, X } from '@lucide/svelte';
  import { networkName, type SupportedNetwork } from '$lib/config';
  import { formatInteger, locale } from '$lib/i18n';
  import { walletService } from '$lib/wallet';
  import type { CoreNodeConfig, WalletSyncSource } from '$lib/wallet/contracts';

  let { network, locked = false } = $props<{ network: SupportedNetwork; locked?: boolean }>();
  let open = $state(false);
  let loading = $state(false);
  let checked = $state(false);
  let priorityFee = $state<number | null>(null);
  let nodeHeight = $state<number | null>(null);
  let nodeConfig = $state<CoreNodeConfig | null>(null);
  let syncSource = $state<WalletSyncSource | null>(null);
  let nodeReachable = $state<boolean | null>(null);
  let statusRoot: HTMLDivElement;

  const backendLabel = $derived(
    translate(
      $locale,
      nodeConfig?.backend.type === 'remote_core'
        ? 'Trusted remote node'
        : nodeConfig?.backend.type === 'local_core'
          ? 'Local Bitcoin Core'
          : locked && network === 'mainnet'
            ? 'Bitcoin Core'
            : 'Available after unlock'
    )
  );
  const transportLabel = $derived(
    translate(
      $locale,
      nodeConfig
        ? nodeConfig.torProxy
          ? 'Tor configured'
          : 'Direct connection'
        : locked && network === 'mainnet'
          ? 'Local or remote TLS'
          : 'Available after unlock'
    )
  );
  const syncLabel = $derived(
    translate(
      $locale,
      syncSource?.type === 'compact_filters'
        ? 'P2P compact filters'
        : syncSource?.type === 'bitcoin_core'
          ? 'Bitcoin Core RPC'
          : locked && network === 'mainnet'
            ? 'Bitcoin Core RPC'
            : 'Available after unlock'
    )
  );

  async function refresh() {
    if (loading) return;
    loading = true;
    try {
      try {
        const status = await walletService.publicNetworkStatus();
        priorityFee = status.priorityFee;
        nodeHeight = status.networkTip;
      } catch {
        priorityFee = null;
        nodeHeight = null;
      }
      try {
        nodeConfig = await walletService.nodeConfig();
      } catch {
        nodeConfig = null;
      }
      try {
        syncSource = await walletService.syncSource();
      } catch {
        syncSource = null;
      }
      if (!locked) {
        try {
          const fees = await walletService.estimateFees();
          priorityFee = Number(fees.priority);
        } catch {
          priorityFee = null;
        }
        try {
          const status = await walletService.testNodeConnection();
          nodeHeight = status.blocks;
          nodeReachable = status.connected;
        } catch {
          nodeHeight = null;
          nodeReachable = false;
        }
      } else {
        nodeReachable = null;
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
      priorityFee = null;
      nodeHeight = null;
      nodeConfig = null;
      syncSource = null;
      nodeReachable = null;
    }
  });
</script>

<svelte:window
  onpointerdown={(event) => {
    if (open && !statusRoot?.contains(event.target as Node)) open = false;
  }}
/>

<div
  bind:this={statusRoot}
  class="network-status"
  class:open
  role="group"
  aria-label={translate($locale, 'Network controls')}
  onmouseenter={show}
  onmouseleave={() => (open = false)}
  onfocusin={show}
  onfocusout={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) open = false;
  }}
>
  <button
    type="button"
    class="network-trigger"
    aria-label={translate($locale, '{network} network status', { network: networkName(network) })}
    aria-expanded={open}
    aria-haspopup="dialog"
    onclick={activate}
  >
    <i class:online={nodeReachable === true} class:offline={nodeReachable === false}></i>
    <span>{networkName(network)}</span>
  </button>
  {#if open}
    <section class="network-popover" aria-label={translate($locale, 'Network status')}>
      <header>
        <span><Network size={15} /></span>
        <div>
          <strong>{networkName(network)}</strong><small
            >{locked
              ? translate($locale, 'Wallet locked')
              : nodeReachable === true
                ? translate($locale, 'Node reachable')
                : nodeReachable === false
                  ? translate($locale, 'Node unavailable')
                  : translate($locale, 'Checking node…')}</small
          >
        </div>
        <button
          type="button"
          class="network-popover-close"
          aria-label={translate($locale, 'Close')}
          onclick={() => (open = false)}><X size={15} /></button
        >
      </header>
      <dl>
        <div>
          <dt><Gauge size={14} /><span>{translate($locale, 'Priority fee')}</span></dt>
          <dd>
            {priorityFee === null
              ? loading
                ? translate($locale, 'Checking…')
                : translate($locale, 'Unavailable')
              : translate($locale, '{rate} sat/vB', { rate: priorityFee })}
          </dd>
        </div>
        <div>
          <dt><Blocks size={14} /><span>{translate($locale, 'Network tip')}</span></dt>
          <dd>
            {nodeHeight === null
              ? translate($locale, 'Unavailable')
              : formatInteger(nodeHeight, $locale)}
          </dd>
        </div>
        <div>
          <dt><Route size={14} /><span>{translate($locale, 'Transport')}</span></dt>
          <dd>{transportLabel}</dd>
        </div>
        <div>
          <dt><Server size={14} /><span>{translate($locale, 'Activity sync')}</span></dt>
          <dd>{syncLabel}</dd>
        </div>
        <div>
          <dt><Server size={14} /><span>{translate($locale, 'Fee / broadcast')}</span></dt>
          <dd>{backendLabel}</dd>
        </div>
      </dl>
      {#if locked}<p>
          <LockKeyhole size={13} />{translate(
            $locale,
            'Node credentials remain sealed until a wallet is unlocked.'
          )}
        </p>{/if}
      {#if !locked}<button
          type="button"
          class="network-refresh"
          disabled={loading}
          onclick={() => refresh()}
          >{loading ? translate($locale, 'Checking…') : translate($locale, 'Check again')}</button
        >{/if}
    </section>
  {/if}
</div>
