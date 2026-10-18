<script lang="ts">
  import { translate, localizedError } from '$lib/i18n-catalog';
  import {
    AlertTriangle,
    Check,
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
  import { walletService, WalletError } from '$lib/wallet';
  import { toast } from '$lib/stores/toasts';
  import { onMount } from 'svelte';
  import type { Transaction, Utxo } from '$lib/types';
  import { formatConfirmationCount, formatInteger, locale, t } from '$lib/i18n';
  import { sortCoins, type CoinSortOrder } from '$lib/wallet/presentation';
  import WalletSkeleton from '$lib/components/WalletSkeleton.svelte';
  import { fade, fly, slide } from 'svelte/transition';
  import LoadFailure from '$lib/components/LoadFailure.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import PermanentLabelEditor from '$lib/components/PermanentLabelEditor.svelte';
  import { permanentLabelsForSubmission } from '$lib/wallet/label-suggestions';
  import { useWalletShellContext } from '$lib/wallet/shell-context';
  import { discreetMode } from '$lib/privacy';
  import Modal from '$lib/components/Modal.svelte';
  import PermanentLabelTags from '$lib/components/PermanentLabelTags.svelte';
  import InsightTip from '$lib/components/InsightTip.svelte';
  import WarningNotice from '$lib/components/WarningNotice.svelte';
  import { goto } from '$app/navigation';

  const walletShell = useWalletShellContext();
  const MATURITY_MATURE = 'mature' as const;
  const MATURITY_APPROACHING = 'approaching' as const;
  const MATURITY_UNCONFIRMED = 'unconfirmed' as const;
  const maturityFixtureSuffix = (() => {
    if (typeof location === 'undefined') return '';
    const params = new URLSearchParams(location.search);
    if (params.has('fixture-policy-inheritance')) return '&fixture-policy-inheritance=1';
    return params.has('fixture-policy-maturity') ? '&fixture-policy-maturity=1' : '';
  })();
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
  let copiedValue = $state('');
  let busy = $state(false);
  let syncing = $state(false);
  let multisig = $state(false);
  let freezeIntent = $state<{ outpoints: string[]; frozen: boolean } | null>(null);
  let claimIntent = $state<string | null>(null);
  let claimLabel = $state('');
  let claimLabels = $state<string[]>([]);
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
      if (cause instanceof WalletError && cause.code === 'wallet_locked') {
        await goto('/unlock');
        return;
      }
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
      if (cause instanceof WalletError && cause.code === 'sync_cancelled') return;
      if (cause instanceof WalletError && cause.code === 'wallet_locked') {
        await goto('/unlock');
        return;
      }
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
      copiedValue = value;
      toast({
        title: translate($locale, '{label} copied', { label: translate($locale, label) }),
        tone: 'success'
      });
      setTimeout(() => {
        if (copiedValue === value) copiedValue = '';
      }, 1_500);
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
      await walletShell.pauseAutomaticSync();
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
      walletShell.resumeAutomaticSync();
    }
  }

  function beginObservedReceiveClaim(outpoint: string) {
    claimIntent = outpoint;
    claimLabel = '';
    claimLabels = [];
    claimError = '';
  }

  function cancelObservedReceiveClaim() {
    if (claimBusy) return;
    claimIntent = null;
    claimLabel = '';
    claimLabels = [];
    claimError = '';
  }

  async function claimObservedReceiveAddress() {
    if (!claimIntent || claimBusy) return;
    claimBusy = true;
    claimError = '';
    try {
      await walletService.claimObservedMultisigAddress(
        claimIntent,
        permanentLabelsForSubmission(claimLabels, claimLabel)
      );
      await load();
      claimIntent = null;
      claimLabel = '';
      claimLabels = [];
      toast({
        title: 'Label saved',
        description: 'The previously unlabeled received output now has known local provenance.',
        tone: 'success'
      });
    } catch (cause) {
      claimError = localizedError(cause, $locale, 'The label could not be saved.');
    } finally {
      claimBusy = false;
    }
  }
</script>

