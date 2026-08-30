import { localizedError, translate } from '$lib/i18n-catalog';
import type { Locale } from '$lib/i18n';
import { WalletError, type AccelerationMethod } from './contracts';

export const RBF_FUNDING_SHORTFALL_MESSAGE =
  'Not enough bitcoin to raise the fee. Receive more and wait for it to confirm, or wait for this transaction to confirm.';

export function accelerationUnavailableTitle(method: AccelerationMethod): string {
  return method === 'cpfp' ? 'CPFP unavailable' : 'Can’t speed up transaction';
}

export function accelerationUnavailableDescription(
  method: AccelerationMethod,
  cause: unknown,
  locale: Locale,
  fallback = 'Could not prepare fee acceleration.'
): string {
  if (method === 'rbf' && cause instanceof WalletError && cause.code === 'insufficient_funds') {
    return translate(locale, RBF_FUNDING_SHORTFALL_MESSAGE);
  }
  return localizedError(cause, locale, fallback);
}
