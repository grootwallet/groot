export type Transaction = {
  id: string;
  direction: 'received' | 'sent';
  amount: number;
  fee?: number;
  status: 'confirmed' | 'pending';
  confirmations: number;
  date: string;
  address: string;
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
