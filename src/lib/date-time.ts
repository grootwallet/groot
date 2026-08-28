export type TimestampPresentation = {
  dateTime: string | null;
  display: string;
  detail: string;
};

export type SyncAge =
  { unit: 'never' | 'now'; value: 0 } | { unit: 'minute' | 'hour' | 'day'; value: number };

export function parseTimestamp(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const numeric = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 1_000_000_000_000 ? numeric * 1_000 : numeric)
    : new Date(trimmed);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function syncAge(value: string | null, currentTime = Date.now()): SyncAge {
  if (!value) return { unit: 'never', value: 0 };
  const timestamp = parseTimestamp(value);
  if (!timestamp) return { unit: 'never', value: 0 };
  const elapsedSeconds = Math.max(0, Math.floor((currentTime - timestamp.getTime()) / 1_000));
  if (elapsedSeconds < 60) return { unit: 'now', value: 0 };
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return { unit: 'minute', value: elapsedMinutes };
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return { unit: 'hour', value: elapsedHours };
  return { unit: 'day', value: Math.floor(elapsedHours / 24) };
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
  })
    .format(date)
    .replace(' at ', ', ');
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
