import type { AutomaticSelectionStrategy, CoinSelection } from './contracts';

export type AutomaticStrategyMessage = 'Balanced' | 'More private' | 'Lower fee';

export function presentedCoinSelection(
  selectedOutpoints: string[],
  strategy: AutomaticSelectionStrategy
): CoinSelection {
  return selectedOutpoints.length
    ? { mode: 'manual', outpoints: selectedOutpoints }
    : { mode: 'auto', strategy };
}

export function automaticStrategyMessage(
  strategy: AutomaticSelectionStrategy
): AutomaticStrategyMessage {
  return strategy === 'private'
    ? 'More private'
    : strategy === 'lower_fee'
      ? 'Lower fee'
      : 'Balanced';
}

export function toggleManualCoin(
  selectedOutpoints: string[],
  outpoint: string,
  checked: boolean
): string[] {
  return checked
    ? [...selectedOutpoints, outpoint]
    : selectedOutpoints.filter((item) => item !== outpoint);
}
