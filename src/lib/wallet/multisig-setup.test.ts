import { describe, expect, it } from 'vitest';
import type { MultisigSetupDraft, MultisigSetupStage } from './contracts';
import {
  isMeaningfulMultisigSetupDraft,
  multisigSetupSignerTarget,
  multisigSetupStageLabel,
  multisigVerificationTimestampForDisplay,
  multisigVerificationTimestampForStorage
} from './multisig-setup';

const emptyDraft: MultisigSetupDraft = {
  version: 1,
  stage: 'policy',
  templateKind: 'standard',
  standardRecipe: 'two_of_three',
  customCosignerCount: 3,
  name: '',
  threshold: 2,
  cosigners: [],
  descriptorSaved: false,
  coldcardRegistered: false,
  policyVerificationDeferred: false,
  policyVerifications: [],
  updatedAt: 0
};

describe('multisig setup presentation policy', () => {
  it('maps every resumable step to concise user-facing copy', () => {
    const stages: MultisigSetupStage[] = ['policy', 'keys', 'review', 'backup'];
    expect(stages.map(multisigSetupStageLabel)).toEqual(['Policy', 'Signers', 'Verify', 'Back up']);
  });

  it('derives signer targets from standard, custom, and recovery recipes', () => {
    expect(multisigSetupSignerTarget(emptyDraft)).toBe(3);
    expect(multisigSetupSignerTarget({ ...emptyDraft, standardRecipe: 'three_of_five' })).toBe(5);
    expect(
      multisigSetupSignerTarget({ ...emptyDraft, standardRecipe: 'custom', customCosignerCount: 7 })
    ).toBe(7);
    expect(multisigSetupSignerTarget({ ...emptyDraft, templateKind: 'recovery' })).toBe(4);
  });

  it('does not persist untouched defaults but keeps every meaningful continuation', () => {
    expect(isMeaningfulMultisigSetupDraft(emptyDraft)).toBe(false);
    expect(isMeaningfulMultisigSetupDraft({ ...emptyDraft, name: 'Family wallet' })).toBe(true);
    expect(isMeaningfulMultisigSetupDraft({ ...emptyDraft, stage: 'keys' })).toBe(true);
  });

  it('serializes verification timestamps for the strict native draft boundary', () => {
    expect(multisigVerificationTimestampForStorage('2026-08-14T16:14:00.000Z')).toBe('1786724040');
    expect(multisigVerificationTimestampForStorage('1786724040')).toBe('1786724040');
    expect(multisigVerificationTimestampForStorage('not-a-time')).toBeNull();
  });

  it('normalizes persisted verification timestamps for presentation', () => {
    expect(multisigVerificationTimestampForDisplay('1786724040')).toBe('2026-08-14T16:14:00.000Z');
    expect(multisigVerificationTimestampForDisplay('2026-08-14T16:14:00.000Z')).toBe(
      '2026-08-14T16:14:00.000Z'
    );
  });
});
