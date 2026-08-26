import type { LabelSuggestion } from '$lib/types';

export const VISIBLE_LABEL_SUGGESTION_LIMIT = 10;

function normalizedLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function visibleLabelSuggestions(
  suggestions: LabelSuggestion[],
  input: string,
  limit = VISIBLE_LABEL_SUGGESTION_LIMIT
): LabelSuggestion[] {
  const query = normalizedLabel(input);
  if (!query) return suggestions.slice(0, limit);

  return suggestions
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
