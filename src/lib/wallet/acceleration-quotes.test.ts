import { describe, expect, it, vi } from 'vitest';
import { requestAccelerationQuote } from './acceleration-quotes';
import {
  feeRate,
  sats,
  WalletError,
  type AccelerationQuote,
  type CpfpAccelerationQuote
} from './contracts';
const rbf: AccelerationQuote = {
  method: 'rbf',
  originalTxid: 'synthetic',
  originalFee: sats(100),
  originalVsize: 100,
  originalEffectiveFeeRate: feeRate(1),
  minimumFeeRate: feeRate(2),
  targetFeeRate: feeRate(3),
  estimatedReplacementFee: sats(300),
  incrementalFee: sats(200),
  resultingEffectiveFeeRate: feeRate(3),
  replacementVsize: 100,
  recommendationSource: 'custom'
};
const cpfp: CpfpAccelerationQuote = {
  method: 'cpfp',
  originalTxid: 'synthetic',
  parentFee: sats(100),
  parentVsize: 100,
  parentEffectiveFeeRate: feeRate(1),
  minimumFeeRate: feeRate(2),
  targetFeeRate: feeRate(3),
  childFee: sats(500),
  childVsize: 100,
  packageFee: sats(600),
  packageVsize: 200,
  resultingPackageFeeRate: feeRate(3),
  recommendationSource: 'custom'
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
describe('route-owned acceleration quotes', () => {
  it.each(['rbf', 'cpfp'] as const)(
    'returns the exact %s native quote and makes only the selected call',
    async (method) => {
      const port = { quoteRbf: vi.fn(async () => rbf), quoteCpfp: vi.fn(async () => cpfp) };
      const result = await requestAccelerationQuote(
        port,
        { method, txid: 'synthetic' },
        feeRate(3),
        () => true
      );
      expect(result).toEqual({ status: 'ready', method, quote: method === 'rbf' ? rbf : cpfp });
      expect(port[method === 'rbf' ? 'quoteRbf' : 'quoteCpfp']).toHaveBeenCalledExactlyOnceWith(
        'synthetic',
        3
      );
      expect(port[method === 'rbf' ? 'quoteCpfp' : 'quoteRbf']).not.toHaveBeenCalled();
    }
  );
  it('ignores a delayed response after a newer request and applies the newer response', async () => {
    const older = deferred<AccelerationQuote>();
    let revision = 1;
    const port = {
      quoteRbf: vi.fn().mockReturnValueOnce(older.promise).mockResolvedValueOnce(rbf),
      quoteCpfp: vi.fn(async () => cpfp)
    };
    const first = requestAccelerationQuote(
      port,
      { method: 'rbf', txid: 'old' },
      feeRate(2),
      () => revision === 1
    );
    revision = 2;
    expect(
      await requestAccelerationQuote(
        port,
        { method: 'rbf', txid: 'new' },
        feeRate(3),
        () => revision === 2
      )
    ).toEqual({ status: 'ready', method: 'rbf', quote: rbf });
    older.resolve(rbf);
    expect(await first).toBeNull();
  });
  it.each(['lock', 'wallet switch', 'route teardown', 'cancel', 'proposal revision'])(
    'discards late failures after %s invalidates the route',
    async () => {
      let current = true;
      const pending = deferred<AccelerationQuote>();
      const port = { quoteRbf: () => pending.promise, quoteCpfp: async () => cpfp };
      const result = requestAccelerationQuote(
        port,
        { method: 'rbf', txid: 'synthetic' },
        feeRate(3),
        () => current
      );
      current = false;
      pending.reject(new WalletError('transaction_confirmed', 'Synthetic rejection'));
      expect(await result).toBeNull();
    }
  );
  it('preserves a current typed rejection for inline retry or confirmed-state handling', async () => {
    const cause = new WalletError('transaction_confirmed', 'Synthetic rejection');
    expect(
      await requestAccelerationQuote(
        {
          quoteRbf: async () => {
            throw cause;
          },
          quoteCpfp: async () => cpfp
        },
        { method: 'rbf', txid: 'synthetic' },
        feeRate(3),
        () => true
      )
    ).toEqual({ status: 'failed', cause });
  });
  it('does no work after cancellation', async () => {
    const port = { quoteRbf: vi.fn(async () => rbf), quoteCpfp: vi.fn(async () => cpfp) };
    expect(
      await requestAccelerationQuote(
        port,
        { method: 'rbf', txid: 'synthetic' },
        feeRate(3),
        () => false
      )
    ).toBeNull();
    expect(port.quoteRbf).not.toHaveBeenCalled();
  });
});
