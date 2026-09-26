import { describe, expect, it } from 'vitest';
import { WalletError } from './contracts';
import {
  accelerationOriginalConfirmed,
  accelerationUnavailableDescription,
  accelerationUnavailableTitle,
  RBF_FUNDING_SHORTFALL_MESSAGE
} from './acceleration-presentation';

describe('acceleration presentation', () => {
  it('stops acceleration only for the exact confirmed original transaction', () => {
    expect(
      accelerationOriginalConfirmed('original', [{ id: 'original', status: 'confirmed' }])
    ).toBe(true);
    expect(accelerationOriginalConfirmed('original', [{ id: 'other', status: 'confirmed' }])).toBe(
      false
    );
    expect(accelerationOriginalConfirmed('original', [{ id: 'original', status: 'pending' }])).toBe(
      false
    );
    expect(accelerationOriginalConfirmed(null, [{ id: 'original', status: 'confirmed' }])).toBe(
      false
    );
  });
  it('names the acceleration method instead of implying that the wallet failed to load', () => {
    expect(accelerationUnavailableTitle('cpfp')).toBe('CPFP unavailable');
    expect(accelerationUnavailableTitle('rbf')).toBe('Can’t speed up transaction');
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
