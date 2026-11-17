import { describe, expect, it } from 'vitest';
import { translate } from '../i18n-catalog';
import {
  TRADE_STEPS,
  sandboxEscrowPayment,
  sandboxPaymentReference,
  tradeEventLabel,
  tradeProgress
} from './trade-presentation';

describe('sandbox payment details', () => {
  it('keeps the same practice reference for both sides of a trade', () => {
    const tradeId = '811e4d23-2a50-4309-ad95-821f3f72f645';
    const reference = sandboxPaymentReference(tradeId);
    expect(reference).toBe('TEST-821F3F72F645');
    expect(sandboxPaymentReference(tradeId.toUpperCase())).toBe(reference);
    expect(sandboxPaymentReference('a9307a12-94fc-4f0a-87e5-e3a0c9640455')).not.toBe(reference);
  });

  it('uses the same Regtest address and exact escrow amount in the BIP21 payment URI', () => {
    const details = sandboxEscrowPayment('811e4d23-2a50-4309-ad95-821f3f72f645', 164499);
    const uri = new URL(details.uri);
    expect(uri.protocol).toBe('bitcoin:');
    expect(uri.pathname).toBe(details.address);
    expect(details.address).toMatch(/^bcrt1q[0-9a-z]{38}$/);
    expect(details.amount).toBe('0.00164499');
    expect(uri.searchParams.get('amount')).toBe(details.amount);
    expect(uri.searchParams.get('label')).toBe('Groot practice TEST-821F3F72F645');
  });
});

describe('trade progress', () => {
  it('lists the four steps in the order they can complete', () => {
    expect(TRADE_STEPS).toEqual(['Escrow', 'Payment', 'Receipt', 'Release']);
  });

  it.each([
    ['escrow_pending', 1],
    ['awaiting_payment', 2],
    ['payment_sent', 3],
    ['release_pending', 4],
    ['completed', 5],
    ['cancelled', null],
    ['refund_pending', null],
    ['refunded', null],
    ['disputed', null]
  ] as const)('shows the saved %s state at %s', (state, step) => {
    expect(tradeProgress(state, [])).toBe(step);
  });

  it.each(['release_pending', 'completed'] as const)(
    'omits the happy path after a dispute orders release in %s',
    (state) => {
      const events = [
        { kind: 'trade_started' },
        { kind: 'sandbox_confirm_escrow' },
        { kind: 'mark_paid' },
        { kind: 'dispute' },
        { kind: 'sandbox_resolve_release' },
        ...(state === 'completed' ? [{ kind: 'sandbox_confirm_release' }] : [])
      ];
      expect(tradeProgress(state, events)).toBeNull();
    }
  );

  it('shows completion for a saved guided trade with simulated seller receipt', () => {
    expect(
      tradeProgress('completed', [
        { kind: 'trade_started' },
        { kind: 'sandbox_confirm_escrow' },
        { kind: 'mark_paid' },
        { kind: 'sandbox_seller_received' },
        { kind: 'sandbox_confirm_release' }
      ])
    ).toBe(TRADE_STEPS.length + 1);
  });
});

describe('trade activity labels', () => {
  it.each([
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
  ])('presents %s with localized friendly copy', (kind, label) => {
    expect(tradeEventLabel(kind)).toBe(label);
    expect(translate('fr', label)).not.toBe(label);
    expect(translate('es', label)).not.toBe(label);
  });

  it.each(['__proto__', 'toString', '<script>secret</script>', 'sandbox_other', ''])(
    'gives an unrecognized event a neutral label (%j)',
    (kind) => {
      const label = tradeEventLabel(kind);
      expect(label).toBe('Trade updated');
      expect(translate('fr', label)).toBe('Échange mis à jour');
      expect(translate('es', label)).toBe('Intercambio actualizado');
    }
  );
});
