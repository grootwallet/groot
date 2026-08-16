<script lang="ts">
  import {
    AlertTriangle,
    ChevronDown,
    CircleDot,
    Copy,
    Lock,
    Snowflake,
    Tag,
    Unlock
  } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import CoinFreezeConfirmModal from '$lib/components/CoinFreezeConfirmModal.svelte';
  import CoinSortMenu from '$lib/components/CoinSortMenu.svelte';
  import { compactAddress } from '$lib/address-display';
  import { copyText } from '$lib/clipboard';
  import { shortSats } from '$lib/data';
  import { addressReuseInsights, selectedCoinTotal } from '$lib/wallet/policy';
  import { walletService } from '$lib/wallet';
  import { toast } from '$lib/stores/toasts';
  import { onMount } from 'svelte';
  import type { Transaction, Utxo } from '$lib/types';
  import { formatConfirmationCount, locale, t } from '$lib/i18n';
  import { sortCoins, type CoinSortOrder } from '$lib/wallet/presentation';
  import WalletSkeleton from '$lib/components/WalletSkeleton.svelte';
  import { slide } from 'svelte/transition';
  import LoadFailure from '$lib/components/LoadFailure.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import FieldCounter from '$lib/components/FieldCounter.svelte';
  import { useWalletShellContext } from '$lib/wallet/shell-context';
  import { discreetMode } from '$lib/privacy';
  import Modal from '$lib/components/Modal.svelte';
  import PermanentLabelTags from '$lib/components/PermanentLabelTags.svelte';

  const walletShell = useWalletShellContext();
  let utxos = $state<Utxo[]>([]);
  let transactions = $state<Transaction[]>([]);
  let sortOrder = $state<CoinSortOrder>('newest');
  let provenanceFilter = $state<'all' | 'known' | 'mixed' | 'unknown' | 'reused'>('all');
  let labelFilter = $state('');
  let selected = $state<string[]>([]);
  let expanded = $state<string[]>([]);
  let busy = $state(false);
  let multisig = $state(false);
  let freezeIntent = $state<{ outpoints: string[]; frozen: boolean } | null>(null);
  let claimIntent = $state<string | null>(null);
  let claimLabel = $state('');
  let claimError = $state('');
  let claimBusy = $state(false);
  let loading = $state(true);
  let loadError = $state('');
  const selectedTotal = $derived(selectedCoinTotal(utxos, selected));
  const filteredUtxos = $derived(
    utxos.filter((coin) => {
      const needle = labelFilter.trim().toLocaleLowerCase();
      const labelMatches =
        !needle ||
        coin.provenance.labels.some((label) => label.text.toLocaleLowerCase().includes(needle)) ||
        coin.label.toLocaleLowerCase().includes(needle);
      const provenanceMatches =
        provenanceFilter === 'all' ||
        provenanceFilter === coin.provenance.state ||
        (provenanceFilter === 'reused' && coin.provenance.addressReused);
      return labelMatches && provenanceMatches;
    })
  );
  const sortedUtxos = $derived(sortCoins(filteredUtxos, transactions, sortOrder));
  const reuseInsights = $derived(addressReuseInsights(utxos));
  const coinName = (utxo: Utxo) =>
    $discreetMode
      ? 'Coin with hidden labels'
      : utxo.provenance.labels.map((label) => label.text).join(', ') || utxo.label;
  const coinKind = (utxo: Utxo) =>
    utxo.provenance.context === 'received'
      ? 'Received'
      : utxo.provenance.context === 'change'
        ? 'Change'
        : 'Coin';
  const freezeIntentCoins = $derived(
    freezeIntent ? utxos.filter((coin) => freezeIntent?.outpoints.includes(coin.outpoint)) : []
  );
  const sendHref = $derived(
    `${multisig ? '/multisig/send' : '/send'}?coins=${encodeURIComponent(selected.join(','))}`
  );

  $effect(() => {
    if ($discreetMode) labelFilter = '';
  });

  onMount(load);
  onMount(() =>
    walletService.subscribe((event) => {
      if (event.type === 'wallet_updated' && event.walletId === walletShell.selectedWalletId()) {
        multisig = event.walletKind === 'multisig';
        utxos = event.snapshot.utxos;
        transactions = event.snapshot.transactions;
        selected = selected.filter((outpoint) =>
          utxos.some((coin) => coin.outpoint === outpoint && !coin.frozen)
        );
        loadError = '';
        loading = false;
      }
    })
  );

  async function load() {
    loading = true;
    loadError = '';
    try {
      const shellWallets = walletShell.profiles();
      const shellSelectedWalletId = walletShell.selectedWalletId();
      const registry =
        shellWallets.length && shellSelectedWalletId
          ? { wallets: shellWallets, selectedWalletId: shellSelectedWalletId }
          : await walletService.profiles();
      multisig =
        registry.wallets.find((wallet) => wallet.id === registry.selectedWalletId)?.kind ===
        'multisig';
      const snapshot = multisig
        ? await walletService.multisigSnapshot()
        : await walletService.snapshot();
      utxos = snapshot.utxos;
      transactions = snapshot.transactions;
    } catch (cause) {
      loadError = cause instanceof Error ? cause.message : 'Coin data could not be read.';
      toast({ title: 'Could not load coins', description: loadError, tone: 'danger' });
    } finally {
      loading = false;
    }
  }

  function toggle(outpoint: string, checked: boolean) {
    selected = checked ? [...selected, outpoint] : selected.filter((item) => item !== outpoint);
  }

  function toggleDetails(outpoint: string) {
    expanded = expanded.includes(outpoint)
      ? expanded.filter((item) => item !== outpoint)
      : [...expanded, outpoint];
  }

  function reuseFor(outpoint: string) {
    return reuseInsights.find((insight) => insight.outpoints.includes(outpoint));
  }

  function linkedCoinsFor(outpoint: string) {
    const reuse = reuseFor(outpoint);
    if (!reuse) return [];

    return utxos.filter(
      (coin) => coin.outpoint !== outpoint && reuse.outpoints.includes(coin.outpoint)
    );
  }

  async function copy(value: string, label: string, content: 'bitcoin-address' | 'identifier') {
    try {
      await copyText(value, content);
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
      const update = multisig
        ? walletService.setMultisigCoinFrozen.bind(walletService)
        : walletService.setCoinFrozen.bind(walletService);
      await Promise.all(intent.outpoints.map((outpoint) => update(outpoint, intent.frozen)));
      utxos = utxos.map((coin) =>
        intent.outpoints.includes(coin.outpoint) ? { ...coin, frozen: intent.frozen } : coin
      );
      selected = selected.filter((outpoint) => !intent.outpoints.includes(outpoint));
      freezeIntent = null;
      toast({
        title: intent.frozen ? 'Coins frozen' : 'Coins unfrozen',
        description: intent.frozen
          ? 'Automatic selection will leave them untouched.'
          : 'They are available to spend again.',
        tone: 'success'
      });
    } catch (cause) {
      toast({
        title: 'Could not update coins',
        description: cause instanceof Error ? cause.message : undefined,
        tone: 'danger'
      });
    } finally {
      busy = false;
    }
  }

  function beginObservedReceiveClaim(outpoint: string) {
    claimIntent = outpoint;
    claimLabel = '';
    claimError = '';
  }

  function cancelObservedReceiveClaim() {
    if (claimBusy) return;
    claimIntent = null;
    claimLabel = '';
    claimError = '';
  }

  async function claimObservedReceiveAddress() {
    if (!claimIntent || claimBusy) return;
    claimBusy = true;
    claimError = '';
    try {
      await walletService.claimObservedMultisigAddress(claimIntent, claimLabel);
      await load();
      claimIntent = null;
      claimLabel = '';
      toast({
        title: 'Permanent label saved',
        description: 'The previously unlabeled received output now has known local provenance.',
        tone: 'success'
      });
    } catch (cause) {
      claimError =
        cause instanceof Error ? cause.message : 'The permanent label could not be saved.';
    } finally {
      claimBusy = false;
    }
  }
