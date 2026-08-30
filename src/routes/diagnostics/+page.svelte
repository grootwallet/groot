<script lang="ts">
  import { ArrowLeft, Download, RefreshCw } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import LocalTimestamp from '$lib/components/LocalTimestamp.svelte';
  import { locale } from '$lib/i18n';
  import { localizedError, translate } from '$lib/i18n-catalog';
  import { walletService } from '$lib/wallet';
  import type { DiagnosticRecord } from '$lib/wallet/contracts';
  import { toast } from '$lib/stores/toasts';
  import { onMount } from 'svelte';

  let records = $state<DiagnosticRecord[]>([]);
  let loading = $state(true);
  let error = $state('');
  let exporting = $state<'json' | 'csv' | null>(null);

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
    diagnostics_exported: 'Diagnostics exported'
  } as const satisfies Record<DiagnosticRecord['event'], string>;
  const supportedEventKinds = Object.keys(eventLabels) as DiagnosticRecord['event'][];
  const eventLabel = (event: DiagnosticRecord['event']) => translate($locale, eventLabels[event]);

  async function load() {
    loading = true;
    error = '';
    try {
      records = (await walletService.diagnostics()).toReversed();
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
          title: translate($locale, 'Diagnostics exported'),
          description: translate($locale, 'The sanitized diagnostic log was saved.'),
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
        title: translate($locale, 'Could not export diagnostics'),
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
      <p class="eyebrow">{translate($locale, 'APP DIAGNOSTICS')}</p>
      <h1>{translate($locale, 'Diagnostic event log')}</h1>
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

  <section class="diagnostics-summary" aria-label={translate($locale, 'Diagnostic log summary')}>
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

  <section class="diagnostic-event-catalog" aria-labelledby="recorded-event-types">
    <div>
      <h2 id="recorded-event-types">{translate($locale, 'Recorded event types')}</h2>
      <p>
        {translate(
          $locale,
          'Only these durable lifecycle and operation categories are recorded. Sensitive values and passive polling are excluded.'
        )}
      </p>
    </div>
    <ul>
      {#each supportedEventKinds as event}
        <li>{eventLabel(event)}</li>
      {/each}
    </ul>
  </section>

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
          {#each records as record}
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
                    >{translate($locale, '{network} · {platform} · v{version}', {
                      network: record.compiledNetwork,
                      platform: record.platform,
                      version: record.appVersion
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
                  {#if record.errorCode}<code>{record.errorCode}</code>{/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
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
    border-radius: 12px;
    background: var(--panel);
  }
  .diagnostics-summary > div:first-child {
    display: grid;
    gap: 4px;
  }
  .diagnostics-summary small {
    color: var(--text-muted);
  }
  .diagnostics-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .diagnostic-event-catalog {
    margin-top: 16px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--panel);
  }
  .diagnostic-event-catalog h2 {
    margin: 0;
    font-size: 14px;
  }
  .diagnostic-event-catalog p {
    margin: 5px 0 0;
    color: var(--text-muted);
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
    border-radius: 12px;
    background: var(--panel);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .diagnostics-table-wrap {
    margin-top: 16px;
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 12px;
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
    color: var(--text-muted);
    font-size: 10px;
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
    color: var(--text-muted);
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
  }
</style>
