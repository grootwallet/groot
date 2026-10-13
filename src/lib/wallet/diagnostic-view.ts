import type { DiagnosticRecord } from './contracts';

export type DiagnosticSortOrder = 'newest' | 'oldest';

export function filterAndSortDiagnosticRecords(
  records: readonly DiagnosticRecord[],
  query: string,
  eventKinds: readonly DiagnosticRecord['event'][],
  outcomes: readonly DiagnosticRecord['outcome'][],
  sortOrder: DiagnosticSortOrder,
  eventLabel: (event: DiagnosticRecord['event']) => string
): DiagnosticRecord[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const selectedKinds = new Set(eventKinds);
  const selectedOutcomes = new Set(outcomes);

  return records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => selectedKinds.size === 0 || selectedKinds.has(record.event))
    .filter(({ record }) => selectedOutcomes.size === 0 || selectedOutcomes.has(record.outcome))
    .filter(
      ({ record }) =>
        !normalizedQuery ||
        `${eventLabel(record.event)} ${JSON.stringify(record)}`
          .toLocaleLowerCase()
          .includes(normalizedQuery)
    )
    .sort((left, right) => {
      const timestampDifference = left.record.timestamp - right.record.timestamp;
      const appendOrderDifference = left.index - right.index;
      const difference = timestampDifference || appendOrderDifference;
      return sortOrder === 'oldest' ? difference : -difference;
    })
    .map(({ record }) => record);
}
