<script lang="ts">
  import {
    ArrowLeft,
    Check,
    ChevronDown,
    ChevronRight,
    Copy,
    Download,
    Filter,
    RefreshCw,
    Search
  } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import { copyText } from '$lib/clipboard';
  import LocalTimestamp from '$lib/components/LocalTimestamp.svelte';
  import { formatInteger, locale } from '$lib/i18n';
  import { localizedError, translate } from '$lib/i18n-catalog';
  import { walletService } from '$lib/wallet';
  import type { DiagnosticRecord } from '$lib/wallet/contracts';
  import {
    filterAndSortDiagnosticRecords,
    type DiagnosticSortOrder
  } from '$lib/wallet/diagnostic-view';
  import { toast } from '$lib/stores/toasts';
  import { onMount } from 'svelte';

  let records = $state<DiagnosticRecord[]>([]);
  let loading = $state(true);
  let error = $state('');
  let exporting = $state<'json' | 'csv' | null>(null);
  let query = $state('');
  let selectedEventKinds = $state<DiagnosticRecord['event'][]>([]);
  let selectedOutcomes = $state<DiagnosticRecord['outcome'][]>([]);
  let sortOrder = $state<DiagnosticSortOrder>('newest');
  let view = $state<'table' | 'raw'>('table');

  const eventLabels = {
    app_started: 'App started',
    wallet_created: 'Wallet created',
    wallet_recovered: 'Wallet recovered',
    wallet_removed: 'Wallet removed',
    wallet_unlocked: 'Wallet unlocked',
    wallet_locked: 'Wallet locked',
    sync: 'Wallet sync',
    recovery_scan: 'Recovery scan',
    transaction_prepared: 'Transaction prepared',
    transaction_signed: 'Transaction signed',
    transaction_broadcast: 'Transaction broadcast',
    receive_address_generated: 'Receive address generated',
    receive_address_discarded: 'Receive address discarded',
    receive_address_verified: 'Receive address verified',
    coin_frozen: 'Coin frozen',
    coin_unfrozen: 'Coin unfrozen',
    backup_exported: 'Backup exported',
    backup_imported: 'Backup imported',
    backup_verified: 'Backup verified',
    recovery_tested: 'Recovery tested',
    network_configuration_changed: 'Network configuration changed',
    diagnostics_exported: 'App logs exported'
  } as const satisfies Record<DiagnosticRecord['event'], string>;
  const supportedEventKinds = Object.keys(eventLabels) as DiagnosticRecord['event'][];
  const supportedOutcomes: DiagnosticRecord['outcome'][] = [
    'started',
    'progress',
    'succeeded',
    'failed',
    'cancelled'
  ];
  const eventLabel = (event: DiagnosticRecord['event']) => translate($locale, eventLabels[event]);
  const visibleRecords = $derived(
    filterAndSortDiagnosticRecords(
      records,
      query,
      selectedEventKinds,
      selectedOutcomes,
      sortOrder,
      eventLabel
    )
  );
  const rawJson = $derived(JSON.stringify(visibleRecords, null, 2));

  function toggleEventKind(event: DiagnosticRecord['event']) {
    selectedEventKinds = selectedEventKinds.includes(event)
      ? selectedEventKinds.filter((kind) => kind !== event)
      : [...selectedEventKinds, event];
  }

  function toggleOutcome(outcome: DiagnosticRecord['outcome']) {
    selectedOutcomes = selectedOutcomes.includes(outcome)
      ? selectedOutcomes.filter((candidate) => candidate !== outcome)
      : [...selectedOutcomes, outcome];
  }

  async function copyRawJson() {
    try {
      await copyText(rawJson, 'app-logs');
      toast({ title: translate($locale, 'App logs copied'), tone: 'success' });
    } catch (cause) {
      toast({
        title: translate($locale, 'Could not copy app logs'),
        description: localizedError(cause, $locale),
        tone: 'danger'
      });
    }
  }

  async function load() {
    loading = true;
    error = '';
    try {
      records = await walletService.diagnostics();
    } catch (cause) {
      error = localizedError(cause, $locale, 'Could not load diagnostics.');
    } finally {
      loading = false;
    }
  }

  async function exportLog(format: 'json' | 'csv') {
    exporting = format;
    try {
      const result = await walletService.exportDiagnostics(format);
      if (result.saved) {
        toast({
          title: translate($locale, 'App logs exported'),
          description: translate($locale, 'The sanitized app logs were saved.'),
          tone: 'success',
          action:
            result.revealToken && result.revealLabel
              ? {
                  label: result.revealLabel,
                  run: async () => {
                    try {
                      await walletService.revealSavedFile(result.revealToken!);
                    } catch (cause) {
                      toast({
                        title: translate($locale, 'Could not show saved file'),
                        description: localizedError(cause, $locale),
                        tone: 'danger'
                      });
                    }
                  }
                }
              : undefined
        });
        await load();
      }
    } catch (cause) {
      toast({
        title: translate($locale, 'Could not export app logs'),
        description: localizedError(cause, $locale),
        tone: 'danger'
      });
    } finally {
      exporting = null;
    }
  }

  onMount(load);
