import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const scanner = readFileSync(new URL('./PaymentRequestQrScanner.svelte', import.meta.url), 'utf8');
const singleSend = readFileSync(new URL('../../routes/send/+page.svelte', import.meta.url), 'utf8');
const multisigSend = readFileSync(
  new URL('../../routes/multisig/send/+page.svelte', import.meta.url),
  'utf8'
);

describe('payment request QR scanning', () => {
  it('keeps decoded payment text case-exact and bounded', () => {
    expect(scanner).toContain('const exact = value.trim();');
    expect(scanner).not.toContain('toLowerCase()');
    expect(scanner).toContain('exact.length > 8 * 1024');
  });

  it.each([
    ['single-key', singleSend],
    ['multisig', multisigSend]
  ])('uses trusted parsing and reviewable prefill in the %s send flow', (_, source) => {
    expect(source).toContain('walletService.inspectPaymentRequest(value)');
    expect(source).toContain('request.payjoin');
    expect(source).toContain('amountInputValue(parsedAmount, $denomination)');
    expect(source).toContain('request.message ?? request.label');
    expect(source).toContain('PaymentRequestQrScanner onscan={receivePaymentRequest}');
    expect(source).toContain("'Scan Bitcoin payment QR'");
  });
});
