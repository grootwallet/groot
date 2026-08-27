import type { AutomaticSelectionStrategy } from './contracts';

type PaymentDraftBase = {
  walletId: string;
  address: string;
  labels: string[];
  amount: string;
  stage: 1 | 2;
  selectedCoins: string[];
  automaticStrategy: AutomaticSelectionStrategy;
};

export type SingleKeyPaymentDraft = PaymentDraftBase & {
  kind: 'single_key';
  speed: string;
  customFee: string;
};

export type MultisigPaymentDraft = PaymentDraftBase & {
  kind: 'multisig';
  selectedRate: number;
};

export type PaymentDraft = SingleKeyPaymentDraft | MultisigPaymentDraft;