</script>

<div class="page diagnostics-page">
  <header class="page-header diagnostics-header">
    <div>
      <p class="eyebrow">{translate($locale, 'APP LOGS')}</p>
      <h1>{translate($locale, 'App logs')}</h1>
      <p class="subtitle">
        {translate(
          $locale,
          'Sanitized wallet-operation history for troubleshooting. It never includes secrets or full wallet identifiers.'
        )}
      </p>
    </div>
    <Button variant="secondary" onclick={() => history.back()}>
      <ArrowLeft size={16} />{translate($locale, 'Back')}
    </Button>
  </header>

  <section class="diagnostics-summary" aria-label={translate($locale, 'App log summary')}>
    <div>
      <strong>{translate($locale, '{count} events', { count: records.length })}</strong>
      <small
        >{translate(
          $locale,
          'Stored locally as append-only JSONL. New records stop at the 16 MiB safety limit.'
        )}</small
      >
    </div>
    <div class="diagnostics-actions">
      <Button
        variant="secondary"
        size="small"
        loading={exporting === 'csv'}
        onclick={() => exportLog('csv')}
      >
        <Download size={15} />{translate($locale, 'Export CSV')}
      </Button>
      <Button
        variant="secondary"
        size="small"
        loading={exporting === 'json'}
        onclick={() => exportLog('json')}
      >
        <Download size={15} />{translate($locale, 'Export JSON')}
      </Button>
    </div>
  </section>

  <details class="diagnostic-event-catalog">
    <summary id="recorded-event-types">
      <span>{translate($locale, 'Recorded event types')}</span><ChevronRight
        class="catalog-chevron"
        size={14}
      />
    </summary>
    <div class="diagnostic-event-catalog-content">
      <p>
        {translate(
          $locale,
          'Only these durable lifecycle and operation categories are recorded. Sensitive values and passive polling are excluded.'
        )}
      </p>
      <ul>
        {#each supportedEventKinds as event}
          <li>{eventLabel(event)}</li>
        {/each}
      </ul>
    </div>
  </details>

  {#if loading}
    <div class="diagnostics-state" role="status">{translate($locale, 'Loading diagnostics…')}</div>
  {:else if error}
    <div class="diagnostics-state form-error" role="alert">
      <span>{error}</span>
      <Button variant="secondary" size="small" onclick={load}
        ><RefreshCw size={15} />{translate($locale, 'Try again')}</Button
      >
    </div>
  {:else if records.length === 0}
    <div class="diagnostics-state">
      {translate($locale, 'No diagnostic events have been recorded yet.')}
    </div>
  {:else}
    <section class="log-browser" aria-label={translate($locale, 'Browse app logs')}>
      <div class="log-controls">
        <label class="log-search">
          <span>{translate($locale, 'Search logs')}</span>
          <span class="log-search-input"
            ><Search size={15} /><input
              type="search"
              bind:value={query}
              placeholder={translate($locale, 'Search events and safe context')}
            /></span
          >
        </label>
        <details class="event-filter">
          <summary>
            <Filter size={15} /><span
              >{selectedEventKinds.length
                ? translate($locale, '{count} event types', { count: selectedEventKinds.length })
                : translate($locale, 'All event types')}</span
            ><ChevronDown class="event-filter-chevron" size={14} />
          </summary>
          <div class="event-filter-menu">
            <div>
              <strong>{translate($locale, 'Filter by event type')}</strong>
              <span>
                {#if selectedEventKinds.length}<button
                    type="button"
                    onclick={() => (selectedEventKinds = [])}>{translate($locale, 'Clear')}</button
                  >{/if}
                <button
                  type="button"
                  onclick={(event) =>
                    event.currentTarget.closest('details')?.removeAttribute('open')}
                  >{translate($locale, 'Done')}</button
                >
              </span>
            </div>
            {#each supportedEventKinds as event}
              <label>
                <input
                  type="checkbox"
                  checked={selectedEventKinds.includes(event)}
                  onchange={() => toggleEventKind(event)}
                />
                <span>{eventLabel(event)}</span>
                {#if selectedEventKinds.includes(event)}<Check
                    class="filter-check"
                    size={14}
                  />{/if}
              </label>
            {/each}
          </div>
        </details>
        <details class="event-filter outcome-filter">
          <summary>
            <Filter size={15} /><span
              >{selectedOutcomes.length
                ? translate($locale, '{count} outcomes', { count: selectedOutcomes.length })
                : translate($locale, 'All outcomes')}</span
            ><ChevronDown class="event-filter-chevron" size={14} />
          </summary>
          <div class="event-filter-menu">
            <div>
              <strong>{translate($locale, 'Filter by outcome')}</strong>
              <span>
                {#if selectedOutcomes.length}<button
                    type="button"
                    onclick={() => (selectedOutcomes = [])}>{translate($locale, 'Clear')}</button
                  >{/if}
                <button
                  type="button"
                  onclick={(event) =>
                    event.currentTarget.closest('details')?.removeAttribute('open')}
                  >{translate($locale, 'Done')}</button
                >
              </span>
            </div>
            {#each supportedOutcomes as outcome}
              <label>
                <input
                  type="checkbox"
                  checked={selectedOutcomes.includes(outcome)}
                  onchange={() => toggleOutcome(outcome)}
                />
                <span>{translate($locale, outcome)}</span>
                {#if selectedOutcomes.includes(outcome)}<Check
                    class="filter-check"
                    size={14}
                  />{/if}
              </label>
            {/each}
          </div>
        </details>
        <label class="log-sort">
          <span>{translate($locale, 'Date order')}</span>
          <span class="log-sort-input">
            <select bind:value={sortOrder}>
              <option value="newest">{translate($locale, 'Newest first')}</option>
              <option value="oldest">{translate($locale, 'Oldest first')}</option>
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </span>
        </label>
        <div class="log-view" role="group" aria-label={translate($locale, 'Log view')}>
          <button type="button" class:active={view === 'table'} onclick={() => (view = 'table')}
            >{translate($locale, 'Table')}</button
          ><button type="button" class:active={view === 'raw'} onclick={() => (view = 'raw')}
            >{translate($locale, 'Raw JSON')}</button
          >
        </div>
      </div>
      <p class="log-results" aria-live="polite">
        {translate($locale, 'Showing {visible} of {total} events', {
          visible: visibleRecords.length,
          total: records.length
        })}
      </p>
    </section>

    {#if visibleRecords.length === 0}
      <div class="diagnostics-state filtered-empty">
        <span>{translate($locale, 'No app logs match these filters.')}</span>
        <Button
          variant="secondary"
          size="small"
          onclick={() => {
            query = '';
            selectedEventKinds = [];
            selectedOutcomes = [];
          }}>{translate($locale, 'Clear filters')}</Button
        >
      </div>
    {:else if view === 'raw'}
      <section class="raw-log" aria-labelledby="raw-log-heading">
        <div>
          <span
            ><strong id="raw-log-heading">{translate($locale, 'Raw JSON')}</strong><small
              >{translate(
                $locale,
                'The exact sanitized records shown by the current filters.'
              )}</small
            ></span
          ><Button variant="secondary" size="small" onclick={copyRawJson}
            ><Copy size={15} />{translate($locale, 'Copy JSON')}</Button
          >
        </div>
        <textarea
          aria-label={translate($locale, 'Raw app log JSON')}
          readonly
          spellcheck="false"
          value={rawJson}></textarea>
      </section>
    {:else}
      <div class="diagnostics-table-wrap">
        <table class="diagnostics-table">
          <thead>
            <tr>
              <th>{translate($locale, 'Time')}</th>
              <th>{translate($locale, 'Event')}</th>
              <th>{translate($locale, 'Outcome')}</th>
              <th>{translate($locale, 'Safe context')}</th>
            </tr>
          </thead>
          <tbody>
            {#each visibleRecords as record}
              <tr>
                <td><LocalTimestamp value={String(record.timestamp)} /></td>
                <td><strong>{eventLabel(record.event)}</strong></td>
                <td
                  ><span class="diagnostic-outcome" class:failed={record.outcome === 'failed'}
                    >{translate($locale, record.outcome)}</span
                  ></td
                >
                <td>
                  <div class="diagnostic-context">
                    <span
                      >{translate($locale, '{network} · {platform} · v{version} · {commit}', {
                        network: record.compiledNetwork,
                        platform: record.platform,
                        version: record.appVersion,
                        commit: record.buildCommit.slice(0, 8)
                      })}</span
                    >
                    {#if record.walletKind}<span>{translate($locale, record.walletKind)}</span>{/if}
                    <span
                      >{translate($locale, 'Trigger: {trigger}', {
                        trigger: translate($locale, record.trigger)
                      })}</span
                    >
                    {#if record.syncSource}<span>{record.syncSource}</span>{/if}
                    {#if record.progressPercent !== undefined}<span>{record.progressPercent}%</span
                      >{/if}
                    {#if record.itemCount !== undefined}<span
                        >{translate(
                          $locale,
                          record.event === 'receive_address_generated'
                            ? '{count} permanent labels assigned'
                            : '{count} items',
                          { count: record.itemCount }
                        )}</span
                      >{/if}
                    {#if record.exportFormat}<span
                        >{translate($locale, '{format} export', {
                          format: record.exportFormat.toUpperCase()
                        })}</span
                      >{/if}
                    {#if record.errorCode}<div class="diagnostic-error">
                        <strong>{translate($locale, 'Error details')}</strong>
                        <code>{record.errorCode}</code>
                        {#if record.errorMessage}<span>{record.errorMessage}</span>{/if}
                        {#if record.errorDetails}<dl>
                            {#if record.errorDetails.requestedBirthdayBlock !== undefined}<div>
                                <dt>{translate($locale, 'Requested birthday')}</dt>
                                <dd>
                                  {translate($locale, 'Block {height}', {
                                    height: formatInteger(
                                      record.errorDetails.requestedBirthdayBlock,
                                      $locale
                                    )
                                  })}
                                </dd>
                              </div>{/if}
                            {#if record.errorDetails.requiredBlock !== undefined}<div>
                                <dt>{translate($locale, 'Required anchor')}</dt>
                                <dd>
                                  {translate($locale, 'Block {height}', {
                                    height: formatInteger(
                                      record.errorDetails.requiredBlock,
                                      $locale
                                    )
                                  })}
                                </dd>
                              </div>{/if}
                            {#if record.errorDetails.earliestRetainedBlock !== undefined}<div>
                                <dt>{translate($locale, 'Retained full blocks from')}</dt>
                                <dd>
                                  {translate($locale, 'Block {height}', {
                                    height: formatInteger(
                                      record.errorDetails.earliestRetainedBlock,
                                      $locale
                                    )
                                  })}
                                </dd>
                              </div>{/if}
                            {#if record.errorDetails.minimumBirthdayBlock !== undefined}<div>
                                <dt>{translate($locale, 'Earliest usable birthday')}</dt>
                                <dd>
                                  {translate($locale, 'Block {height}', {
                                    height: formatInteger(
                                      record.errorDetails.minimumBirthdayBlock,
                                      $locale
                                    )
                                  })}
                                </dd>
                              </div>{/if}
                          </dl>{/if}
                      </div>{/if}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</div>

<style>
  .diagnostics-page {
    max-width: 980px;
  }
  .diagnostics-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
  }
  .diagnostics-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-panel);
    background: var(--panel);
  }
  .diagnostics-summary > div:first-child {
    display: grid;
    gap: 4px;
  }
  .diagnostics-summary small {
    color: var(--muted);
  }
  .diagnostics-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .diagnostic-event-catalog {
    margin-top: 16px;
    width: fit-content;
  }
  .diagnostic-event-catalog summary {
    display: flex;
    width: fit-content;
    align-items: center;
    gap: 5px;
    color: var(--link);
    font-size: 11px;
    font-weight: 650;
    cursor: pointer;
    list-style: none;
  }
  .diagnostic-event-catalog summary::-webkit-details-marker {
    display: none;
  }
  .diagnostic-event-catalog summary :global(.catalog-chevron) {
    transition: transform 150ms ease;
  }
  .diagnostic-event-catalog[open] summary :global(.catalog-chevron) {
    transform: rotate(90deg);
  }
  .diagnostic-event-catalog-content {
    width: min(980px, calc(100vw - 280px));
    margin-top: 10px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-panel);
    background: var(--panel);
  }
  .diagnostic-event-catalog p {
    margin: 0;
    color: var(--muted);
    font-size: 11px;
  }
  .diagnostic-event-catalog ul {
    margin: 14px 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px 16px;
    list-style: none;
    font-size: 11px;
  }
  .diagnostic-event-catalog li::before {
    content: '·';
    margin-right: 6px;
    color: var(--accent);
  }
  .diagnostics-state {
    margin-top: 16px;
    padding: 28px;
    border: 1px solid var(--border);
    border-radius: var(--radius-panel);
    background: var(--panel);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .filtered-empty {
    margin-top: 8px;
  }
  .log-browser {
    margin-top: 16px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-panel);
    background: var(--panel);
  }
  .log-controls {
    display: grid;
    grid-template-columns: minmax(190px, 1fr) auto auto auto auto;
    align-items: end;
    gap: 10px;
  }
  .log-search,
  .log-sort {
    min-width: 0;
    display: grid;
    gap: 6px;
    color: var(--muted);
    font-size: var(--font-size-meta);
    font-weight: 650;
  }
  .log-search-input {
    height: 38px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    border: 1px solid var(--control-border);
    border-radius: var(--radius-control);
    background: var(--surface-control);
    color: var(--muted);
  }
  .log-search-input:focus-within {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }
  .log-search-input input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    color: var(--text);
    background: transparent;
    font: inherit;
    font-size: 12px;
  }
  .log-sort select,
  .event-filter > summary,
  .log-view {
    min-height: 38px;
    border: 1px solid var(--control-border);
    border-radius: var(--radius-control);
    background: var(--surface-control);
  }
  .log-sort select {
    appearance: none;
    -webkit-appearance: none;
    height: 38px;
    width: 100%;
    min-width: 126px;
    padding: 0 28px 0 10px;
    color: var(--text);
    font: inherit;
    font-size: 12px;
    font-weight: 650;
  }
  .log-sort-input {
    position: relative;
    display: block;
  }
  .log-sort-input :global(svg) {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
  }
  .event-filter {
    position: relative;
  }
  .outcome-filter > summary {
    min-width: 126px;
  }
  .outcome-filter .event-filter-menu {
    width: 230px;
  }
  .event-filter > summary {
    min-width: 142px;
    padding: 0 10px;
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--text-soft);
    font-size: 11px;
    font-weight: 650;
    cursor: pointer;
    list-style: none;
  }
  .event-filter > summary::-webkit-details-marker {
    display: none;
  }
  .event-filter > summary span {
    flex: 1;
  }
  :global(.event-filter-chevron) {
    transition: transform 150ms ease;
  }
  .event-filter[open] :global(.event-filter-chevron) {
    transform: rotate(180deg);
  }
  .event-filter-menu {
    position: absolute;
    z-index: 40;
    top: calc(100% + 6px);
    right: 0;
    width: 285px;
    max-height: 330px;
    overflow-y: auto;
    padding: 6px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-inset);
    background: var(--panel-2);
    box-shadow: 0 18px 40px rgb(0 0 0 / 24%);
  }
  .event-filter-menu > div {
    position: sticky;
    z-index: 1;
    top: -6px;
    padding: 7px 8px 9px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: var(--panel-2);
    font-size: var(--font-size-meta);
  }
  .event-filter-menu > div span {
    display: flex;
    gap: 12px;
  }
  .event-filter-menu > div button {
    padding: 0;
    border: 0;
    color: var(--link);
    background: transparent;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }
  .event-filter-menu label {
    min-height: 34px;
    padding: 6px 8px;
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) 14px;
    align-items: center;
    gap: 8px;
    border-radius: var(--radius-control);
    color: var(--text-soft);
    font-size: 11px;
    cursor: pointer;
  }
  .event-filter-menu label:hover {
    background: var(--surface-hover);
  }
  .event-filter-menu input {
    accent-color: var(--fr-blue);
  }
  .event-filter-menu label > :global(.filter-check) {
    color: var(--link);
  }
  .log-view {
    padding: 3px;
    display: flex;
  }
  .log-view button {
    padding: 0 9px;
    border: 0;
    border-radius: 5px;
    color: var(--muted);
    background: transparent;
    font: inherit;
    font-size: 11px;
    font-weight: 650;
    cursor: pointer;
  }
  .log-view button.active {
    color: white;
    background: var(--fr-blue);
  }
  .log-results {
    margin: 10px 0 0;
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  .raw-log {
    margin-top: 8px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-inset);
    background: var(--panel);
  }
  .raw-log > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }
  .raw-log > div > span {
    display: grid;
    gap: 3px;
  }
  .raw-log strong {
    font-size: 12px;
  }
  .raw-log small {
    color: var(--muted);
    font-size: var(--font-size-meta);
  }
  .raw-log textarea {
    width: 100%;
    min-height: 390px;
    resize: vertical;
    padding: 12px;
    border: 1px solid var(--control-border);
    border-radius: var(--radius-control);
    color: var(--text-soft);
    background: var(--surface-inset);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: var(--font-size-meta);
    line-height: 1.55;
    white-space: pre;
  }
  .diagnostics-table-wrap {
    margin-top: 8px;
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-inset);
    background: var(--panel);
  }
  .diagnostics-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th,
  td {
    padding: 12px 14px;
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid var(--border);
  }
  th {
    color: var(--muted);
    font-size: var(--font-size-meta);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  tr:last-child td {
    border-bottom: 0;
  }
  .diagnostic-context {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    color: var(--muted);
  }
  .diagnostic-error {
    flex: 1 0 100%;
    display: grid;
    gap: 5px;
    margin-top: 3px;
    padding: 9px 10px;
    border: 1px solid color-mix(in srgb, var(--danger) 34%, var(--border));
    border-radius: var(--radius-control);
    color: var(--text-soft);
    background: color-mix(in srgb, var(--danger) 7%, var(--surface-control));
  }
  .diagnostic-error > strong {
    color: var(--danger);
    font-size: var(--font-size-meta);
  }
  .diagnostic-error > span {
    line-height: 1.45;
  }
  .diagnostic-error dl {
    margin: 2px 0 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px 14px;
  }
  .diagnostic-error dl div {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .diagnostic-error dt {
    color: var(--muted);
  }
  .diagnostic-error dd {
    margin: 0;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .diagnostic-outcome {
    text-transform: capitalize;
  }
  .diagnostic-outcome.failed {
    color: var(--danger);
  }
  code {
    font-size: 11px;
  }
  @media (max-width: 900px) {
    .log-controls {
      grid-template-columns: 1fr 1fr;
    }
    .log-search {
      grid-column: 1 / -1;
    }
    .log-view {
      grid-column: 1 / -1;
    }
    .log-view button {
      flex: 1;
      min-height: 30px;
    }
  }
  @media (max-width: 640px) {
    .diagnostics-page {
      padding-bottom: calc(24px + env(safe-area-inset-bottom));
    }
    .diagnostics-header,
    .diagnostics-summary {
      align-items: stretch;
      flex-direction: column;
    }
    .diagnostics-actions :global(.button) {
      flex: 1;
    }
    .diagnostics-table {
      min-width: 650px;
    }
    .diagnostic-event-catalog ul {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .diagnostic-event-catalog-content {
      width: calc(100vw - 36px);
    }
    .event-filter-menu {
      position: fixed;
      z-index: 90;
      top: auto;
      right: 18px;
      bottom: calc(76px + env(safe-area-inset-bottom));
      left: 18px;
      width: auto;
      max-height: calc(100dvh - 130px);
    }
    .log-sort select,
    .event-filter > summary {
      width: 100%;
    }
    .raw-log > div {
      align-items: stretch;
      flex-direction: column;
    }
    .diagnostic-error dl {
      grid-template-columns: 1fr;
    }
    .raw-log textarea {
      min-height: 340px;
    }
  }
</style>
