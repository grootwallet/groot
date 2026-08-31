import { describe, expect, it } from 'vitest';
import type { LabelSuggestion } from '$lib/types';
import {
  addPermanentLabel,
  addPermanentLabelSuggestion,
  applyPermanentLabelKey,
  backspaceLabelDraft,
  MAX_MANUAL_PERMANENT_LABELS,
  permanentLabelsForSubmission,
  tokenizeLabelDraft,
  updatePermanentLabelDraft,
  visibleLabelSuggestions
} from './label-suggestions';

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

  it('shows only the most recent compact suggestion set while the field is empty', () => {
    expect(visibleLabelSuggestions(history, '').map(({ text }) => text)).toEqual(
      history.slice(0, 4).map(({ text }) => text)
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

  it('removes already selected labels from the reusable suggestion list', () => {
    expect(
      visibleLabelSuggestions(history, '', 10, [' recent   11 ']).map(({ text }) => text)
    ).not.toContain('Recent 11');
  });

  it('adds unique normalized labels and includes an unfinished field on submission', () => {
    expect(addPermanentLabel(['Hardware'], '  Test   journey ')).toEqual([
      'Hardware',
      'Test journey'
    ]);
    expect(addPermanentLabel(['Hardware'], ' hardware ')).toEqual(['Hardware']);
    expect(permanentLabelsForSubmission(['Hardware'], 'BitBox02')).toEqual([
      'Hardware',
      'BitBox02'
    ]);
    expect(
      addPermanentLabel(
        Array.from({ length: MAX_MANUAL_PERMANENT_LABELS }, (_, i) => `${i}`),
        'x'
      )
    ).toHaveLength(MAX_MANUAL_PERMANENT_LABELS);
    expect(
      permanentLabelsForSubmission(
        Array.from({ length: MAX_MANUAL_PERMANENT_LABELS }, (_, i) => `${i}`),
        'One too many'
      )
    ).toEqual([]);
    expect(
      visibleLabelSuggestions(
        history,
        '',
        4,
        Array.from({ length: MAX_MANUAL_PERMANENT_LABELS }, (_, i) => `${i}`)
      )
    ).toEqual([]);
  });

  it('tokenizes pasted separators and commits the trailing draft on enter or tab', () => {
    expect(tokenizeLabelDraft([], 'Client, Quarterly; pending')).toEqual({
      labels: ['Client', 'Quarterly'],
      input: ' pending'
    });
    expect(tokenizeLabelDraft(['Client'], 'Quarterly', true)).toEqual({
      labels: ['Client', 'Quarterly'],
      input: ''
    });
  });

  it('arms the last label before a second backspace removes it', () => {
    expect(backspaceLabelDraft(['Client', 'Quarterly'], null)).toEqual({
      labels: ['Client', 'Quarterly'],
      armedIndex: 1
    });
    expect(backspaceLabelDraft(['Client', 'Quarterly'], 1)).toEqual({
      labels: ['Client'],
      armedIndex: null
    });
  });

  it('keeps the shared editor transitions identical for input, commit, and backspace', () => {
    const initial = { labels: ['Client'], input: '', armedIndex: null };
    expect(updatePermanentLabelDraft(initial, 'Quarterly; pending')).toEqual({
      labels: ['Client', 'Quarterly'],
      input: ' pending',
      armedIndex: null
    });
    expect(
      applyPermanentLabelKey({ labels: ['Client'], input: 'Quarterly', armedIndex: null }, 'Tab')
    ).toEqual({
      state: { labels: ['Client', 'Quarterly'], input: '', armedIndex: null },
      preventDefault: true,
      editKind: 'commit'
    });
    expect(applyPermanentLabelKey(initial, 'Backspace')).toEqual({
      state: { labels: ['Client'], input: '', armedIndex: 0 },
      preventDefault: true
    });
    expect(applyPermanentLabelKey(initial, 'Tab', true)).toEqual({
      state: initial,
      preventDefault: false
    });
  });

  it('adds suggestions without retaining draft or armed deletion state', () => {
    expect(
      addPermanentLabelSuggestion(
        { labels: ['Client'], input: 'ignored', armedIndex: 0 },
        'Quarterly'
      )
    ).toEqual({ labels: ['Client', 'Quarterly'], input: '', armedIndex: null });
  });
});
