import type { LabelSuggestion } from '$lib/types';

export const VISIBLE_LABEL_SUGGESTION_LIMIT = 4;
export const MAX_MANUAL_PERMANENT_LABELS = 5;

export type LabelDraftState = {
  labels: string[];
  input: string;
  armedIndex: number | null;
};

export type LabelDraftEditKind = 'input' | 'commit' | 'suggestion';

function normalizedLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function visibleLabelSuggestions(
  suggestions: LabelSuggestion[],
  input: string,
  limit = VISIBLE_LABEL_SUGGESTION_LIMIT,
  selectedLabels: string[] = []
): LabelSuggestion[] {
  if (selectedLabels.length >= MAX_MANUAL_PERMANENT_LABELS) return [];
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
  if (!text || Array.from(text).length > 48 || labels.length >= MAX_MANUAL_PERMANENT_LABELS)
    return labels;
  const key = normalizedLabel(text);
  if (labels.some((label) => normalizedLabel(label) === key)) return labels;
  return [...labels, text];
}

export function tokenizeLabelDraft(
  labels: string[],
  value: string,
  commitTrailing = false
): { labels: string[]; input: string } {
  const parts = value.split(/[,;]/);
  const completed = commitTrailing ? parts : parts.slice(0, -1);
  let next = labels;
  for (const part of completed) next = addPermanentLabel(next, part);
  return {
    labels: next,
    input: commitTrailing ? '' : (parts.at(-1) ?? '')
  };
}

export function backspaceLabelDraft(
  labels: string[],
  armedIndex: number | null
): { labels: string[]; armedIndex: number | null } {
  const lastIndex = labels.length - 1;
  if (lastIndex < 0) return { labels, armedIndex: null };
  if (armedIndex !== lastIndex) return { labels, armedIndex: lastIndex };
  return { labels: labels.slice(0, lastIndex), armedIndex: null };
}

export function permanentLabelsForSubmission(labels: string[], input: string): string[] {
  const inputKey = normalizedLabel(input);
  if (
    inputKey &&
    labels.length >= MAX_MANUAL_PERMANENT_LABELS &&
    !labels.some((label) => normalizedLabel(label) === inputKey)
  )
    return [];
  const combined = inputKey ? addPermanentLabel(labels, input) : labels;
  return combined.length > 0 && combined.length <= MAX_MANUAL_PERMANENT_LABELS ? combined : [];
}

export function updatePermanentLabelDraft(state: LabelDraftState, value: string): LabelDraftState {
  if (state.labels.length >= MAX_MANUAL_PERMANENT_LABELS)
    return { ...state, input: '', armedIndex: null };
  const draft = tokenizeLabelDraft(state.labels, value);
  return { labels: draft.labels, input: draft.input, armedIndex: null };
}

export function applyPermanentLabelKey(
  state: LabelDraftState,
  key: string,
  shiftKey = false
): { state: LabelDraftState; preventDefault: boolean; editKind?: LabelDraftEditKind } {
  if (key === 'Backspace' && !state.input) {
    const result = backspaceLabelDraft(state.labels, state.armedIndex);
    return {
      state: { labels: result.labels, input: '', armedIndex: result.armedIndex },
      preventDefault: true
    };
  }
  if (key === 'Tab' && shiftKey) return { state, preventDefault: false };
  if (!state.input.trim() || !['Enter', 'Tab', ',', ';'].includes(key))
    return { state: { ...state, armedIndex: null }, preventDefault: false };
  const draft = tokenizeLabelDraft(state.labels, state.input, true);
  return {
    state: { labels: draft.labels, input: draft.input, armedIndex: null },
    preventDefault: true,
    editKind: 'commit'
  };
}

export function addPermanentLabelSuggestion(
  state: LabelDraftState,
  suggestion: string
): LabelDraftState {
  return {
    labels: addPermanentLabel(state.labels, suggestion),
    input: '',
    armedIndex: null
  };
}
