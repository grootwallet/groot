import type { MultisigSetupDraft, MultisigSetupStage } from './contracts';

export function multisigSetupSignerTarget(draft: MultisigSetupDraft): number {
  if (draft.templateKind !== 'standard') return 4;
  if (draft.standardRecipe === 'two_of_three') return 3;
  if (draft.standardRecipe === 'three_of_five') return 5;
  return draft.customCosignerCount;
}

export function multisigSetupStageLabel(stage: MultisigSetupStage): string {
  if (stage === 'keys') return 'Signers';
  if (stage === 'review') return 'Verify';
  if (stage === 'backup') return 'Back up';
  return 'Policy';
}

export function isMeaningfulMultisigSetupDraft(draft: MultisigSetupDraft): boolean {
  return draft.stage !== 'policy'
    || draft.name.trim() !== ''
    || draft.cosigners.length > 0
    || draft.templateKind !== 'standard'
    || draft.standardRecipe !== 'two_of_three'
    || draft.customCosignerCount !== 3
    || draft.threshold !== 2;
}
