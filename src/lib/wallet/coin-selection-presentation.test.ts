import { describe, expect, it } from 'vitest';
import {
  automaticStrategyMessage,
  presentedCoinSelection,
  toggleManualCoin
} from './coin-selection-presentation';

describe('coin-selection presentation', () => {
  it('uses selected outpoints in their exact order before the automatic strategy', () => {
    expect(presentedCoinSelection(['b:1', 'a:0'], 'private')).toEqual({
      mode: 'manual',
      outpoints: ['b:1', 'a:0']
    });
    expect(presentedCoinSelection([], 'lower_fee')).toEqual({
      mode: 'auto',
      strategy: 'lower_fee'
    });
  });

  it('preserves the existing append and remove transitions', () => {
    expect(toggleManualCoin(['a:0'], 'b:1', true)).toEqual(['a:0', 'b:1']);
    expect(toggleManualCoin(['a:0', 'b:1'], 'a:0', false)).toEqual(['b:1']);
  });

  it('maps each strategy to its existing localized message key', () => {
    expect(automaticStrategyMessage('balanced')).toBe('Balanced');
    expect(automaticStrategyMessage('private')).toBe('More private');
    expect(automaticStrategyMessage('lower_fee')).toBe('Lower fee');
  });
});
