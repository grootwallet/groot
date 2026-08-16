import type { MultisigSetupDraft, MultisigSetupStage } from './contracts';

const UNIX_SECONDS_PATTERN = /^\d{1,20}$/;

/** Convert the UI's display timestamp to the native draft's canonical Unix seconds. */
export function multisigVerificationTimestampForStorage(value: string): string | null {
  const timestamp = value.trim();
  if (UNIX_SECONDS_PATTERN.test(timestamp)) return timestamp;

  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return null;
  return Math.floor(milliseconds / 1_000).toString();
}

/** Normalize native draft timestamps before exposing them to presentation code. */
export function multisigVerificationTimestampForDisplay(value: string): string {
  const timestamp = value.trim();
  if (!UNIX_SECONDS_PATTERN.test(timestamp)) return value;

  const milliseconds = Number(timestamp) * 1_000;
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : value;
}

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
  return (
    draft.stage !== 'policy' ||
    draft.name.trim() !== '' ||
    draft.cosigners.length > 0 ||
    draft.templateKind !== 'standard' ||
    draft.standardRecipe !== 'two_of_three' ||
    draft.customCosignerCount !== 3 ||
    draft.threshold !== 2
  );
}
