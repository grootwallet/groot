import type { CosignerDraft, PolicyDraft } from "$lib/multisig/policy";
import type { PaymentProposal } from "./transactions";

export type MultisigWallet = PolicyDraft & {
  kind: 'multisig';
  externalDescriptor: string;
  internalDescriptor: string;
  createdAt: string;
  policyType?: 'standard' | 'recovery' | 'inheritance';
  recoveryTemplate?: RecoveryTemplate;
  spendingPaths?: TimedSpendingPath[];
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
  status: 'collecting' | 'ready' | 'broadcast' | 'cancelled';
  createdAt: string;
};

export type SpendingPath = { threshold: number; signerIds: string[] };
export type TimedSpendingPath = SpendingPath & { availableAfterBlocks: number };
export type RecoveryTemplate =
  | { type: 'recovery'; immediate: SpendingPath; recovery: TimedSpendingPath }
  | { type: 'decaying'; stages: TimedSpendingPath[] }
  | { type: 'expanding'; stages: TimedSpendingPath[] };
export type RecoveryPolicyAnalysis = {
  externalDescriptor: string;
  internalDescriptor: string;
  paths: TimedSpendingPath[];
  warnings: { code: string; message: string }[];
  maxSatisfactionWeight: number;
};
export type RecoveryDrill = { firstAddress: string; matchesCurrentWallet: boolean };
