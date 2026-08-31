import type { CosignerDraft, PolicyDraft } from '$lib/multisig/policy';
import type { PaymentProposal } from './transactions';

export type MultisigWallet = PolicyDraft & {
  kind: 'multisig';
  externalDescriptor: string;
  internalDescriptor: string;
  createdAt: string;
  policyType?:
    'standard' | 'recovery' | 'inheritance' | 'partner_continuity_v1' | 'family_continuity_v1';
  recoveryTemplate?: RecoveryTemplate;
  spendingPaths?: TimedSpendingPath[];
};

export type MultisigCreation = {
  wallet: MultisigWallet;
  networkSetupCopied: boolean;
};

export type MultisigPreview = {
  name: string;
  threshold: number;
  cosigners: CosignerDraft[];
  externalDescriptor: string;
  internalDescriptor: string;
};

export type MultisigProposal = PaymentProposal & {
  psbt: string;
  signed: number;
  required: number;
  canFinalize: boolean;
  signedFingerprints: string[];
  spendPath: 'primary' | 'delayed';
  eligibleSignerFingerprints: string[];
  status: 'collecting' | 'ready' | 'broadcast' | 'cancelled';
  createdAt: string;
};

export type SpendingPath = { threshold: number; signerIds: string[] };
export type TimedSpendingPath = SpendingPath & { availableAfterBlocks: number };
export type RecoveryTemplate =
  | { type: 'recovery'; immediate: SpendingPath; recovery: TimedSpendingPath }
  | { type: 'decaying'; stages: TimedSpendingPath[] }
  | { type: 'expanding'; stages: TimedSpendingPath[] }
  | {
      type: 'partner_continuity_v1';
      owner: SpendingPath;
      partner: SpendingPath;
      estate: SpendingPath;
    }
  | {
      type: 'family_continuity_v1';
      parents: SpendingPath;
      childAssistance: SpendingPath;
      childInheritance: SpendingPath;
      executorSignerId: string;
    };
export type RecoveryPolicyAnalysis = {
  externalDescriptor: string;
  internalDescriptor: string;
  paths: TimedSpendingPath[];
  warnings: { code: string; message: string }[];
  maxSatisfactionWeight: number;
};
export type RecoveryDrill = { firstAddress: string; matchesCurrentWallet: boolean };

export type MultisigSetupStage = 'policy' | 'keys' | 'review' | 'backup';
export type MultisigSetupTemplate =
  'standard' | 'recovery' | 'inheritance' | 'partner_continuity_v1' | 'family_continuity_v1';
export type MultisigSetupRecipe = 'two_of_three' | 'three_of_five' | 'custom';
export type MultisigSetupDraft = {
  version: 1;
  stage: MultisigSetupStage;
  templateKind: MultisigSetupTemplate;
  recoveryDelayBlocks?: number;
  standardRecipe: MultisigSetupRecipe;
  customCosignerCount: number;
  name: string;
  threshold: number;
  cosigners: CosignerDraft[];
  descriptorSaved: boolean;
  coldcardRegistered: boolean;
  policyVerificationDeferred: boolean;
  policyVerifications: Array<{
    signerFingerprint: string;
    deviceType: string;
    verifiedAt: string;
    displayedAddress: string;
  }>;
  updatedAt: number;
};
