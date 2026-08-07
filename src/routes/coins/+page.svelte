<script lang="ts">
  import { AlertTriangle, ChevronDown, CircleDot, Copy, Lock, Snowflake, Unlock } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import CoinFreezeConfirmModal from '$lib/components/CoinFreezeConfirmModal.svelte';
  import { compactAddress } from '$lib/address-display';
  import { copyText } from '$lib/clipboard';
  import { shortSats } from '$lib/data';
  import { addressReuseInsights, selectedCoinTotal } from '$lib/wallet/policy';
  import { walletService } from '$lib/wallet';
  import { toast } from '$lib/stores/toasts';
  import { onMount } from 'svelte';
  import type { Utxo } from '$lib/types';
  import { formatConfirmationCount, locale, t } from '$lib/i18n';

  let utxos = $state<Utxo[]>([]);
  let selected = $state<string[]>([]);
  let expanded = $state<string[]>([]);
  let busy = $state(false);
  let multisig = $state(false);
  let freezeIntent = $state<{ outpoints: string[]; frozen: boolean } | null>(null);
  const selectedTotal = $derived(selectedCoinTotal(utxos, selected));
  const reuseInsights = $derived(addressReuseInsights(utxos));
  const freezeIntentCoins = $derived(freezeIntent ? utxos.filter((coin) => freezeIntent?.outpoints.includes(coin.outpoint)) : []);
  const sendHref = $derived(`${multisig ? '/multisig/send' : '/send'}?coins=${encodeURIComponent(selected.join(','))}`);

  onMount(load);
  onMount(() => walletService.subscribe((event) => {
    if (event.type === 'wallet_updated') {
      multisig = event.walletKind === 'multisig';
      utxos = event.snapshot.utxos;
      selected = selected.filter((outpoint) => utxos.some((coin) => coin.outpoint === outpoint && !coin.frozen));
    }
  }));

  async function load() {
    try {
      const registry = await walletService.profiles();
      multisig = registry.wallets.find((wallet) => wallet.id === registry.selectedWalletId)?.kind === 'multisig';
      utxos = (multisig ? await walletService.multisigSnapshot() : await walletService.snapshot()).utxos;
    } catch (cause) {
      toast({ title: 'Could not load coins', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' });
    }
  }

  function toggle(outpoint: string, checked: boolean) {
    selected = checked ? [...selected, outpoint] : selected.filter((item) => item !== outpoint);
  }

  function toggleDetails(outpoint: string) {
    expanded = expanded.includes(outpoint) ? expanded.filter((item) => item !== outpoint) : [...expanded, outpoint];
  }

  function reuseFor(outpoint: string) {
    return reuseInsights.find((insight) => insight.outpoints.includes(outpoint));
  }

  async function copy(value: string, label: string) {
    try {
      await copyText(value);
      toast({ title: `${label} copied`, tone: 'success' });
    } catch {
      toast({ title: 'Copy failed', description: 'Select and copy it manually.', tone: 'danger' });
    }
  }

  function requestFrozenState(outpoints: string[], frozen: boolean) {
    if (outpoints.length === 0) return;
    freezeIntent = { outpoints: [...outpoints], frozen };
  }

  function closeFreezeConfirmation() {
    if (!busy) freezeIntent = null;
  }

  async function confirmFrozenState() {
    const intent = freezeIntent;
    if (!intent || intent.outpoints.length === 0) return;
    busy = true;
    try {
      const update = multisig ? walletService.setMultisigCoinFrozen.bind(walletService) : walletService.setCoinFrozen.bind(walletService);
      await Promise.all(intent.outpoints.map((outpoint) => update(outpoint, intent.frozen)));
      utxos = utxos.map((coin) => intent.outpoints.includes(coin.outpoint) ? { ...coin, frozen: intent.frozen } : coin);
      selected = selected.filter((outpoint) => !intent.outpoints.includes(outpoint));
      freezeIntent = null;
      toast({ title: intent.frozen ? 'Coins frozen' : 'Coins unfrozen', description: intent.frozen ? 'Automatic selection will leave them untouched.' : 'They are available to spend again.', tone: 'success' });
    } catch (cause) {
      toast({ title: 'Could not update coins', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' });
    } finally {
      busy = false;
    }
  }
</script>

<div class="page">
  <header class="page-header"><div><p class="eyebrow">COINS</p><h1>Coins</h1><p class="subtitle">Choose exactly what a payment may spend.</p></div><div class="stat-pill"><span>{utxos.length} coins</span><strong>{shortSats(utxos.reduce((a, u) => a + u.amount, 0))} sats</strong></div></header>

  <section class="coin-toolbar" aria-live="polite">
    <div><strong>{selected.length} selected</strong><span>{shortSats(selectedTotal)} sats selected</span></div>
    <div>{#if selected.length}<Button variant="secondary" size="small" disabled={busy} onclick={() => requestFrozenState(selected, true)}><Snowflake size={15}/>Freeze selected</Button><Button size="small" href={sendHref}>Send selected coins</Button>{:else}<span class="auto-note"><CircleDot size={14}/>Automatic selection remains the default</span>{/if}</div>
  </section>

  <section class="coin-list selectable">
    {#each utxos as utxo}
      {@const reuse = reuseFor(utxo.outpoint)}
      <article class="coin-row" class:frozen={utxo.frozen} class:reused={Boolean(reuse)}>
        <label class="coin-check"><input type="checkbox" aria-label="Select {utxo.label}" checked={selected.includes(utxo.outpoint)} disabled={utxo.frozen || busy} onchange={(event) => toggle(utxo.outpoint, event.currentTarget.checked)}/><span></span></label>
        <span class="coin-icon">{#if utxo.frozen}<Lock size={17}/>{:else}<CircleDot size={19}/>{/if}</span>
        <div class="coin-main">
          <strong>{utxo.label}</strong>
          <span>{shortSats(utxo.amount)} sats</span>
          {#if reuse}<small class="coin-reuse"><AlertTriangle size={12}/>Address reused · {reuse.outpoints.length} linked coins</small>{/if}
        </div>
        <div class="coin-meta">
          {#if utxo.frozen}<strong class="frozen-label">Frozen</strong><button aria-label="Unfreeze {utxo.label}" disabled={busy} onclick={() => requestFrozenState([utxo.outpoint], false)}><Unlock size={13}/>Unfreeze</button>{:else if utxo.confirmations}<strong>{formatConfirmationCount(utxo.confirmations, $locale)}</strong>{:else}<strong>{t('unconfirmed', $locale)}</strong><span>{t('awaitingConfirmation', $locale)}</span>{/if}
          <button class="coin-details-toggle" aria-expanded={expanded.includes(utxo.outpoint)} aria-label="{expanded.includes(utxo.outpoint) ? 'Hide' : 'Show'} details for {utxo.label}" onclick={() => toggleDetails(utxo.outpoint)}>Details <ChevronDown size={13} class={expanded.includes(utxo.outpoint) ? 'rotated' : ''}/></button>
        </div>
        {#if expanded.includes(utxo.outpoint)}
          <div class="coin-details">
            <dl><div><dt>Receive label</dt><dd>{utxo.label}</dd></div><div><dt>Address</dt><dd><code>{compactAddress(utxo.address)}</code><button aria-label="Copy address" onclick={() => copy(utxo.address, 'Address')}><Copy size={13}/></button></dd></div><div><dt>Outpoint</dt><dd><code>{compactAddress(utxo.outpoint, 18, 10)}</code><button aria-label="Copy outpoint" onclick={() => copy(utxo.outpoint, 'Outpoint')}><Copy size={13}/></button></dd></div></dl>
            {#if reuse}<p><AlertTriangle size={14}/><span><strong>These {reuse.outpoints.length} coins share one address.</strong> Spending them separately cannot undo their public link. Use a fresh labeled address for future payments.</span></p>{/if}
          </div>
        {/if}
      </article>
    {:else}
      <div class="coins-empty"><CircleDot size={22}/><strong>No spendable outputs yet</strong><span>Received bitcoin will appear here after sync.</span></div>
    {/each}
  </section>
</div>

<CoinFreezeConfirmModal
  coins={freezeIntentCoins}
  frozen={freezeIntent?.frozen ?? false}
  {busy}
  onclose={closeFreezeConfirmation}
  onconfirm={confirmFrozenState}
/>
