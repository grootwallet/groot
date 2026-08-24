<script lang="ts">
  import { translate, localizedError } from '$lib/i18n-catalog';
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
  import Amount from '$lib/components/Amount.svelte';
  import { addressReuseInsights, selectedCoinTotal } from '$lib/wallet/policy';
  import { walletService } from '$lib/wallet';
  import { toast } from '$lib/stores/toasts';
  import { onMount } from 'svelte';
  import type { Transaction, Utxo } from '$lib/types';
  import { formatConfirmationCount, locale, t } from '$lib/i18n';
  import { sortCoins, type CoinSortOrder } from '$lib/wallet/presentation';
  import WalletSkeleton from '$lib/components/WalletSkeleton.svelte';
  import { fade, fly, slide } from 'svelte/transition';
  import LoadFailure from '$lib/components/LoadFailure.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import FieldCounter from '$lib/components/FieldCounter.svelte';
  import { useWalletShellContext } from '$lib/wallet/shell-context';
  import { discreetMode } from '$lib/privacy';
  import Modal from '$lib/components/Modal.svelte';
  import PermanentLabelTags from '$lib/components/PermanentLabelTags.svelte';
  import InsightTip from '$lib/components/InsightTip.svelte';

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
      loadError = localizedError(cause, $locale, 'Coin data could not be read.');
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
      toast({
        title: translate($locale, '{label} copied', { label: translate($locale, label) }),
        tone: 'success'
      });
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
        description: localizedError(cause, $locale),
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
      claimError = localizedError(cause, $locale, 'The permanent label could not be saved.');
    } finally {
      claimBusy = false;
    }
  }
</script>

