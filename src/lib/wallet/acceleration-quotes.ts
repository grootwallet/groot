import type { AccelerationQuote, CpfpAccelerationQuote, FeeRate, WalletPort } from './contracts';

export type AccelerationRequest = { txid: string; method: 'rbf' | 'cpfp' };
type QuoteResult =
  | { status: 'ready'; method: 'rbf'; quote: AccelerationQuote }
  | { status: 'ready'; method: 'cpfp'; quote: CpfpAccelerationQuote }
  | { status: 'failed'; cause: unknown };

// Public quote orchestration only. Native code still validates fees, intent and eligibility.
// Check the route's revision/identity after both success and failure, including teardown.
export async function requestAccelerationQuote(
  port: Pick<WalletPort, 'quoteRbf' | 'quoteCpfp'>,
  request: AccelerationRequest,
  rate: FeeRate,
  isCurrent: () => boolean
): Promise<QuoteResult | null> {
  if (!isCurrent()) return null;
  try {
    const result: QuoteResult =
      request.method === 'rbf'
        ? { status: 'ready', method: 'rbf', quote: await port.quoteRbf(request.txid, rate) }
        : { status: 'ready', method: 'cpfp', quote: await port.quoteCpfp(request.txid, rate) };
    return isCurrent() ? result : null;
  } catch (cause) {
    return isCurrent() ? { status: 'failed', cause } : null;
  }
}
