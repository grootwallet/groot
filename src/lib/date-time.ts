export type TimestampPresentation = {
  dateTime: string | null;
  display: string;
  detail: string;
};

export function parseTimestamp(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const numeric = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 1_000_000_000_000 ? numeric * 1_000 : numeric)
    : new Date(trimmed);

  return Number.isNaN(date.getTime()) ? null : date;
}

function readableDate(date: Date, timeZone: string, includeSeconds = true) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' as const } : {}),
    hour12: true,
    timeZone
  }).format(date).replace(' at ', ', ');
}

export function presentLocalTimestamp(
  value: string,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
): TimestampPresentation {
  const date = parseTimestamp(value);
  if (!date) {
    return {
      dateTime: null,
      display: value,
      detail: 'This timestamp was supplied without timezone information.'
    };
  }

  return {
    dateTime: date.toISOString(),
    display: readableDate(date, timeZone, false),
    detail: `Local time: ${readableDate(date, timeZone)} (${timeZone}). UTC: ${readableDate(date, 'UTC')} UTC.`
  };
}
