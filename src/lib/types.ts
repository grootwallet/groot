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
  inputCount?: number | null;
  outputCount?: number | null;
  feeRate?: number | null;
  walletInputAmount?: number | null;
  walletOutputAmount?: number | null;
  locktime?: number | null;
  rbf?: boolean | null;
};

export type ReceiveAddress = {
  id: number;
  address: string;
  testnetAlias?: string | null;
  label: string;
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
};