<div class="page">
  <header class="page-header">
    <div>
      <p class="eyebrow">{translate($locale, 'COINS')}</p>
      <h1>{translate($locale, 'Coins')}</h1>
      <p class="subtitle">{translate($locale, 'Choose exactly what a payment may spend.')}</p>
    </div>
    <div class="stat-pill">
      <span>{utxos.length} {translate($locale, 'coins')}</span><strong
        ><Amount value={utxos.reduce((a, u) => a + u.amount, 0)} hidden={$discreetMode} /></strong
      >
    </div>
  </header>

  <section class="coin-toolbar" aria-live="polite">
    <div>
      {#key selected.length}<span class="coin-selection-count" in:fly={{ y: -4, duration: 140 }}
          ><strong>{selected.length} {translate($locale, 'selected')}</strong><span
            ><Amount value={selectedTotal} hidden={$discreetMode} />
            {translate($locale, 'selected')}</span
          ></span
        >{/key}
    </div>
    <div class="coin-toolbar-actions">
      {#if selected.length}<span class="coin-selection-actions" in:fade={{ duration: 150 }}
          ><Button
            variant="secondary"
            size="small"
            disabled={busy}
            onclick={() => requestFrozenState(selected, true)}
            ><Snowflake size={15} />{translate($locale, 'Freeze selected')}</Button
          ><Button size="small" href={sendHref}>{translate($locale, 'Send selected coins')}</Button
          ></span
        >{:else}<span class="auto-note"
          ><CircleDot size={14} />{translate(
            $locale,
            'Automatic selection remains the default'
          )}</span
        >{/if}<CoinSortMenu value={sortOrder} onchange={(next) => (sortOrder = next)} />
    </div>
  </section>
  <section
    class="coin-filters"
    aria-label={translate($locale, 'Filter coins by label and provenance')}
  >
    <label
      ><span>{translate($locale, 'Label')}</span><input
        bind:value={labelFilter}
        placeholder={translate($locale, 'Filter labels')}
        disabled={$discreetMode}
      /></label
    ><label
      ><span>{translate($locale, 'Provenance')}</span><select bind:value={provenanceFilter}
        ><option value="all">{translate($locale, 'All sources')}</option><option value="known"
          >{translate($locale, 'Known')}</option
        ><option value="mixed">{translate($locale, 'Mixed')}</option><option value="unknown"
          >{translate($locale, 'Unknown')}</option
        ><option value="reused">{translate($locale, 'Address reused')}</option></select
      ></label
    >
  </section>

  {#if loading}
    <WalletSkeleton variant="coins" count={4} />
  {:else if loadError}
    <LoadFailure
      title={translate($locale, 'Coins are unavailable')}
      description={loadError}
      onretry={load}
    />
  {:else if sortedUtxos.length}
    <section class="coin-list selectable">
      {#each sortedUtxos as utxo (utxo.outpoint)}
        {@const reuse = reuseFor(utxo.outpoint)}
        {@const linkedCoins = linkedCoinsFor(utxo.outpoint)}
        <article class="coin-row" class:frozen={utxo.frozen} class:reused={Boolean(reuse)}>
          <label class="coin-check"
            ><input
              type="checkbox"
              aria-label={translate($locale, 'Select {coin}', { coin: coinName(utxo) })}
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
                  >{translate($locale, 'Frozen')}</span
                >{:else if utxo.provenance.state === 'mixed'}<span class="coin-status reused"
                  >{translate($locale, 'Mixed provenance')}</span
                >{:else if utxo.provenance.state === 'unknown'}<span class="coin-status pending"
                  >{translate($locale, 'Unknown source')}</span
                >{:else if reuse || utxo.provenance.addressReused}<span class="coin-status reused"
                  >{translate($locale, 'Address reused')}</span
                >{:else if !utxo.confirmations}<span class="coin-status pending"
                  >{translate($locale, 'Unconfirmed')}</span
                >{/if}
              <PermanentLabelTags labels={utxo.provenance.labels} hidden={$discreetMode} />
            </div>
            <span><Amount value={utxo.amount} hidden={$discreetMode} /></span>
          </div>
          <div class="coin-meta coin-actions-meta">
            <div class="coin-row-actions">
              {#if utxo.frozen}
                <button
                  class="coin-unfreeze-action"
                  aria-label={translate($locale, 'Unfreeze {coin}', { coin: coinName(utxo) })}
                  disabled={busy}
                  onclick={() => requestFrozenState([utxo.outpoint], false)}
                  ><Unlock size={14} />{translate($locale, 'Unfreeze')}</button
                >
              {:else}
                <button
                  class="coin-freeze-action"
                  aria-label={translate($locale, 'Freeze {coin}', { coin: coinName(utxo) })}
                  disabled={busy}
                  onclick={() => requestFrozenState([utxo.outpoint], true)}
                  ><Snowflake size={14} />{translate($locale, 'Freeze')}</button
                >
              {/if}
              <button
                class="coin-details-toggle"
                aria-expanded={expanded.includes(utxo.outpoint)}
                aria-label="{translate(
                  $locale,
                  expanded.includes(utxo.outpoint) ? 'Hide' : 'Show'
                )} details for {coinName(utxo)}"
                onclick={() => toggleDetails(utxo.outpoint)}
                >{translate($locale, 'Details')}
                <ChevronDown
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
                  <dt>{translate($locale, 'Status')}</dt>
                  <dd>
                    {translate(
                      $locale,
                      utxo.confirmations
                        ? formatConfirmationCount(utxo.confirmations, $locale)
                        : `${t('unconfirmed', $locale)} · ${t('awaitingConfirmation', $locale)}`
                    )}
                  </dd>
                </div>
                <div>
                  <dt>
                    {translate($locale, 'Provenance')}
                    <InsightTip
                      label={translate($locale, 'About coin provenance')}
                      text="The permanent labels inherited from this coin’s receive address or funding inputs."
                    />
                  </dt>
                  <dd>
                    {translate(
                      $locale,
                      $discreetMode
                        ? 'Hidden in discreet mode'
                        : utxo.provenance.state === 'unknown'
                          ? 'Source unknown'
                          : utxo.provenance.labels.map((label) => label.text).join(' + ') ||
                            utxo.label
                    )}{translate(
                      $locale,
                      !$discreetMode && utxo.provenance.state === 'mixed' ? ' · Mixed' : ''
                    )}
                  </dd>
                </div>
                <div>
                  <dt>
                    {translate($locale, 'Privacy clusters')}
                    <InsightTip
                      label={translate($locale, 'About privacy clusters')}
                      text="Groups already linked by transaction history. Spending across groups creates a new public link."
                    />
                  </dt>
                  <dd>
                    {translate(
                      $locale,
                      $discreetMode
                        ? 'Hidden in discreet mode'
                        : `${utxo.provenance.clusterCount || 'Unknown'}${utxo.provenance.addressReused ? ' · Address reused' : ''}`
                    )}
                  </dd>
                </div>
                {#if !$discreetMode && utxo.provenance.sourceTransactionId}<div>
                    <dt>{translate($locale, 'Source transaction')}</dt>
                    <dd>
                      <code>{compactAddress(utxo.provenance.sourceTransactionId, 18, 10)}</code>
                    </dd>
                  </div>{/if}{#if !$discreetMode && utxo.provenance.sourceIntentLabel}<div>
                    <dt>
                      {translate($locale, 'Source payment intent')}
                      <InsightTip
                        label={translate($locale, 'About source payment intent')}
                        text="The permanent label of the payment that created this change. It can differ from the labels this coin inherited."
                      />
                    </dt>
                    <dd>{utxo.provenance.sourceIntentLabel.text}</dd>
                  </div>{/if}{#if !$discreetMode && utxo.provenance.context === 'change'}<div>
                    <dt>
                      {translate($locale, 'Change lineage')}
                      <InsightTip
                        label={translate($locale, 'About change lineage')}
                        text="How many wallet inputs were combined to create this change coin."
                      />
                    </dt>
                    <dd>
                      {translate(
                        $locale,
                        (utxo.provenance.sourceOutpoints?.length ?? 0) === 1
                          ? '{count} wallet input'
                          : '{count} wallet inputs',
                        { count: utxo.provenance.sourceOutpoints?.length ?? 0 }
                      )}
                    </dd>
                  </div>{/if}
                <div>
                  <dt>{translate($locale, 'Address')}</dt>
                  <dd>
                    <code>{compactAddress(utxo.address)}</code><button
                      aria-label={translate($locale, 'Copy address')}
                      onclick={() => copy(utxo.address, 'Address', 'bitcoin-address')}
                      ><Copy size={13} /></button
                    >
                  </dd>
                </div>
                <div>
                  <dt>{translate($locale, 'Outpoint')}</dt>
                  <dd>
                    <code>{compactAddress(utxo.outpoint, 18, 10)}</code><button
                      aria-label={translate($locale, 'Copy outpoint')}
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
                        >{translate(
                          $locale,
                          linkedCoins.length === 1
                            ? 'This coin shares its address with 1 other coin.'
                            : `This coin shares its address with ${linkedCoins.length} other coins.`
                        )}</strong
                      >
                      {translate(
                        $locale,
                        'Spending them separately cannot undo their public link. Use a fresh labeled address\n                      for future payments.'
                      )}
                    </span>
                  </div>
                  <ul aria-label={translate($locale, 'Coins linked by address reuse')}>
                    {#each linkedCoins as linkedCoin (linkedCoin.outpoint)}
                      <li>
                        <span>{translate($locale, 'Linked coin')}</span>
                        <strong><Amount value={linkedCoin.amount} hidden={$discreetMode} /></strong>
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
                    <strong>{translate($locale, 'No local label')}</strong>
                    <small>{translate($locale, 'Assign its first permanent label once.')}</small>
                  </div>
                  <Button
                    variant="secondary"
                    size="small"
                    onclick={() => beginObservedReceiveClaim(utxo.outpoint)}
                    >{translate($locale, 'Add label')}</Button
                  >
                </div>
              {/if}
            </div>
          {/if}
        </article>
      {:else}
        <div class="coins-empty">
          <CircleDot size={22} /><strong>{translate($locale, 'No spendable outputs yet')}</strong
          ><span>{translate($locale, 'Received bitcoin will appear here after sync.')}</span>
        </div>
      {/each}
    </section>
  {:else}
    <EmptyState
      title={translate($locale, 'No coins yet')}
      description={translate(
        $locale,
        'Received bitcoin will appear here after this wallet has synchronized.'
      )}
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
  title={translate($locale, 'Add permanent label')}
  description={translate(
    $locale,
    'This received address has no local label. Assign its first label once; it cannot be changed or reused.'
  )}
  onclose={cancelObservedReceiveClaim}
>
  <form
    class="modal-form"
    onsubmit={(event) => (event.preventDefault(), claimObservedReceiveAddress())}
  >
    <label class="field">
      <span>{translate($locale, 'Permanent label')}</span>
      <input
        bind:value={claimLabel}
        maxlength="48"
        required
        disabled={claimBusy}
        placeholder={translate($locale, 'What was this payment for?')}
      />
      <FieldCounter value={claimLabel} max={48} />
    </label>
    {#if claimError}<p class="form-error" role="alert">{claimError}</p>{/if}
    <div class="modal-footer">
      <Button
        type="button"
        variant="secondary"
        disabled={claimBusy}
        onclick={cancelObservedReceiveClaim}>{translate($locale, 'Cancel')}</Button
      >
      <Button
        type="submit"
        disabled={!claimLabel.trim() || claimBusy}
        loading={claimBusy}
        loadingLabel={translate($locale, 'Saving label…')}
        >{translate($locale, 'Save permanent label')}</Button
      >
    </div>
  </form>
</Modal>
