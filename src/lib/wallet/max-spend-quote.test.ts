import { describe, expect, it } from 'vitest';
import { feeRate, sats, type CoinSelection, type Sats } from './contracts';
import {
  isCurrentMaxSpendResponse,
  matchingMaxSpendFee,
  sameMaxSpendRequest,
  validatedMaxSpendQuote
} from './max-spend-quote';

const automatic: CoinSelection = { mode: 'auto', strategy: 'balanced' };
const request = {
  recipient: 'tb1qrecipient',
  feeRate: 1,
  coinSelection: automatic
};

describe('maximum-spend quote', () => {
  it('uses the native drain fee while every quoted input still matches', () => {
    const quote = validatedMaxSpendQuote({ amount: sats(2_468), fee: sats(110) }, request);

    expect(matchingMaxSpendFee(quote, { ...request, amount: 2_468 })).toBe(110);
  });

  it('invalidates the fee after the amount, recipient, fee rate, or selection changes', () => {
    const quote = validatedMaxSpendQuote({ amount: sats(2_468), fee: sats(110) }, request);
    const changedSelection: CoinSelection = { mode: 'manual', outpoints: ['txid:0'] };

    expect(matchingMaxSpendFee(quote, { ...request, amount: 2_467 })).toBeNull();
    expect(
      matchingMaxSpendFee(quote, { ...request, recipient: 'tb1qother', amount: 2_468 })
    ).toBeNull();
    expect(matchingMaxSpendFee(quote, { ...request, feeRate: 2, amount: 2_468 })).toBeNull();
    expect(
      matchingMaxSpendFee(quote, {
        ...request,
        coinSelection: changedSelection,
        amount: 2_468
      })
    ).toBeNull();
  });

  it('rejects malformed native amounts and fees', () => {
    expect(validatedMaxSpendQuote({ amount: sats(0), fee: sats(110) }, request)).toBeNull();
    expect(
      validatedMaxSpendQuote({ amount: sats(2_468), fee: Number.NaN as Sats }, request)
    ).toBeNull();
    expect(validatedMaxSpendQuote({ amount: sats(2_468), fee: -1 as Sats }, request)).toBeNull();
  });

  it('compares manual coin order exactly for asynchronous request freshness', () => {
    const first = {
      ...request,
      coinSelection: { mode: 'manual', outpoints: ['a:0', 'b:1'] } as CoinSelection
    };
    const same = {
      ...request,
      coinSelection: { mode: 'manual', outpoints: ['a:0', 'b:1'] } as CoinSelection
    };
    const reordered = {
      ...request,
      coinSelection: { mode: 'manual', outpoints: ['b:1', 'a:0'] } as CoinSelection
    };

    expect(sameMaxSpendRequest(first, same)).toBe(true);
    expect(sameMaxSpendRequest(first, reordered)).toBe(false);
  });

  it('rejects a late response after a manual amount edit cancels its revision', () => {
    expect(isCurrentMaxSpendResponse(4, 4, request, request)).toBe(true);
    expect(isCurrentMaxSpendResponse(4, 5, request, request)).toBe(false);
  });

  it('accepts branded fee-rate inputs without changing integer accounting', () => {
    const brandedRequest = { ...request, feeRate: feeRate(1) };
    const quote = validatedMaxSpendQuote({ amount: sats(2_468), fee: sats(110) }, brandedRequest);

    expect(matchingMaxSpendFee(quote, { ...brandedRequest, amount: 2_468 })).toBe(110);
  });
});
