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
          priorityFee = fees.priority === null ? null : Number(fees.priority);
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

  $effect(() => {
    if (!locked && !checked) void refresh();
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
    <i
      class:mainnet={network === 'mainnet'}
      class:online={nodeReachable === true}
      class:offline={nodeReachable === false}
    ></i>
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

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.network-status):where(.network-status) {
    position: relative;
    border-top: 1px solid var(--border);
    padding-top: 8px;
  }
  :global(.network-trigger):where(.network-trigger) {
    width: 100%;
    min-height: 38px;
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 0 11px;
    border: 0;
    border-radius: var(--radius-control);
    color: var(--muted);
    background: transparent;
    font-size: var(--font-size-meta);
    text-align: left;
    cursor: pointer;
  }
  :global(.network-trigger:hover):where(.network-trigger),
  :global(.network-trigger:focus-visible):where(.network-trigger),
  :global(.network-status.open):where(.network-status) :global(.network-trigger) {
    color: var(--text-soft);
    background: var(--surface-hover);
  }
  :global(.network-trigger):where(.network-trigger) :global(i) {
    width: 7px;
    height: 7px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 10%, transparent);
  }
  :global(.network-trigger):where(.network-trigger) :global(i.online),
  :global(.network-trigger):where(.network-trigger) :global(i.mainnet:not(.offline)) {
    background: var(--success);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 10%, transparent);
  }
  :global(.network-trigger):where(.network-trigger) :global(i.offline) {
    background: var(--danger);
    box-shadow: 0 0 0 3px rgba(214, 62, 73, 0.1);
  }
  :global(.network-popover):where(.network-popover) {
    position: absolute;
    z-index: 90;
    left: calc(100% + 10px);
    bottom: 0;
    width: 258px;
    padding: 13px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-inset);
    color: var(--text);
    background: var(--panel-2);
    box-shadow: 0 18px 55px rgba(0, 0, 0, 0.32);
  }
  :global(.network-popover):where(.network-popover) :global(header) {
    display: flex;
    align-items: center;
    gap: 9px;
    padding-bottom: 11px;
    border-bottom: 1px solid var(--border);
  }
  :global(.network-popover):where(.network-popover) :global(header > span) {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-control);
    color: var(--link);
    background: color-mix(in srgb, var(--link) 12%, transparent);
  }
  :global(.network-popover):where(.network-popover) :global(header > div) {
    display: grid;
    gap: 2px;
  }
  :global(.network-popover-close):where(.network-popover-close) {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    margin-left: auto;
    padding: 0;
    border: 0;
    border-radius: var(--radius-control);
    color: var(--muted);
    background: transparent;
  }
  :global(.network-popover-close:hover):where(.network-popover-close),
  :global(.network-popover-close:focus-visible):where(.network-popover-close) {
    color: var(--text);
    background: var(--surface-hover);
  }
  :global(.network-popover):where(.network-popover) :global(header strong) {
    font-size: 14px;
  }
  :global(.network-popover):where(.network-popover) :global(header small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.network-popover):where(.network-popover) :global(dl) {
    display: grid;
    gap: 1px;
    margin: 8px 0 0;
  }
  :global(.network-popover):where(.network-popover) :global(dl > div) {
    min-height: 42px;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 0 4px;
    border-bottom: 1px solid var(--border);
  }
  :global(.network-popover):where(.network-popover) :global(dl > div:last-child) {
    border: 0;
  }
  :global(.network-popover):where(.network-popover) :global(dt) {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-soft);
    font-size: 13px;
  }
  :global(.network-popover):where(.network-popover) :global(dt svg) {
    color: var(--muted);
  }
  :global(.network-popover):where(.network-popover) :global(dd) {
    margin: 0;
    color: var(--muted);
    font-size: var(--font-size-meta);
    text-align: right;
  }
  :global(.network-popover):where(.network-popover) > :global(p) {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 7px;
    align-items: start;
    margin: 8px 0 0;
    padding: 9px;
    border-radius: var(--radius-control);
    color: var(--muted);
    background: var(--surface-inset);
    font-size: var(--font-size-meta);
    line-height: 1.4;
  }
  :global(.network-popover):where(.network-popover) > :global(p svg) {
    color: var(--accent);
  }
  :global(.network-refresh):where(.network-refresh) {
    width: 100%;
    min-height: 34px;
    margin-top: 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-soft);
    background: var(--surface-control);
    font-size: var(--font-size-meta);
    cursor: pointer;
  }
  :global(.network-refresh:hover):where(.network-refresh) {
    background: var(--surface-hover);
  }
  :global(.network-refresh:disabled):where(.network-refresh) {
    cursor: wait;
    opacity: 0.65;
  }
</style>
