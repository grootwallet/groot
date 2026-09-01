import { describe, expect, it } from 'vitest';
import { WalletError } from './contracts';
import {
  accelerationUnavailableDescription,
  accelerationUnavailableTitle,
  RBF_FUNDING_SHORTFALL_MESSAGE
} from './acceleration-presentation';

describe('acceleration presentation', () => {
  it('names the acceleration method instead of implying that the wallet failed to load', () => {
    expect(accelerationUnavailableTitle('cpfp')).toBe('CPFP unavailable');
    expect(accelerationUnavailableTitle('rbf')).toBe('RBF unavailable');
  });

  it('explains why a full-balance payment cannot fund a higher RBF fee', () => {
    const cause = new WalletError(
      'insufficient_funds',
      'Insufficient funds: 39890 sats available of 40001 sats needed'
    );

    expect(accelerationUnavailableDescription('rbf', cause, 'en')).toBe(
      RBF_FUNDING_SHORTFALL_MESSAGE
    );
    expect(accelerationUnavailableDescription('cpfp', cause, 'en')).toBe(cause.message);
  });
});