</script>

<div class="page">
  <header class="page-header">
    <div>
      <p class="eyebrow">COINS</p>
      <h1>Coins</h1>
      <p class="subtitle">Choose exactly what a payment may spend.</p>
    </div>
    <div class="stat-pill">
      <span>{utxos.length} coins</span><strong
        >{$discreetMode ? '••••••' : shortSats(utxos.reduce((a, u) => a + u.amount, 0))} sats</strong
      >
    </div>
  </header>

  <section class="coin-toolbar" aria-live="polite">
    <div>
      <strong>{selected.length} selected</strong><span
        >{$discreetMode ? '••••••' : shortSats(selectedTotal)} sats selected</span
      >
    </div>
    <div class="coin-toolbar-actions">
      {#if selected.length}<Button
          variant="secondary"
          size="small"
          disabled={busy}
          onclick={() => requestFrozenState(selected, true)}
          ><Snowflake size={15} />Freeze selected</Button
        ><Button size="small" href={sendHref}>Send selected coins</Button>{:else}<span
          class="auto-note"><CircleDot size={14} />Automatic selection remains the default</span
        >{/if}<CoinSortMenu value={sortOrder} onchange={(next) => (sortOrder = next)} />
    </div>
  </section>
  <section class="coin-filters" aria-label="Filter coins by label and provenance">
    <label
      ><span>Label</span><input
        bind:value={labelFilter}
        placeholder="Filter labels"
        disabled={$discreetMode}
      /></label
    ><label
      ><span>Provenance</span><select bind:value={provenanceFilter}
        ><option value="all">All sources</option><option value="known">Known</option><option
          value="mixed">Mixed</option
        ><option value="unknown">Unknown</option><option value="reused">Address reused</option
        ></select
      ></label
    >
  </section>

  {#if loading}
    <WalletSkeleton variant="coins" count={4} />
  {:else if loadError}
    <LoadFailure title="Coins are unavailable" description={loadError} onretry={load} />
  {:else if sortedUtxos.length}
    <section class="coin-list selectable">
      {#each sortedUtxos as utxo (utxo.outpoint)}
        {@const reuse = reuseFor(utxo.outpoint)}
        {@const linkedCoins = linkedCoinsFor(utxo.outpoint)}
        <article class="coin-row" class:frozen={utxo.frozen} class:reused={Boolean(reuse)}>
          <label class="coin-check"
            ><input
              type="checkbox"
              aria-label="Select {coinName(utxo)}"
              checked={selected.includes(utxo.outpoint)}
              disabled={utxo.frozen || busy}
              onchange={(event) => toggle(utxo.outpoint, event.currentTarget.checked)}
            /><span></span></label
          >
          <span class="coin-icon"
            >{#if utxo.frozen}<Lock size={17} />{:else}<CircleDot size={19} />{/if}</span
          >
          <div class="coin-main">
            <div class="coin-title">
              <strong>{coinKind(utxo)}</strong>{#if utxo.frozen}<span class="coin-status frozen"
                  >Frozen</span
                >{:else if utxo.provenance.state === 'mixed'}<span class="coin-status reused"
                  >Mixed provenance</span
                >{:else if utxo.provenance.state === 'unknown'}<span class="coin-status pending"
                  >Unknown source</span
                >{:else if reuse || utxo.provenance.addressReused}<span class="coin-status reused"
                  >Address reused</span
                >{:else if !utxo.confirmations}<span class="coin-status pending">Unconfirmed</span
                >{/if}
            </div>
            <PermanentLabelTags labels={utxo.provenance.labels} hidden={$discreetMode} />
            <span>{$discreetMode ? '••••••' : shortSats(utxo.amount)} sats</span>
          </div>
          <div class="coin-meta coin-actions-meta">
            <div class="coin-row-actions">
              {#if utxo.frozen}
                <button
                  class="coin-unfreeze-action"
                  aria-label="Unfreeze {coinName(utxo)}"
                  disabled={busy}
                  onclick={() => requestFrozenState([utxo.outpoint], false)}
                  ><Unlock size={14} />Unfreeze</button
                >
              {:else}
                <button
                  class="coin-freeze-action"
                  aria-label="Freeze {coinName(utxo)}"
                  disabled={busy}
                  onclick={() => requestFrozenState([utxo.outpoint], true)}
                  ><Snowflake size={14} />Freeze</button
                >
              {/if}
              <button
                class="coin-details-toggle"
                aria-expanded={expanded.includes(utxo.outpoint)}
                aria-label="{expanded.includes(utxo.outpoint)
                  ? 'Hide'
                  : 'Show'} details for {coinName(utxo)}"
                onclick={() => toggleDetails(utxo.outpoint)}
                >Details <ChevronDown
                  size={13}
                  class={expanded.includes(utxo.outpoint) ? 'rotated' : ''}
                /></button
              >
            </div>
          </div>
          {#if expanded.includes(utxo.outpoint)}
            <div class="coin-details" transition:slide={{ duration: 180 }}>
              <dl>
                <div>
                  <dt>Status</dt>
                  <dd>
                    {utxo.confirmations
                      ? formatConfirmationCount(utxo.confirmations, $locale)
                      : `${t('unconfirmed', $locale)} · ${t('awaitingConfirmation', $locale)}`}
                  </dd>
                </div>
                <div>
                  <dt>Provenance</dt>
                  <dd>
                    {$discreetMode
                      ? 'Hidden in discreet mode'
                      : utxo.provenance.state === 'unknown'
                        ? 'Source unknown'
                        : utxo.provenance.labels.map((label) => label.text).join(' + ') ||
                          utxo.label}{!$discreetMode && utxo.provenance.state === 'mixed'
                      ? ' · Mixed'
                      : ''}
                  </dd>
                </div>
                <div>
                  <dt>Privacy clusters</dt>
                  <dd>
                    {$discreetMode
                      ? 'Hidden in discreet mode'
                      : `${utxo.provenance.clusterCount || 'Unknown'}${utxo.provenance.addressReused ? ' · Address reused' : ''}`}
                  </dd>
                </div>
                {#if !$discreetMode && utxo.provenance.sourceTransactionId}<div>
                    <dt>Source transaction</dt>
                    <dd>
                      <code>{compactAddress(utxo.provenance.sourceTransactionId, 18, 10)}</code>
                    </dd>
                  </div>{/if}{#if !$discreetMode && utxo.provenance.sourceIntentLabel}<div>
                    <dt>Source payment intent</dt>
                    <dd>{utxo.provenance.sourceIntentLabel.text}</dd>
                  </div>{/if}{#if !$discreetMode && utxo.provenance.context === 'change'}<div>
                    <dt>Change lineage</dt>
                    <dd>
                      {utxo.provenance.sourceOutpoints?.length ?? 0} wallet input{(utxo.provenance
                        .sourceOutpoints?.length ?? 0) === 1
                        ? ''
                        : 's'}
                    </dd>
                  </div>{/if}
                <div>
                  <dt>Address</dt>
                  <dd>
                    <code>{compactAddress(utxo.address)}</code><button
                      aria-label="Copy address"
                      onclick={() => copy(utxo.address, 'Address', 'bitcoin-address')}
                      ><Copy size={13} /></button
                    >
                  </dd>
                </div>
                <div>
                  <dt>Outpoint</dt>
                  <dd>
                    <code>{compactAddress(utxo.outpoint, 18, 10)}</code><button
                      aria-label="Copy outpoint"
                      onclick={() => copy(utxo.outpoint, 'Outpoint', 'identifier')}
                      ><Copy size={13} /></button
                    >
                  </dd>
                </div>
              </dl>
              {#if reuse}
                <div class="coin-reuse-details">
                  <div class="coin-reuse-explanation">
                    <AlertTriangle size={14} />
                    <span>
                      <strong
                        >{linkedCoins.length === 1
                          ? 'This coin shares its address with 1 other coin.'
                          : `This coin shares its address with ${linkedCoins.length} other coins.`}</strong
                      >
                      Spending them separately cannot undo their public link. Use a fresh labeled address
                      for future payments.
                    </span>
                  </div>
                  <ul aria-label="Coins linked by address reuse">
                    {#each linkedCoins as linkedCoin (linkedCoin.outpoint)}
                      <li>
                        <span>Linked coin</span>
                        <strong
                          >{$discreetMode ? '••••••' : shortSats(linkedCoin.amount)} sats</strong
                        >
                        <code>{compactAddress(linkedCoin.outpoint, 12, 8)}</code>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
              {#if multisig && !$discreetMode && utxo.provenance.context === 'received' && utxo.provenance.state === 'unknown' && !utxo.primaryLabel}
                <div class="observed-receive-prompt">
                  <span><Tag size={15} /></span>
                  <div>
                    <strong>No local label</strong>
                    <small>Assign its first permanent label once.</small>
                  </div>
                  <Button
                    variant="secondary"
                    size="small"
                    onclick={() => beginObservedReceiveClaim(utxo.outpoint)}>Add label</Button
                  >
                </div>
              {/if}
            </div>
          {/if}
        </article>
      {:else}
        <div class="coins-empty">
          <CircleDot size={22} /><strong>No spendable outputs yet</strong><span
            >Received bitcoin will appear here after sync.</span
          >
        </div>
      {/each}
    </section>
  {:else}
    <EmptyState
      title="No coins yet"
      description="Received bitcoin will appear here after this wallet has synchronized."
    >
      {#snippet icon()}<CircleDot size={24} />{/snippet}
    </EmptyState>
  {/if}
</div>

<CoinFreezeConfirmModal
  coins={freezeIntentCoins}
  frozen={freezeIntent?.frozen ?? false}
  {busy}
  onclose={closeFreezeConfirmation}
  onconfirm={confirmFrozenState}
/>

<Modal
  open={!!claimIntent}
  title="Add permanent label"
  description="This received address has no local label. Assign its first label once; it cannot be changed or reused."
  onclose={cancelObservedReceiveClaim}
>
  <form
    class="modal-form"
    onsubmit={(event) => (event.preventDefault(), claimObservedReceiveAddress())}
  >
    <label class="field">
      <span>Permanent label</span>
      <input
        bind:value={claimLabel}
        maxlength="48"
        required
        disabled={claimBusy}
        placeholder="What was this payment for?"
      />
      <FieldCounter value={claimLabel} max={48} />
    </label>
    {#if claimError}<p class="form-error" role="alert">{claimError}</p>{/if}
    <div class="modal-footer">
      <Button
        type="button"
        variant="secondary"
        disabled={claimBusy}
        onclick={cancelObservedReceiveClaim}>Cancel</Button
      >
      <Button
        type="submit"
        disabled={!claimLabel.trim() || claimBusy}
        loading={claimBusy}
        loadingLabel="Saving label…">Save permanent label</Button
      >
    </div>
  </form>
</Modal>
