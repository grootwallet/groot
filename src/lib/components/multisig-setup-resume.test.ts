import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const setup = readFileSync(new URL('../../routes/multisig/new/+page.svelte', import.meta.url), 'utf8');
const shell = readFileSync(new URL('./AppShell.svelte', import.meta.url), 'utf8');
const notice = readFileSync(new URL('./ResumeSetupNotice.svelte', import.meta.url), 'utf8');
const discardModal = readFileSync(new URL('./DiscardMultisigSetupModal.svelte', import.meta.url), 'utf8');

describe('resumable multisig setup', () => {
  it('loads, continuously saves, and explicitly discards the native draft', () => {
    expect(setup).toContain('walletService.multisigSetupDraft()');
    expect(setup).toContain('walletService.saveMultisigSetupDraft(next)');
    expect(setup).toContain('walletService.discardMultisigSetupDraft()');
    expect(setup).toContain('queueDraftSave(next)');
    expect(setup).toContain('3_000');
    expect(setup).toContain('Multisig setup resumed');
    expect(setup).toContain('<DiscardMultisigSetupModal');
  });

  it('does not include credentials or transient hardware challenges in the persisted DTO', () => {
    const draftBuilder = setup.slice(setup.indexOf('function currentSetupDraft'), setup.indexOf('async function drainDraftSaveQueue'));
    expect(draftBuilder).not.toContain('credential');
    expect(draftBuilder).not.toContain('confirmation');
    expect(draftBuilder).not.toContain('pinChallenge');
    expect(draftBuilder).not.toContain('device.id');
  });

  it('surfaces unfinished setup from the app shell with a direct app-level resume action', () => {
    expect(shell).toContain('await walletService.multisigSetupDraft()');
    expect(shell).toContain('generation === setupDraftReadGeneration');
    expect(shell).toContain('Boolean(multisigSetupDraft) && !onboardingRoute');
    expect(shell).not.toContain('Boolean(multisigSetupDraft) && !onboardingRoute && !lockedRoute');
    expect(shell).toContain('<ResumeSetupNotice');
    expect(shell).toContain("lockedRoute ? 'Multisig wallet setup'");
    expect(shell).toContain("lockedRoute ? 'Wallet creation in progress'");
    expect(shell).toContain('locked={lockedRoute}');
    expect(shell).toContain('class:locked-setup-visible={showSetupResume && lockedRoute}');
    expect(shell).toContain('ondiscard={() =>');
    expect(shell).toContain('walletService.discardMultisigSetupDraft()');
    expect(shell).toContain('<DiscardMultisigSetupModal');
    expect(shell).toContain('href="/multisig/new"');
    expect(notice).toContain('UNFINISHED WALLET');
    expect(notice).toContain('Resume setup');
    expect(notice).toContain('Discard');
    expect(notice).toContain('position: fixed');
    expect(notice).toContain('z-index: 70');
    expect(notice).toContain('role="status"');
    expect(discardModal).toContain('Discard multisig setup?');
    expect(discardModal).toContain('No wallet, signer seed, or bitcoin is deleted.');
  });
});
