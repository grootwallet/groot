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

const paymentDrafts = new Map<string, PaymentDraft>();

function cloneDraft(draft: PaymentDraft): PaymentDraft {
  return { ...draft, labels: [...draft.labels], selectedCoins: [...draft.selectedCoins] };
}

export function savePaymentDraft(draft: PaymentDraft): void {
  paymentDrafts.set(draft.walletId, cloneDraft(draft));
}

export function paymentDraftFor(walletId: string): PaymentDraft | null {
  const draft = paymentDrafts.get(walletId);
  return draft ? cloneDraft(draft) : null;
}

export function clearPaymentDraft(walletId: string): void {
  paymentDrafts.delete(walletId);
}
