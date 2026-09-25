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
    expect(source).toContain('labels: [...submissionLabels]');
    expect(source).toContain('selectedCoins: [...selectedCoins]');
    expect(source).toContain('await saveCurrentDraft();');
    expect(source).toContain('walletService.savePaymentDraft({');
    expect(source).toContain('await walletService.clearPaymentDraft()');
    expect(source).toContain('confirmDiscardPaymentDraft');
    expect(source).toContain("'Discard this payment draft?'");
    expect(source).not.toContain("title={translate($locale, 'Only the draft will be removed.')}");
    expect(source).not.toContain("<dt>{translate($locale, 'Saved fields')}</dt>");
    expect(source).toContain('suppressDraftSave = true');
    expect(source).toContain('if (!suppressDraftSave) void saveCurrentDraft();');
  });

  it('loads the restart-safe draft and offers separate overview resume and discard actions', () => {
    expect(overview).toContain('walletService.paymentDraft()');
    expect(overview).toContain('activeDraft = activeProposal ? null : draft');
    expect(overview).toContain("'Payment draft in progress'");
    expect(overview).toContain("'Recipient and labels saved'");
    expect(overview).toContain("activeDraft.kind === 'multisig' ? '/multisig/send' : '/send'");
    expect(overview).toContain('confirmDiscardPaymentDraft');
    expect(overview).toContain("'Discard this payment draft?'");
    expect(overview).toContain('await walletService.clearPaymentDraft()');
    expect(overview).not.toContain("title={translate($locale, 'Only the draft will be removed.')}");
    expect(overview).not.toContain("<dt>{translate($locale, 'Saved fields')}</dt>");
  });
});
