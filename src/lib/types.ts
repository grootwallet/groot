export type Transaction = {
  id: string;
  kind: 'payment' | 'self_spend';
  direction: 'received' | 'sent';
  amount: number;
  fee?: number;
  status: 'confirmed' | 'pending';
  confirmations: number;
  date: string;
  address: string | null;
  label: string;
  block?: number;
};

export type ReceiveAddress = {
  id: number;
  address: string;
  label: string;
  created: string;
  status: 'awaiting' | 'used' | 'discarded';
  derivationPath: string;
};

export type Utxo = {
  outpoint: string;
  amount: number;
  confirmations: number;
  address: string;
  label: string;
  frozen: boolean;
};
