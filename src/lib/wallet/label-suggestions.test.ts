import { describe, expect, it } from 'vitest';
import type { LabelSuggestion } from '$lib/types';
import { visibleLabelSuggestions } from './label-suggestions';

function suggestion(text: string): LabelSuggestion {
  return {
    id: text,
    text,
    assignmentCount: 1,
    usedForReceive: true,
    usedForPayment: false
  };
}

describe('visibleLabelSuggestions', () => {
  const history = [
    ...Array.from({ length: 11 }, (_, index) => suggestion(`Recent ${11 - index}`)),
    suggestion('Receive test'),
    suggestion('Old receive test archive')
  ];

  it('shows only the ten most recently used labels while the field is empty', () => {
    expect(visibleLabelSuggestions(history, '').map(({ text }) => text)).toEqual(
      history.slice(0, 10).map(({ text }) => text)
    );
  });

  it('searches the complete history and ranks exact and prefix matches before substrings', () => {
    expect(visibleLabelSuggestions(history, '  RECEIVE   TEST ').map(({ text }) => text)).toEqual([
      'Receive test',
      'Old receive test archive'
    ]);
  });

  it('returns no chips when the typed value does not match history', () => {
    expect(visibleLabelSuggestions(history, 'unrelated')).toEqual([]);
  });
});
