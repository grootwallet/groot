import type { CosignerDraft } from '$lib/multisig/policy';
import type {
  MultisigSetupDraft,
  MultisigSetupStage,
  MultisigSetupTemplate,
  RecoveryTemplate
} from './contracts';

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
  if (draft.templateKind === 'partner_continuity_v1') return 8;
  if (draft.templateKind === 'family_continuity_v1') return 7;
  if (draft.templateKind !== 'standard') return 4;
  if (draft.standardRecipe === 'two_of_three') return 3;
  if (draft.standardRecipe === 'three_of_five') return 5;
  return draft.customCosignerCount;
}

export function multisigSetupRecoveryTemplate(
  templateKind: MultisigSetupTemplate,
  cosigners: CosignerDraft[],
  recoveryDelayBlocks = 4_320
): RecoveryTemplate | null {
  const ids = cosigners.map((key) => key.id);
  if (templateKind === 'standard') return null;
  if (templateKind === 'partner_continuity_v1') {
    if (ids.length < 8) return null;
    return {
      type: 'partner_continuity_v1',
      owner: { threshold: 2, signerIds: ids.slice(0, 3) },
      partner: { threshold: 2, signerIds: ids.slice(3, 5) },
      estate: { threshold: 2, signerIds: ids.slice(5, 8) }
    };
  }
  if (templateKind === 'family_continuity_v1') {
    if (ids.length < 7) return null;
    return {
      type: 'family_continuity_v1',
      parents: { threshold: 2, signerIds: ids.slice(0, 2) },
      childAssistance: { threshold: 1, signerIds: ids.slice(2, 4) },
      childInheritance: { threshold: 2, signerIds: ids.slice(4, 6) },
      executorSignerId: ids[6]
    };
  }
  if (ids.length < 4) return null;
  return {
    type: 'recovery',
    immediate: { threshold: 2, signerIds: ids.slice(0, 3) },
    recovery: {
      threshold: 1,
      signerIds: [ids[3]],
      availableAfterBlocks: templateKind === 'inheritance' ? 52_560 : recoveryDelayBlocks
    }
  };
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
