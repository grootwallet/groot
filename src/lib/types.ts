export type PermanentLabel = {
  id: string;
  text: string;
  origin: 'receive' | 'payment' | 'imported';
};

export type LabelSuggestion = {
  id: string;
  text: string;
  assignmentCount: number;
  usedForReceive: boolean;
  usedForPayment: boolean;
};

export type ProvenanceSummary = {
  state: 'known' | 'mixed' | 'unknown';
  context: 'received' | 'change' | 'funding' | 'unknown';
  labels: PermanentLabel[];
  clusterCount: number;
  addressReused: boolean;
  sourceTransactionId?: string | null;
  sourceIntentLabel?: PermanentLabel | null;
  sourceOutpoints?: string[];
};

export type Transaction = {
  id: string;
  kind: 'payment' | 'self_spend';
  direction: 'received' | 'sent';
  amount: number;
  fee?: number;
  status: 'confirmed' | 'pending' | 'replaced';
  confirmations: number;
  date: string;
  address: string | null;
  label: string;
  block?: number;
  replacedBy?: string | null;
  replaces?: string | null;
  inputCount?: number | null;
  outputCount?: number | null;
  feeRate?: number | null;
  walletInputAmount?: number | null;
  walletOutputAmount?: number | null;
  locktime?: number | null;
  rbf?: boolean | null;
  rbfHistory?: {
    originalTxid: string;
    replacementTxid: string;
    originalFeeRate?: number | null;
    replacementFeeRate?: number | null;
    outcome: 'replacement_broadcast' | 'replacement_confirmed' | 'original_confirmed';
  } | null;
  intentLabel: PermanentLabel | null;
  provenance: ProvenanceSummary;
};

export type ReceiveAddress = {
  id: number;
  address: string;
  testnetAlias?: string | null;
  label: string;
  labels?: string[];
  created: string;
  status: 'awaiting' | 'used' | 'discarded';
  derivationPath: string;
  hardwareVerifiedAt?: string | null;
  hardwareVerifiedBy?: string | null;
};

export type Utxo = {
  outpoint: string;
  amount: number;
  confirmations: number;
  address: string;
  label: string;
  frozen: boolean;
  primaryLabel: PermanentLabel | null;
  provenance: ProvenanceSummary;
  policyMaturity?: {
    state: 'unconfirmed' | 'immature' | 'approaching' | 'mature';
    policyType: 'recovery' | 'inheritance';
    delayBlocks: number;
    ageBlocks: number;
    remainingBlocks: number | null;
    approachingAtBlocks: number;
    maturityHeight: number | null;
    approximateSecondsRemaining: number | null;
    delayedSpendSupported: boolean;
  } | null;
};
