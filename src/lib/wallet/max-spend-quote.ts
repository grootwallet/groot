import type { CoinSelection, MaxSpend } from './contracts';

export type MaxSpendQuote = {
  recipient: string;
  feeRate: number;
  coinSelection: CoinSelection;
  amount: number;
  fee: number;
};

type MaxSpendRequest = Pick<MaxSpendQuote, 'recipient' | 'feeRate' | 'coinSelection'>;

function sameCoinSelection(left: CoinSelection, right: CoinSelection): boolean {
  if (left.mode !== right.mode) return false;
  if (left.mode === 'auto' && right.mode === 'auto') return left.strategy === right.strategy;
  if (left.mode === 'manual' && right.mode === 'manual') {
    return (
      left.outpoints.length === right.outpoints.length &&
      left.outpoints.every((outpoint, index) => outpoint === right.outpoints[index])
    );
  }
  return false;
}

function copyCoinSelection(selection: CoinSelection): CoinSelection {
  return selection.mode === 'manual'
    ? { mode: 'manual', outpoints: [...selection.outpoints] }
    : { mode: 'auto', strategy: selection.strategy };
}

export function sameMaxSpendRequest(left: MaxSpendRequest, right: MaxSpendRequest): boolean {
  return (
    left.recipient === right.recipient &&
    left.feeRate === right.feeRate &&
    sameCoinSelection(left.coinSelection, right.coinSelection)
  );
}

export function isCurrentMaxSpendResponse(
  responseRevision: number,
  currentRevision: number,
  request: MaxSpendRequest,
  currentRequest: MaxSpendRequest
): boolean {
  return responseRevision === currentRevision && sameMaxSpendRequest(request, currentRequest);
}

export function validatedMaxSpendQuote(
  maximum: MaxSpend,
  request: MaxSpendRequest
): MaxSpendQuote | null {
  const amount = Number(maximum.amount);
  const fee = Number(maximum.fee);
  if (
    !request.recipient ||
    !Number.isFinite(request.feeRate) ||
    request.feeRate <= 0 ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    !Number.isSafeInteger(fee) ||
    fee < 0
  ) {
    return null;
  }
  return {
    ...request,
    coinSelection: copyCoinSelection(request.coinSelection),
    amount,
    fee
  };
}

export function matchingMaxSpendFee(
  quote: MaxSpendQuote | null,
  request: MaxSpendRequest & { amount: number }
): number | null {
  if (!quote || quote.amount !== request.amount || !sameMaxSpendRequest(quote, request))
    return null;
  return quote.fee;
}
