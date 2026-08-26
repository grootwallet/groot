import type { LabelSuggestion } from '$lib/types';

export const VISIBLE_LABEL_SUGGESTION_LIMIT = 10;
export const MAX_PERMANENT_LABELS = 12;

function normalizedLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function visibleLabelSuggestions(
  suggestions: LabelSuggestion[],
  input: string,
  limit = VISIBLE_LABEL_SUGGESTION_LIMIT,
  selectedLabels: string[] = []
): LabelSuggestion[] {
  const query = normalizedLabel(input);
  const selected = new Set(selectedLabels.map(normalizedLabel));
  const available = suggestions.filter(
    (suggestion) => !selected.has(normalizedLabel(suggestion.text))
  );
  if (!query) return available.slice(0, limit);

  return available
    .map((suggestion, recentIndex) => {
      const text = normalizedLabel(suggestion.text);
      const matchRank =
        text === query ? 0 : text.startsWith(query) ? 1 : text.includes(query) ? 2 : 3;
      return { suggestion, recentIndex, matchRank };
    })
    .filter(({ matchRank }) => matchRank < 3)
    .sort((left, right) => left.matchRank - right.matchRank || left.recentIndex - right.recentIndex)
    .slice(0, limit)
    .map(({ suggestion }) => suggestion);
}

export function addPermanentLabel(labels: string[], value: string): string[] {
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text || Array.from(text).length > 48 || labels.length >= MAX_PERMANENT_LABELS) return labels;
  const key = normalizedLabel(text);
  if (labels.some((label) => normalizedLabel(label) === key)) return labels;
  return [...labels, text];
}

export function permanentLabelsForSubmission(labels: string[], input: string): string[] {
  const inputKey = normalizedLabel(input);
  if (
    inputKey &&
    labels.length >= MAX_PERMANENT_LABELS &&
    !labels.some((label) => normalizedLabel(label) === inputKey)
  )
    return [];
  const combined = inputKey ? addPermanentLabel(labels, input) : labels;
  return combined.length > 0 && combined.length <= MAX_PERMANENT_LABELS ? combined : [];
}
