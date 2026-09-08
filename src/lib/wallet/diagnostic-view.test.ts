import { describe, expect, it } from 'vitest';
import type { DiagnosticRecord } from './contracts';
import { filterAndSortDiagnosticRecords } from './diagnostic-view';

const record = (
  event: DiagnosticRecord['event'],
  timestamp: number,
  context: Partial<DiagnosticRecord> = {}
): DiagnosticRecord => ({
  schemaVersion: 1,
  timestamp,
  event,
  outcome: 'succeeded',
  trigger: 'manual',
  appVersion: '0.4.92',
  buildCommit: 'deadbeef',
  compiledNetwork: 'mainnet',
  platform: 'macos',
  ...context
});

const label = (event: DiagnosticRecord['event']) =>
  event === 'sync' ? 'Wallet sync' : 'Receive address generated';

describe('diagnostic log presentation', () => {
  const records = [
    record('sync', 20, { syncSource: 'bitcoin_core', errorCode: 'sync_cancelled' }),
    record('receive_address_generated', 10, { itemCount: 2 }),
    record('sync', 20, { outcome: 'progress', progressPercent: 50 })
  ];

  it('searches event labels and every safe fixed-field context value', () => {
    expect(
      filterAndSortDiagnosticRecords(records, 'address generated', [], [], 'newest', label)
    ).toEqual([records[1]]);
    expect(
      filterAndSortDiagnosticRecords(records, 'bitcoin_core', [], [], 'newest', label)
    ).toEqual([records[0]]);
    expect(
      filterAndSortDiagnosticRecords(records, 'sync_cancelled', [], [], 'newest', label)
    ).toEqual([records[0]]);
  });

  it('combines multiple event selections and preserves append order for equal dates', () => {
    expect(
      filterAndSortDiagnosticRecords(
        records,
        '',
        ['sync', 'receive_address_generated'],
        [],
        'newest',
        label
      )
    ).toEqual([records[2], records[0], records[1]]);
  });

  it('sorts the same filtered records oldest first', () => {
    expect(filterAndSortDiagnosticRecords(records, '', ['sync'], [], 'oldest', label)).toEqual([
      records[0],
      records[2]
    ]);
  });

  it('combines multiple outcome selections with event and text filters', () => {
    const failed = record('sync', 30, {
      outcome: 'failed',
      errorMessage: 'Bitcoin Core has pruned a required block.'
    });
    const cancelled = record('sync', 25, { outcome: 'cancelled' });
    const candidates = [...records, failed, cancelled];

    expect(
      filterAndSortDiagnosticRecords(candidates, '', [], ['failed', 'cancelled'], 'newest', label)
    ).toEqual([failed, cancelled]);
    expect(
      filterAndSortDiagnosticRecords(candidates, 'pruned', ['sync'], ['failed'], 'newest', label)
    ).toEqual([failed]);
  });
});