<div class="page">
  <header class="page-header">
    <div>
      <h1>{translate($locale, 'Coins')}</h1>
    </div>
    <div class="stat-pill">
      <span>{utxos.length} {translate($locale, 'coins')}</span><strong
        ><Amount
          value={utxos.reduce((a, u) => a + u.amount, 0)}
          hidden={$discreetMode}
          interactive
        /></strong
      >
    </div>
  </header>

  <section class="coin-toolbar" aria-live="polite">
    <div>
      {#key selected.length}<span class="coin-selection-count" in:fly={{ y: -4, duration: 140 }}
          ><strong>{selected.length} {translate($locale, 'selected')}</strong><span
            ><Amount value={selectedTotal} hidden={$discreetMode} interactive />
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
                {#if renewalCoin && chainTipCurrent && multisig}{#if renewalCoin.policyMaturity?.delayedSpendSupported}<a
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
                    >{/if}<a role="menuitem" href={renewalHref}
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
      {#if maturitySummary}<WarningNotice
          element="aside"
          class="coin-timeline-note"
          ariaLive="polite"
        >
          <AlertTriangle size={15} />
          <span>
            <strong>{translate($locale, 'Each coin has its own protection timeline.')}</strong>
            {translate(
              $locale,
              'Backup-key access becomes available separately for each coin. Your normal keys keep working.'
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
        </WarningNotice>{/if}
      {#each sortedUtxos as utxo (utxo.outpoint)}
        {@const reuse = reuseFor(utxo.outpoint)}
        {@const linkedCoins = linkedCoinsFor(utxo.outpoint)}
        {@const maturity = validPolicyMaturity(utxo)}
        <article
          id={`coin-${utxo.outpoint.replace(/[^a-zA-Z0-9_-]/g, '-')}`}
          class="coin-row"
          class:frozen={utxo.frozen}
          class:reused={Boolean(reuse)}
          class:selected={selected.includes(utxo.outpoint)}
        >
          <button
            type="button"
            class="coin-row-selection"
            aria-label={translate($locale, 'Select {coin}', { coin: coinName(utxo) })}
            aria-pressed={selected.includes(utxo.outpoint)}
            disabled={utxo.frozen || busy}
            onclick={() => toggle(utxo.outpoint, !selected.includes(utxo.outpoint))}
          ></button>
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
                            'Keep using your normal keys, use the backup key, or restart this coin’s wait.'
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
                        >{#if maturity.delayedSpendSupported}<Button
                            variant="secondary"
                            size="small"
                            href={`/multisig/send?coins=${encodeURIComponent(utxo.outpoint)}&delayedSpend=1${maturityFixtureSuffix}`}
                            >{translate(
                              $locale,
                              maturity.policyType === 'inheritance'
                                ? 'Use heir key'
                                : 'Use recovery key'
                            )}</Button
                          >{/if}
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
                  </span><ChevronDown class="coin-detail-chevron" size={14} />
                </summary>
                <dl>
                  <div>
                    <dt>
                      {translate($locale, 'Provenance')}
                      <InsightTip
                        label={translate($locale, 'About coin provenance')}
                        text={translate(
                          $locale,
                          'The labels inherited from this coin’s receive address or funding inputs.'
                        )}
                      />
                    </dt>
                    <dd class="provenance-labels">
                      {#if utxo.provenance.state === 'unknown'}
                        {translate(
                          $locale,
                          $discreetMode ? 'Hidden in discreet mode' : 'Source unknown'
                        )}
                      {:else}
                        <PermanentLabelTags
                          labels={utxo.provenance.labels.length
                            ? utxo.provenance.labels
                            : [utxo.label]}
                          hidden={$discreetMode}
                          prominent
                        />
                        {#if !$discreetMode && utxo.provenance.state === 'mixed'}<span
                            class="coin-status reused">{translate($locale, 'Mixed')}</span
                          >{/if}
                      {/if}
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
                            'The label of the payment that created this change. It can differ from the labels this coin inherited.'
                          )}
                        />
                      </dt>
                      <dd>
                        <PermanentLabelTags
                          labels={[utxo.provenance.sourceIntentLabel]}
                          prominent
                        />
                      </dd>
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
                  </span><ChevronDown class="coin-detail-chevron" size={14} />
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
                        >{#if copiedValue === utxo.address}<Check size={13} />{:else}<Copy
                            size={13}
                          />{/if}</button
                      >
                    </dd>
                  </div>
                  <div>
                    <dt>{translate($locale, 'Outpoint')}</dt>
                    <dd>
                      <code>{compactAddress(utxo.outpoint, 18, 10)}</code><button
                        aria-label={translate($locale, 'Copy outpoint')}
                        onclick={() => copy(utxo.outpoint, 'Outpoint', 'identifier')}
                        >{#if copiedValue === utxo.outpoint}<Check size={13} />{:else}<Copy
                            size={13}
                          />{/if}</button
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
                    <small>{translate($locale, 'Assign its first label once.')}</small>
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
  title={translate($locale, 'Add label')}
  description={translate(
    $locale,
    'This received address has no local label. Assign it once; the assignment cannot be changed.'
  )}
  onclose={cancelObservedReceiveClaim}
>
  <form
    class="modal-form"
    onsubmit={(event) => (event.preventDefault(), claimObservedReceiveAddress())}
  >
    <PermanentLabelEditor
      id="observed-receive-label"
      title={translate($locale, 'Labels')}
      placeholder={translate($locale, 'What was this payment for?')}
      suggestions={[]}
      bind:labels={claimLabels}
      bind:value={claimLabel}
    />
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
        disabled={!permanentLabelsForSubmission(claimLabels, claimLabel).length || claimBusy}
        loading={claimBusy}
        loadingLabel={translate($locale, 'Saving label…')}
        >{translate($locale, 'Save label')}</Button
      >
    </div>
  </form>
</Modal>

<style>
  /* Keep the original cascade weight while constraining these rules to this owner. */

  :global(.stat-pill):where(.stat-pill) {
    display: flex;
    flex-direction: column;
    text-align: right;
    gap: 5px;
  }
  :global(.stat-pill):where(.stat-pill) > :global(span) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.stat-pill):where(.stat-pill) > :global(strong) {
    font-size: 13px;
  }
  :global(.coin-list):where(.coin-list) {
    margin-top: 18px;
    border: 1px solid var(--border);
    border-radius: var(--radius-panel);
    overflow: hidden;
  }
  :global(.coin-list):where(.coin-list) :global(article) {
    position: relative;
    min-height: 89px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    display: grid;
    grid-template-columns: 38px 1fr auto;
    align-items: center;
    gap: 13px;
    padding: 13px 16px;
    transition:
      background-color 150ms ease,
      box-shadow 150ms ease;
  }
  :global(.coin-row-selection):where(.coin-row-selection) {
    position: absolute;
    z-index: 1;
    inset: 0;
    width: 100%;
    border: 0;
    background: transparent;
    cursor: pointer;
  }
  :global(.coin-row-selection:focus-visible):where(.coin-row-selection) {
    outline: 2px solid var(--focus);
    outline-offset: -3px;
  }
  :global(.coin-row-selection:disabled):where(.coin-row-selection) {
    cursor: default;
  }
  :global(.coin-check):where(.coin-check),
  :global(.coin-row-actions):where(.coin-row-actions),
  :global(.coin-details):where(.coin-details) {
    position: relative;
    z-index: 2;
  }
  :global(.coin-list.selectable):where(.coin-list) :global(article:not(.frozen)) {
    cursor: pointer;
  }
  :global(.coin-list.selectable):where(.coin-list) :global(article:not(.frozen):hover) {
    background: color-mix(in srgb, var(--fr-blue) 4%, var(--panel));
  }
  :global(.coin-list.selectable):where(.coin-list) :global(article.selected) {
    background: color-mix(in srgb, var(--fr-blue) 9%, var(--panel));
    box-shadow: inset 3px 0 0 var(--fr-blue);
  }
  :global(.coin-list):where(.coin-list) :global(article:last-child) {
    border: 0;
  }
  :global(.coin-icon):where(.coin-icon) {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-control);
    background: var(--accent-soft);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  :global(.coin-main):where(.coin-main),
  :global(.coin-meta):where(.coin-meta) {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  :global(.coin-main):where(.coin-main) :global(strong) {
    font-size: 15px;
  }
  :global(.coin-main):where(.coin-main) :global(span),
  :global(.coin-meta):where(.coin-meta) :global(span) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.coin-main):where(.coin-main) :global(code),
  :global(.coin-meta):where(.coin-meta) :global(small) {
    color: var(--muted-2);
    font-size: var(--font-size-meta);
  }
  :global(.coin-meta):where(.coin-meta) {
    text-align: right;
  }
  :global(.coin-meta):where(.coin-meta) :global(strong) {
    font-size: 14px;
  }
  :global(.coin-toolbar):where(.coin-toolbar) {
    min-height: 66px;
    margin-bottom: 14px;
    border: 1px solid var(--border);
    background: var(--panel);
    border-radius: var(--radius-control);
    padding: 12px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  :global(.coin-toolbar):where(.coin-toolbar) > :global(div) {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  :global(.coin-toolbar):where(.coin-toolbar) > :global(div:first-child) {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  :global(.coin-selection-count):where(.coin-selection-count) {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  :global(.coin-selection-actions):where(.coin-selection-actions) {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .coin-selection-menu {
    width: 260px;
  }
  :global(.coin-toolbar):where(.coin-toolbar) :global(strong) {
    font-size: 14px;
  }
  :global(.coin-toolbar):where(.coin-toolbar) :global(span) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.auto-note):where(.auto-note) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  :global(.coin-filters):where(.coin-filters) {
    margin: 0 0 14px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 180px;
    gap: 10px;
  }
  :global(.coin-filters):where(.coin-filters) :global(label) {
    display: grid;
    gap: 5px;
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.coin-filters):where(.coin-filters) :global(input),
  :global(.coin-filters):where(.coin-filters) :global(select) {
    width: 100%;
    height: 44px;
    min-height: 44px;
    box-sizing: border-box;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    padding: 0 12px;
    color: var(--text);
    background: var(--surface-control);
  }
  :global(.coin-list.selectable):where(.coin-list) :global(article) {
    grid-template-columns: 22px 38px minmax(0, 1fr) auto;
  }
  :global(.coin-list):where(.coin-list) :global(article.frozen) {
    opacity: 0.72;
  }
  :global(.coin-list):where(.coin-list) :global(article.reused) {
    box-shadow: inset 3px 0 0 color-mix(in srgb, var(--accent) 68%, transparent);
  }
  :global(.coin-list):where(.coin-list) :global(article.selected),
  :global(.coin-list):where(.coin-list) :global(article.selected.reused) {
    box-shadow: inset 3px 0 0 var(--fr-blue);
  }
  :global(.coin-check):where(.coin-check) {
    display: grid;
    place-items: center;
  }
  :global(.coin-check):where(.coin-check) :global(input) {
    position: absolute;
    opacity: 0;
  }
  :global(.coin-check):where(.coin-check) :global(span) {
    width: 16px;
    height: 16px;
    border: 1px solid var(--border-strong);
    border-radius: 4px;
    display: block;
  }
  :global(.coin-check):where(.coin-check) :global(input:checked + span) {
    background: var(--fr-blue);
    border-color: var(--fr-blue);
    box-shadow: inset 0 0 0 3px var(--panel);
  }
  :global(.coin-check):where(.coin-check) :global(input:disabled + span) {
    opacity: 0.35;
  }
  :global(.coin-title):where(.coin-title) {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
  }
  :global(.coin-title):where(.coin-title) > :global(strong) {
    flex: 0 0 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.coin-title):where(.coin-title) :global(.permanent-label-tags) {
    flex: 1 1 160px;
  }

  :global(.coin-details):where(.coin-details) :global(dl > .coin-policy-explanation) {
    grid-column: 1 / -1;
  }

  :global(.coin-policy-section):where(.coin-policy-section) {
    display: grid;
    gap: 12px;
  }
  :global(.coin-detail-heading):where(.coin-detail-heading) {
    display: grid;
    gap: 2px;
  }
  :global(.coin-detail-heading):where(.coin-detail-heading) :global(strong) {
    color: var(--text);
    font-size: var(--font-size-meta);
  }
  :global(.coin-detail-heading):where(.coin-detail-heading) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.coin-approximate-time):where(.coin-approximate-time) {
    color: var(--muted);
  }

  :global(.coin-policy-explanation):where(.coin-policy-explanation) :global(dd) {
    max-width: 62ch;
    line-height: 1.45;
  }
  :global(.coin-policy-renewal):where(.coin-policy-renewal) {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    gap: 9px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }
  :global(.coin-policy-renewal):where(.coin-policy-renewal) > :global(svg) {
    padding: 6px;
    box-sizing: content-box;
    border-radius: var(--radius-control);
    color: var(--link);
    background: var(--surface-icon);
  }
  :global(.coin-policy-renewal):where(.coin-policy-renewal) > :global(.coin-policy-copy) {
    min-width: 0;
    display: grid;
    gap: 1px;
  }
  :global(.coin-policy-renewal):where(.coin-policy-renewal) :global(strong) {
    font-size: var(--font-size-meta);
  }
  :global(.coin-policy-renewal):where(.coin-policy-renewal) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.4;
  }
  :global(.coin-policy-actions):where(.coin-policy-actions) {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  :global(.coin-policy-actions):where(.coin-policy-actions) :global(.button) {
    width: 100%;
    min-width: 0;
    white-space: normal;
    text-align: center;
  }
  :global(.coin-main):where(.coin-main) > :global(span) {
    color: var(--text-soft);
    font-size: var(--font-size-meta);
  }
  :global(.coin-main):where(.coin-main) :global(.coin-reuse) {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--warning-text);
    font-size: var(--font-size-meta);
  }
  :global(.coin-main):where(.coin-main) :global(.coin-reuse svg) {
    flex: 0 0 auto;
    color: var(--accent);
  }
  :global(.coin-meta):where(.coin-meta) :global(button) {
    border: 0;
    background: transparent;
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    font-size: var(--font-size-meta);
    padding: 3px 0;
    cursor: pointer;
  }
  :global(.coin-meta):where(.coin-meta) :global(.coin-details-toggle) {
    margin-top: 3px;
    color: var(--link);
  }
  :global(.coin-details-toggle):where(.coin-details-toggle) :global(svg) {
    transition: transform 0.15s ease;
  }
  :global(.coin-details-toggle):where(.coin-details-toggle) :global(svg.rotated) {
    transform: rotate(180deg);
  }
  :global(.coin-meta.coin-actions-meta):where(.coin-meta) {
    align-items: flex-end;
  }
  :global(.coin-row-actions):where(.coin-row-actions) {
    display: inline-flex;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-control);
  }
  :global(.coin-meta):where(.coin-meta) :global(.coin-row-actions > button) {
    min-height: 38px;
    margin: 0;
    padding: 0 10px;
    justify-content: center;
    color: var(--text-soft);
    font-size: var(--font-size-meta);
    font-weight: 600;
  }
  :global(.coin-meta):where(.coin-meta) :global(.coin-row-actions > button + button) {
    border-left: 1px solid var(--border);
  }
  :global(.coin-meta):where(.coin-meta) :global(.coin-row-actions > button:hover),
  :global(.coin-meta):where(.coin-meta) :global(.coin-row-actions > button:focus-visible) {
    color: var(--link);
    background: var(--surface-hover);
    outline: 0;
  }
  :global(.coin-meta):where(.coin-meta) :global(.coin-row-actions > button:focus-visible) {
    box-shadow: inset 0 0 0 2px var(--focus);
  }
  :global(.coin-meta):where(.coin-meta) :global(.coin-row-actions > button:disabled) {
    opacity: 0.45;
    cursor: not-allowed;
  }
  :global(.coin-details):where(.coin-details) {
    grid-column: 1 / -1;
    display: grid;
    gap: 14px;
    margin: 2px -4px -3px 58px;
    padding: 15px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-inset);
  }
  :global(.coin-details):where(.coin-details) :global(dl) {
    margin: 0;
    display: grid;
    gap: 11px;
  }
  :global(.coin-detail-group):where(.coin-detail-group) {
    border-top: 1px solid var(--border);
    padding-top: 11px;
  }
  :global(.coin-details):where(.coin-details) > :global(.coin-detail-group:first-of-type) {
    padding-top: 0;
    border-top: 0;
  }
  :global(.coin-detail-group):where(.coin-detail-group) :global(summary) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    cursor: pointer;
    color: var(--link);
    list-style: none;
  }
  :global(.coin-detail-group):where(.coin-detail-group) :global(summary::-webkit-details-marker) {
    display: none;
  }
  :global(.coin-detail-group):where(.coin-detail-group) :global(summary span) {
    display: grid;
    gap: 2px;
  }
  :global(.coin-detail-group):where(.coin-detail-group) :global(summary strong) {
    color: var(--text-soft);
    font-size: var(--font-size-meta);
  }
  :global(.coin-detail-group):where(.coin-detail-group) :global(summary small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  :global(.coin-detail-group):where(.coin-detail-group) :global(.coin-detail-chevron) {
    flex: 0 0 auto;
    color: var(--muted);
    transition:
      transform 0.15s ease,
      color 0.15s ease;
  }
  :global(.coin-detail-group):where(.coin-detail-group) :global(summary:hover .coin-detail-chevron),
  :global(.coin-detail-group):where(.coin-detail-group)
    :global(summary:focus-visible .coin-detail-chevron) {
    color: var(--link);
  }
  :global(.coin-detail-group[open]):where(.coin-detail-group) :global(.coin-detail-chevron) {
    transform: rotate(180deg);
  }
  :global(.coin-detail-group[open]):where(.coin-detail-group) :global(summary) {
    margin-bottom: 12px;
  }
  :global(.coin-detail-group):where(.coin-detail-group) :global(dl) {
    gap: 0;
  }
  :global(.coin-detail-group):where(.coin-detail-group) :global(dl > div) {
    grid-template-columns: minmax(132px, 28%) minmax(0, 1fr);
    min-height: 38px;
    padding: 8px 0;
    box-sizing: border-box;
    align-items: center;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  }
  :global(.coin-detail-group):where(.coin-detail-group) :global(dl > div:first-child) {
    padding-top: 0;
  }
  :global(.coin-detail-group):where(.coin-detail-group) :global(dl > div:last-child) {
    padding-bottom: 0;
    border-bottom: 0;
  }
  :global(.coin-detail-group):where(.coin-detail-group) :global(dl dt) {
    justify-content: flex-start;
    gap: 5px;
  }
  :global(.coin-details):where(.coin-details) :global(dl > div) {
    min-width: 0;
    display: grid;
    grid-template-columns: 128px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
  }
  :global(.coin-detail-group):where(.coin-detail-group) :global(dl > div) {
    column-gap: 24px;
  }
  :global(.coin-details):where(.coin-details) :global(dt) {
    display: flex;
    align-items: center;
    gap: 3px;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.45;
  }
  :global(.coin-details):where(.coin-details) :global(dd) {
    min-width: 0;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--text-soft);
    font-size: var(--font-size-meta);
    line-height: 1.45;
  }
  :global(.coin-details):where(.coin-details) :global(code) {
    overflow-wrap: anywhere;
  }
  :global(.coin-details):where(.coin-details) :global(dd button) {
    display: grid;
    place-items: center;
    border: 0;
    color: var(--muted);
    background: transparent;
    cursor: pointer;
  }
  :global(.coin-details):where(.coin-details) > :global(p) {
    margin: 0;
    padding-top: 9px;
    display: grid;
    grid-template-columns: 18px 1fr;
    gap: 8px;
    border-top: 1px solid var(--border);
    color: var(--accent);
  }
  :global(.coin-details):where(.coin-details) > :global(p span) {
    display: grid;
    gap: 3px;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.45;
  }
  :global(.coin-details):where(.coin-details) > :global(p strong) {
    color: var(--text-soft);
  }
  :global(.coin-reuse-details):where(.coin-reuse-details) {
    display: grid;
    gap: 9px;
    padding-top: 9px;
    border-top: 1px solid var(--border);
  }
  :global(.coin-reuse-explanation):where(.coin-reuse-explanation) {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 8px;
    color: var(--accent);
  }
  :global(.coin-reuse-explanation):where(.coin-reuse-explanation) > :global(span) {
    display: grid;
    gap: 3px;
    color: var(--muted);
    font-size: var(--font-size-meta);
    line-height: 1.45;
  }
  :global(.coin-reuse-explanation):where(.coin-reuse-explanation) :global(strong) {
    color: var(--text-soft);
  }
  :global(.coin-reuse-details):where(.coin-reuse-details) :global(ul) {
    list-style: none;
    margin: 0 0 0 26px;
    padding: 0;
    display: grid;
    gap: 5px;
  }
  :global(.coin-reuse-details):where(.coin-reuse-details) :global(li) {
    min-width: 0;
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr);
    gap: 7px;
    align-items: center;
    padding: 7px 9px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--surface-control);
    font-size: var(--font-size-meta);
  }
  :global(.coin-reuse-details):where(.coin-reuse-details) :global(li span) {
    color: var(--muted);
  }
  :global(.coin-reuse-details):where(.coin-reuse-details) :global(li strong) {
    color: var(--text-soft);
  }
  :global(.coin-reuse-details):where(.coin-reuse-details) :global(li code) {
    min-width: 0;
    overflow: hidden;
    color: var(--muted);
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: right;
  }

  :global(.observed-receive-prompt):where(.observed-receive-prompt) {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }

  :global(.observed-receive-prompt):where(.observed-receive-prompt) > :global(span) {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-control);
    color: var(--warning-text);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface-control));
  }

  :global(.observed-receive-prompt):where(.observed-receive-prompt) > :global(div) {
    min-width: 0;
    display: grid;
    gap: 1px;
  }

  :global(.observed-receive-prompt):where(.observed-receive-prompt) :global(strong) {
    font-size: var(--font-size-meta);
  }

  :global(.observed-receive-prompt):where(.observed-receive-prompt) :global(small) {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }

  :global(.coins-empty):where(.coins-empty) {
    min-height: 180px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 7px;
    color: var(--muted);
  }
  :global(.coins-empty):where(.coins-empty) :global(span) {
    font-size: var(--font-size-meta);
  }
  :global(.provenance-labels):where(.provenance-labels) {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    flex-wrap: wrap;
  }

  @media (max-width: 700px) {
    :global(.coin-policy-actions):where(.coin-policy-actions) {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 760px) {
    :global(.coin-details):where(.coin-details) {
      margin-left: 0;
    }
    :global(.coin-detail-group):where(.coin-detail-group) :global(dl > div) {
      grid-template-columns: minmax(0, 1fr);
      gap: 3px;
      align-items: start;
    }
    :global(.coin-detail-group):where(.coin-detail-group) :global(dt) {
      justify-content: flex-start;
    }
    :global(.coin-reuse-details):where(.coin-reuse-details) :global(ul) {
      margin-left: 0;
    }
    :global(.coin-reuse-details):where(.coin-reuse-details) :global(li) {
      grid-template-columns: 1fr auto;
    }
    :global(.coin-reuse-details):where(.coin-reuse-details) :global(li code) {
      grid-column: 1 / -1;
      text-align: left;
    }
    :global(.coin-list):where(.coin-list) :global(article),
    :global(.coin-list.selectable):where(.coin-list) :global(article) {
      grid-template-columns: 22px 34px 1fr;
    }
    :global(.coin-main):where(.coin-main) {
      grid-column: 3;
    }
    :global(.coin-meta):where(.coin-meta) {
      grid-column: 3;
      text-align: left;
      flex-direction: row;
      align-items: center;
    }
    :global(.coin-meta.coin-actions-meta):where(.coin-meta) {
      width: 100%;
      align-items: stretch;
    }
    :global(.coin-row-actions):where(.coin-row-actions) {
      width: min(100%, 250px);
    }
    :global(.coin-meta):where(.coin-meta) :global(.coin-row-actions > button) {
      min-height: 44px;
      flex: 1 1 0;
      padding-inline: 8px;
    }
    :global(.coin-meta):where(.coin-meta) :global(small) {
      display: none;
    }
    :global(.coin-toolbar):where(.coin-toolbar) {
      align-items: flex-start;
    }
    :global(.coin-toolbar):where(.coin-toolbar) > :global(div:last-child) {
      flex-wrap: wrap;
      justify-content: flex-end;
    }
  }
</style>
