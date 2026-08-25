<script lang="ts">
  import { translate, localizedError } from '$lib/i18n-catalog';
  import {
    AlertTriangle,
    ChevronDown,
    CircleDot,
    Copy,
    Lock,
    RefreshCw,
    Snowflake,
    Tag,
    Unlock
  } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import CoinFreezeConfirmModal from '$lib/components/CoinFreezeConfirmModal.svelte';
  import CoinSortMenu from '$lib/components/CoinSortMenu.svelte';
  import OverflowMenuButton from '$lib/components/OverflowMenuButton.svelte';
  import { compactAddress } from '$lib/address-display';
  import { copyText } from '$lib/clipboard';
  import { shortSats } from '$lib/data';
  import Amount from '$lib/components/Amount.svelte';
  import {
    addressReuseInsights,
    approximateBlockDuration,
    policyMaturitySummary,
    selectedCoinTotal,
    validPolicyMaturity
  } from '$lib/wallet/policy';
  import { walletService } from '$lib/wallet';
  import { toast } from '$lib/stores/toasts';
  import { onMount } from 'svelte';
  import type { Transaction, Utxo } from '$lib/types';
  import { formatConfirmationCount, formatInteger, locale, t } from '$lib/i18n';
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
  const MATURITY_MATURE = 'mature' as const;
  const MATURITY_APPROACHING = 'approaching' as const;
  const MATURITY_UNCONFIRMED = 'unconfirmed' as const;
  const maturityFixtureSuffix =
    typeof location !== 'undefined' &&
    new URLSearchParams(location.search).has('fixture-policy-maturity')
      ? '&fixture-policy-maturity=1'
      : '';
  let utxos = $state<Utxo[]>([]);
  let transactions = $state<Transaction[]>([]);
  let sortOrder = $state<CoinSortOrder>('newest');
  let provenanceFilter = $state<'all' | 'known' | 'mixed' | 'unknown' | 'reused'>('all');
  let labelFilter = $state('');
  let selected = $state<string[]>([]);
  let selectionMenuOpen = $state(false);
  let selectionMenuRoot = $state<HTMLDivElement | null>(null);
  let selectionMenuTrigger = $state<HTMLButtonElement | null>(null);
  let expanded = $state<string[]>([]);
  let busy = $state(false);
  let syncing = $state(false);
  let multisig = $state(false);
  let freezeIntent = $state<{ outpoints: string[]; frozen: boolean } | null>(null);
  let claimIntent = $state<string | null>(null);
  let claimLabel = $state('');
  let claimError = $state('');
  let claimBusy = $state(false);
  let loading = $state(true);
  let loadError = $state('');
  let chainTip = $state<import('$lib/wallet').WalletSnapshot['chainTip']>({
    height: 0,
    observedAt: null,
    status: 'unknown'
  });
  const selectedTotal = $derived(selectedCoinTotal(utxos, selected));
  const chainTipCurrent = $derived(chainTip.status === 'recent');
  const maturitySummary = $derived(policyMaturitySummary(utxos, chainTip));
  const renewalCoin = $derived(
    selected.length === 1
      ? (utxos.find((coin) => {
          const maturity = validPolicyMaturity(coin);
          return (
            coin.outpoint === selected[0] && !coin.frozen && maturity?.state === MATURITY_MATURE
          );
        }) ?? null)
      : null
  );
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
  const maturityIs = (
    maturity: NonNullable<Utxo['policyMaturity']>,
    state: NonNullable<Utxo['policyMaturity']>['state']
  ) => maturity.state === state;
  const freezeIntentCoins = $derived(
    freezeIntent ? utxos.filter((coin) => freezeIntent?.outpoints.includes(coin.outpoint)) : []
  );
  const sendHref = $derived(
    `${multisig ? '/multisig/send' : '/send'}?coins=${encodeURIComponent(selected.join(','))}`
  );
  const renewalHref = $derived(
    renewalCoin
      ? `/multisig/send?coins=${encodeURIComponent(renewalCoin.outpoint)}&renewProtection=1${maturityFixtureSuffix}`
      : ''
  );
  const delayedSpendHref = $derived(
    renewalCoin
      ? `/multisig/send?coins=${encodeURIComponent(renewalCoin.outpoint)}&delayedSpend=1${maturityFixtureSuffix}`
      : ''
  );
  const extraKeyName = (maturity: NonNullable<Utxo['policyMaturity']>) =>
    maturity.policyType === 'inheritance' ? 'Heir key' : 'Recovery key';

  $effect(() => {
    if ($discreetMode) labelFilter = '';
  });
  $effect(() => {
    if (!selected.length) selectionMenuOpen = false;
  });

  onMount(load);
  onMount(() =>
    walletService.subscribe((event) => {
      if (event.type === 'wallet_updated' && event.walletId === walletShell.selectedWalletId()) {
        multisig = event.walletKind === 'multisig';
        utxos = event.snapshot.utxos;
        transactions = event.snapshot.transactions;
        chainTip = event.snapshot.chainTip;
        selected = selected.filter((outpoint) =>
          utxos.some((coin) => coin.outpoint === outpoint && !coin.frozen)
        );
        loadError = '';
        loading = false;
      }
    })
  );
  onMount(() => {
    const closeOutside = (event: PointerEvent) => {
      if (
        selectionMenuOpen &&
        selectionMenuRoot &&
        event.target instanceof Node &&
        !selectionMenuRoot.contains(event.target)
      )
        selectionMenuOpen = false;
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !selectionMenuOpen) return;
      selectionMenuOpen = false;
      requestAnimationFrame(() => selectionMenuTrigger?.focus());
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  });

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
      chainTip = snapshot.chainTip;
      const requestedCoin = new URLSearchParams(location.search).get('coin');
      if (requestedCoin && utxos.some((coin) => coin.outpoint === requestedCoin)) {
        expanded = [requestedCoin];
        requestAnimationFrame(() =>
          document
            .getElementById(`coin-${requestedCoin.replace(/[^a-zA-Z0-9_-]/g, '-')}`)
            ?.scrollIntoView({ block: 'center' })
        );
      }
    } catch (cause) {
      loadError = localizedError(cause, $locale, 'Coin data could not be read.');
      toast({ title: 'Could not load coins', description: loadError, tone: 'danger' });
    } finally {
      loading = false;
    }
  }

  async function syncNow() {
    if (syncing) return;
    syncing = true;
    try {
      const snapshot = multisig ? await walletService.syncMultisig() : await walletService.sync();
      utxos = snapshot.utxos;
      transactions = snapshot.transactions;
      chainTip = snapshot.chainTip;
      toast({
        title: 'Coins are up to date',
        description: 'Protection timelines were refreshed.',
        tone: 'success'
      });
    } catch (cause) {
      toast({ title: 'Sync failed', description: localizedError(cause, $locale), tone: 'danger' });
    } finally {
      syncing = false;
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
      {#if selected.length}<div class="coin-selection-actions" in:fade={{ duration: 150 }}>
          <div class="wallet-more" bind:this={selectionMenuRoot}>
            <OverflowMenuButton
              bind:element={selectionMenuTrigger}
              label={translate(
                $locale,
                selected.length === 1
                  ? 'More actions for selected coin'
                  : 'More actions for selected coins'
              )}
              expanded={selectionMenuOpen}
              onclick={() => (selectionMenuOpen = !selectionMenuOpen)}
            />{#if selectionMenuOpen}<div class="wallet-more-menu coin-selection-menu" role="menu">
                {#if renewalCoin && chainTipCurrent && multisig}<a
                    role="menuitem"
                    href={delayedSpendHref}
                    ><Unlock size={15} /><span
                      ><strong
                        >{translate(
                          $locale,
                          renewalCoin.policyMaturity?.policyType === 'inheritance'
                            ? 'Use heir key'
                            : 'Use recovery key'
                        )}</strong
                      ><small>{translate($locale, 'Spend this coin with its backup key')}</small
                      ></span
                    ></a
                  ><a role="menuitem" href={renewalHref}
                    ><RefreshCw size={15} /><span
                      ><strong
                        >{translate(
                          $locale,
                          renewalCoin.policyMaturity?.policyType === 'inheritance'
                            ? 'Postpone heir access'
                            : 'Restart recovery wait'
                        )}</strong
                      ><small
                        >{translate(
                          $locale,
                          'Move it within this wallet to begin a new wait'
                        )}</small
                      ></span
                    ></a
                  >{/if}<button
                  role="menuitem"
                  disabled={busy}
                  onclick={() => {
                    selectionMenuOpen = false;
                    requestFrozenState(selected, true);
                  }}
                  ><Snowflake size={15} /><span
                    ><strong>{translate($locale, 'Freeze selected')}</strong><small
                      >{translate($locale, 'Keep this selection out of automatic payments')}</small
                    ></span
                  ></button
                >
              </div>{/if}
          </div>
          <Button size="small" href={sendHref}
            >{translate(
              $locale,
              selected.length === 1 ? 'Send selected coin' : 'Send selected coins'
            )}</Button
          >
        </div>{:else}<span class="auto-note"
          ><CircleDot size={14} />{translate(
            $locale,
            'Automatic selection remains the default'
          )}</span
        ><CoinSortMenu value={sortOrder} onchange={(next) => (sortOrder = next)} />{/if}
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
      {#if maturitySummary}<aside class="warning-box coin-timeline-note" aria-live="polite">
          <AlertTriangle size={15} />
          <span>
            <strong>{translate($locale, 'Each coin has its own protection timeline.')}</strong>
            {translate(
              $locale,
              'Recovery access becomes available separately for each coin. Your normal keys keep working.'
            )}
            {#if !maturitySummary.chainCurrent}<small class="stale-copy"
                >{translate(
                  $locale,
                  'Exact countdowns are paused because the last verified chain tip is stale or unavailable.'
                )}</small
              ><Button
                variant="secondary"
                size="small"
                loading={syncing}
                loadingLabel={translate($locale, 'Syncing…')}
                onclick={syncNow}><RefreshCw size={14} />{translate($locale, 'Sync now')}</Button
              >{/if}
          </span>
        </aside>{/if}
      {#each sortedUtxos as utxo (utxo.outpoint)}
        {@const reuse = reuseFor(utxo.outpoint)}
        {@const linkedCoins = linkedCoinsFor(utxo.outpoint)}
        {@const maturity = validPolicyMaturity(utxo)}
        <article
          id={`coin-${utxo.outpoint.replace(/[^a-zA-Z0-9_-]/g, '-')}`}
          class="coin-row"
          class:frozen={utxo.frozen}
          class:reused={Boolean(reuse)}
        >
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
                >{:else if maturity && maturityIs(maturity, MATURITY_MATURE)}<span
                  class="coin-status policy-mature"
                  >{translate($locale, '{key} can spend', {
                    key: translate($locale, extraKeyName(maturity))
                  })}</span
                >{:else if maturity && maturityIs(maturity, MATURITY_APPROACHING)}<span
                  class="coin-status policy-approaching"
                  >{chainTipCurrent && maturity.remainingBlocks !== null
                    ? translate($locale, '{key} available in {count} blocks', {
                        key: translate($locale, extraKeyName(maturity)),
                        count: formatInteger(maturity.remainingBlocks, $locale)
                      })
                    : translate($locale, '{key} available soon', {
                        key: translate($locale, extraKeyName(maturity))
                      })}</span
                >{:else if maturity && maturityIs(maturity, MATURITY_UNCONFIRMED)}<span
                  class="coin-status pending"
                  >{translate($locale, 'Wait starts after confirmation')}</span
                >{:else if maturity}<span class="coin-status policy-immature"
                  >{translate($locale, 'Backup key protected')}</span
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
                aria-label={translate(
                  $locale,
                  expanded.includes(utxo.outpoint)
                    ? 'Hide details for {coin}'
                    : 'Show details for {coin}',
                  { coin: coinName(utxo) }
                )}
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
              {#if maturity}<section class="coin-policy-section">
                  <div class="coin-detail-heading">
                    <strong>{translate($locale, 'Spending access')}</strong>
                    <small>{translate($locale, 'Who can spend this coin now')}</small>
                  </div>
                  <dl>
                    <div>
                      <dt>{translate($locale, extraKeyName(maturity))}</dt>
                      <dd>
                        {maturityIs(maturity, MATURITY_UNCONFIRMED)
                          ? translate($locale, 'Waiting for confirmation')
                          : maturityIs(maturity, MATURITY_MATURE)
                            ? translate($locale, 'Can spend this coin alone')
                            : maturityIs(maturity, MATURITY_APPROACHING)
                              ? translate($locale, 'Available soon')
                              : translate($locale, 'Not available yet')}
                      </dd>
                    </div>
                    <div>
                      <dt>{translate($locale, 'Timeline')}</dt>
                      <dd>
                        {!chainTipCurrent
                          ? translate($locale, 'Paused · last verified at block {height}', {
                              height: formatInteger(chainTip.height, $locale)
                            })
                          : maturityIs(maturity, MATURITY_UNCONFIRMED)
                            ? translate($locale, 'Starts after the first confirmation')
                            : maturity.remainingBlocks === 0
                              ? translate($locale, 'Available since block {height}', {
                                  height: formatInteger(
                                    maturity.maturityHeight ?? chainTip.height,
                                    $locale
                                  )
                                })
                              : translate($locale, '{count} blocks remaining', {
                                  count: formatInteger(maturity.remainingBlocks ?? 0, $locale)
                                })}
                        {#if chainTipCurrent && maturity.approximateSecondsRemaining !== null && maturity.approximateSecondsRemaining > 0}{@const approximate =
                            approximateBlockDuration(
                              maturity.approximateSecondsRemaining
                            )}{#if approximate}<span class="coin-approximate-time"
                              >≈ {formatInteger(approximate.value, $locale)}
                              {translate($locale, approximate.unit)}</span
                            >{/if}{/if}
                      </dd>
                    </div>
                    <div class="coin-policy-explanation">
                      <dt>{translate($locale, 'What this means')}</dt>
                      <dd>
                        {maturityIs(maturity, MATURITY_MATURE)
                          ? translate(
                              $locale,
                              '{key} can now spend this coin alone. Your normal 2-of-3 keys still work.',
                              { key: translate($locale, extraKeyName(maturity)) }
                            )
                          : translate(
                              $locale,
                              '{key} cannot spend this coin yet. Your normal 2-of-3 keys work now and remain available later.',
                              { key: translate($locale, extraKeyName(maturity)) }
                            )}
                      </dd>
                    </div>
                  </dl>
                  {#if multisig && chainTipCurrent && maturityIs(maturity, MATURITY_MATURE)}<div
                      class="coin-policy-renewal"
                    >
                      <RefreshCw size={15} />
                      <div class="coin-policy-copy">
                        <strong>{translate($locale, 'No action is required')}</strong>
                        <small
                          >{translate(
                            $locale,
                            'Keep using your normal keys, use the recovery key, or restart this coin’s wait.'
                          )}</small
                        >
                      </div>
                      <div class="coin-policy-actions">
                        <Button
                          variant="secondary"
                          size="small"
                          href={`/multisig/send?coins=${encodeURIComponent(utxo.outpoint)}&renewProtection=1${maturityFixtureSuffix}`}
                          >{translate(
                            $locale,
                            maturity.policyType === 'inheritance'
                              ? 'Postpone heir access'
                              : 'Restart recovery wait'
                          )}</Button
                        ><Button
                          variant="secondary"
                          size="small"
                          href={`/multisig/send?coins=${encodeURIComponent(utxo.outpoint)}&delayedSpend=1${maturityFixtureSuffix}`}
                          >{translate(
                            $locale,
                            maturity.policyType === 'inheritance'
                              ? 'Use heir key'
                              : 'Use recovery key'
                          )}</Button
                        >
                      </div>
                    </div>{/if}
                </section>{/if}
              <details class="coin-detail-group">
                <summary>
                  <span>
                    <strong>{translate($locale, 'Privacy & history')}</strong>
                    <small
                      >{translate(
                        $locale,
                        utxo.provenance.addressReused
                          ? 'Address reused · review before spending'
                          : 'Labels and existing public links'
                      )}</small
                    >
                  </span>
                </summary>
                <dl>
                  <div>
                    <dt>
                      {translate($locale, 'Provenance')}
                      <InsightTip
                        label={translate($locale, 'About coin provenance')}
                        text={translate(
                          $locale,
                          'The permanent labels inherited from this coin’s receive address or funding inputs.'
                        )}
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
                        text={translate(
                          $locale,
                          'Groups already linked by transaction history. Spending across groups creates a new public link.'
                        )}
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
                  {#if !$discreetMode && utxo.provenance.sourceIntentLabel}<div>
                      <dt>
                        {translate($locale, 'Source payment intent')}
                        <InsightTip
                          label={translate($locale, 'About source payment intent')}
                          text={translate(
                            $locale,
                            'The permanent label of the payment that created this change. It can differ from the labels this coin inherited.'
                          )}
                        />
                      </dt>
                      <dd>{utxo.provenance.sourceIntentLabel.text}</dd>
                    </div>{/if}{#if !$discreetMode && utxo.provenance.context === 'change'}<div>
                      <dt>
                        {translate($locale, 'Change lineage')}
                        <InsightTip
                          label={translate($locale, 'About change lineage')}
                          text={translate(
                            $locale,
                            'How many wallet inputs were combined to create this change coin.'
                          )}
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
                </dl>
                {#if reuse}<div class="coin-reuse-details">
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
                          <strong
                            ><Amount value={linkedCoin.amount} hidden={$discreetMode} /></strong
                          >
                          <code>{compactAddress(linkedCoin.outpoint, 12, 8)}</code>
                        </li>
                      {/each}
                    </ul>
                  </div>{/if}
              </details>
              <details class="coin-detail-group">
                <summary>
                  <span>
                    <strong>{translate($locale, 'Technical details')}</strong>
                    <small>{translate($locale, 'Confirmations, address and outpoint')}</small>
                  </span>
                </summary>
                <dl>
                  <div>
                    <dt>{translate($locale, 'Confirmations')}</dt>
                    <dd>
                      {translate(
                        $locale,
                        utxo.confirmations
                          ? formatConfirmationCount(utxo.confirmations, $locale)
                          : `${t('unconfirmed', $locale)} · ${t('awaitingConfirmation', $locale)}`
                      )}
                    </dd>
                  </div>
                  {#if !$discreetMode && utxo.provenance.sourceTransactionId}<div>
                      <dt>{translate($locale, 'Source transaction')}</dt>
                      <dd>
                        <code>{compactAddress(utxo.provenance.sourceTransactionId, 18, 10)}</code>
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
              </details>
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
