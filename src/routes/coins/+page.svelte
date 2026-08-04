<script lang="ts">
  import { CircleDot, Lock, Snowflake, Unlock } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import { shortSats } from '$lib/data';
  import { selectedCoinTotal } from '$lib/wallet/policy';
  import { walletService } from '$lib/wallet';
  import { toast } from '$lib/stores/toasts';
  import { onMount } from 'svelte';
  import type { Utxo } from '$lib/types';

  let utxos = $state<Utxo[]>([]);
  let selected = $state<string[]>([]);
  let busy = $state(false);
  const selectedTotal = $derived(selectedCoinTotal(utxos, selected));
  const sendHref = $derived(`/send?coins=${encodeURIComponent(selected.join(','))}`);

  onMount(load);
  async function load() {
    try { utxos = (await walletService.snapshot()).utxos; }
    catch (cause) { toast({ title: 'Could not load coins', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' }); }
  }
  function toggle(outpoint: string, checked: boolean) {
    selected = checked ? [...selected, outpoint] : selected.filter((item) => item !== outpoint);
  }
  async function freeze(outpoints: string[], frozen: boolean) {
    if (outpoints.length === 0) return;
    busy = true;
    try {
      await Promise.all(outpoints.map((outpoint) => walletService.setCoinFrozen(outpoint, frozen)));
      utxos = utxos.map((coin) => outpoints.includes(coin.outpoint) ? { ...coin, frozen } : coin);
      selected = selected.filter((outpoint) => !outpoints.includes(outpoint));
      toast({ title: frozen ? 'Coins frozen' : 'Coins unfrozen', description: frozen ? 'Automatic selection will leave them untouched.' : 'They are available to spend again.', tone: 'success' });
    } catch (cause) { toast({ title: 'Could not update coins', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' }); }
    finally { busy = false; }
  }
</script>

<div class="page">
  <header class="page-header"><div><p class="eyebrow">COINS</p><h1>Coins</h1><p class="subtitle">Choose exactly what a payment may spend.</p></div><div class="stat-pill"><span>{utxos.length} coins</span><strong>{shortSats(utxos.reduce((a, u) => a + u.amount, 0))} sats</strong></div></header>

  <section class="coin-toolbar" aria-live="polite">
    <div><strong>{selected.length} selected</strong><span>{shortSats(selectedTotal)} sats selected</span></div>
    <div>{#if selected.length}<Button variant="secondary" size="small" disabled={busy} onclick={() => freeze(selected, true)}><Snowflake size={15}/>Freeze selected</Button><Button size="small" href={sendHref}>Send selected coins</Button>{:else}<span class="auto-note"><CircleDot size={14}/>Automatic selection remains the default</span>{/if}</div>
  </section>

  <section class="coin-list selectable">
    {#each utxos as utxo}
      <article class:frozen={utxo.frozen}>
        <label class="coin-check"><input type="checkbox" aria-label="Select {utxo.label}" checked={selected.includes(utxo.outpoint)} disabled={utxo.frozen || busy} onchange={(event) => toggle(utxo.outpoint, event.currentTarget.checked)}/><span></span></label>
        <span class="coin-icon">{#if utxo.frozen}<Lock size={17}/>{:else}<CircleDot size={19}/>{/if}</span>
        <div class="coin-main"><strong>{shortSats(utxo.amount)} sats</strong><span>{utxo.label}</span><code>{utxo.outpoint}</code></div>
        <div class="coin-meta">{#if utxo.frozen}<strong class="frozen-label">Frozen</strong><button aria-label="Unfreeze {utxo.label}" disabled={busy} onclick={() => freeze([utxo.outpoint], false)}><Unlock size={13}/>Unfreeze</button>{:else}<strong>{utxo.confirmations}</strong><span>confirmations</span><small>{utxo.address}</small>{/if}</div>
      </article>
    {:else}
      <div class="coins-empty"><CircleDot size={22}/><strong>No spendable outputs yet</strong><span>Received bitcoin will appear here after sync.</span></div>
    {/each}
  </section>
</div>
