import type { Trade, TradeEvent } from './backend-client';
import { amountInputValue } from '$lib/denomination';

export const TRADE_STEPS = ['Escrow', 'Payment', 'Receipt', 'Release'] as const;

const progressByState: Record<Trade['state'], number | null> = {
  escrow_pending: 1,
  awaiting_payment: 2,
  payment_sent: 3,
  release_pending: 4,
  completed: 5,
  cancelled: null,
  refund_pending: null,
  refunded: null,
  disputed: null
};

export function tradeProgress(state: Trade['state'], events: readonly Pick<TradeEvent, 'kind'>[]) {
  // A dispute can authorize release without the seller confirming receipt.
  if (events.some(({ kind }) => kind === 'sandbox_resolve_release')) return null;
  return progressByState[state];
}

const eventLabels = new Map([
  ['trade_started', 'Trade started'],
  ['sandbox_confirm_escrow', 'Bitcoin locked in test escrow'],
  ['mark_paid', 'Buyer marked payment sent'],
  ['sandbox_buyer_paid', 'Buyer marked payment sent'],
  ['confirm_receipt', 'Seller confirmed receipt'],
  ['sandbox_seller_received', 'Seller confirmed receipt'],
  ['sandbox_confirm_release', 'Bitcoin released'],
  ['cancel', 'Trade cancelled'],
  ['request_refund', 'Refund requested'],
  ['sandbox_confirm_refund', 'Bitcoin refunded'],
  ['dispute', 'Trade paused for review'],
  ['sandbox_resolve_refund', 'Test dispute resolved for refund'],
  ['sandbox_resolve_release', 'Test dispute resolved for release']
]);

export function tradeEventLabel(kind: string) {
  return eventLabels.get(kind) ?? 'Trade updated';
}

export function sandboxPaymentReference(tradeId: Trade['id']) {
  return `TEST-${tradeId.slice(-12).toUpperCase()}`;
}

export function sandboxEscrowPayment(tradeId: Trade['id'], grossSats: number) {
  // Known Regtest fixture, never derived from a wallet or used to observe funds.
  const address = 'bcrt1qf6n3a54f4nqc5976hjl556ukfdas8xsnf8k9mz';
  const amount = amountInputValue(grossSats, 'btc');
  const label = encodeURIComponent(`Groot practice ${sandboxPaymentReference(tradeId)}`);
  return {
    address,
    amount,
    uri: `bitcoin:${address}?amount=${amount}&label=${label}`
  };
}
