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
    expect(source).toContain('paymentDraftFor(draftWalletId)');
    expect(source).toContain('saveCurrentDraft();');
    expect(source).toContain('savePaymentDraft({');
    expect(source).toContain('clearPaymentDraft(draftWalletId)');
  });

  it('offers the existing overview resume callout before a proposal exists', () => {
    expect(overview).toContain('paymentDraftFor(selectedProfile.id)');
    expect(overview).toContain("'Payment draft in progress'");
    expect(overview).toContain("'Recipient and labels saved'");
    expect(overview).toContain("activeDraft.kind === 'multisig' ? '/multisig/send' : '/send'");
  });
});
