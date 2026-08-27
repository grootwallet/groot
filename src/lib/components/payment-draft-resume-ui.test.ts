import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const singleSend = readFileSync(new URL('../../routes/send/+page.svelte', import.meta.url), 'utf8');
const multisigSend = readFileSync(
  new URL('../../routes/multisig/send/+page.svelte', import.meta.url),
  'utf8'
);
const overview = readFileSync(new URL('../../routes/+page.svelte', import.meta.url), 'utf8');

describe('unfinished payment resume UI', () => {
  it.each([
    ['single-key', singleSend],
    ['multisig', multisigSend]
  ])('saves, restores, and clears the %s payment draft at the proposal boundary', (_, source) => {
    expect(source).toContain('await walletService.paymentDraft()');
    expect(source).toContain('await saveCurrentDraft();');
    expect(source).toContain('walletService.savePaymentDraft({');
    expect(source).toContain('await walletService.clearPaymentDraft()');
  });

  it('loads the restart-safe draft and offers the existing overview resume callout', () => {
    expect(overview).toContain('await walletService.paymentDraft()');
    expect(overview).toContain("'Payment draft in progress'");
    expect(overview).toContain("'Recipient and labels saved'");
    expect(overview).toContain("activeDraft.kind === 'multisig' ? '/multisig/send' : '/send'");
  });
});
