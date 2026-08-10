import type { ReceiveAddress, Transaction, Utxo } from './types';
import { defaultConfig, networkName } from './config';

export const wallet = {
  name: 'My wallet',
  balance: 2_481_240,
  pending: 125_000,
  fiatRate: 105_420,
  network: networkName(defaultConfig.network)
};

export const transactions: Transaction[] = [
  { id: '6a1b2c3d4e5f67890123456789abcdef6a1b2c3d4e5f67890123456789abcdef', kind: 'payment', direction: 'received', amount: 125_000, status: 'pending', confirmations: 0, date: 'Today, 14:32', address: 'tb1q8y4...ev8d', label: 'Invoice #104', inputCount: 1, outputCount: 2, feeRate: null, walletInputAmount: null, walletOutputAmount: 125_000, locktime: 0, rbf: true },
  { id: 'b8198ee0822acf04cb4f0a52ac13a5f4d1cc4e8f918d69e2559b26b9f5c54f09', kind: 'payment', direction: 'sent', amount: 420_000, fee: 2_184, status: 'confirmed', confirmations: 18, date: 'Jul 14, 09:18', address: 'tb1q9u7...0zkf', label: 'Hardware order', block: 4_231_842, inputCount: 2, outputCount: 2, feeRate: 8.12, walletInputAmount: 600_000, walletOutputAmount: 177_816, locktime: 4_231_824, rbf: true },
  { id: 'f7c42c16ea0a8f449aa21d1e561203a129d3476d43e9ef332103b2c1b005a1ec', kind: 'payment', direction: 'received', amount: 1_250_000, status: 'confirmed', confirmations: 286, date: 'Jul 08, 17:05', address: 'tb1q2la...p29a', label: 'Savings', block: 4_231_574, inputCount: 1, outputCount: 2, feeRate: null, walletInputAmount: null, walletOutputAmount: 1_250_000, locktime: 0, rbf: false },
  { id: '29d60f174b57d0b651e10d76f9a63cc1f9e00176e5b582a6f23fbaea950c4793', kind: 'payment', direction: 'sent', amount: 89_500, fee: 912, status: 'confirmed', confirmations: 944, date: 'Jun 22, 12:44', address: 'tb1q4jk...k2uz', label: 'Dinner', block: 4_230_916, inputCount: 1, outputCount: 2, feeRate: 6.47, walletInputAmount: 150_000, walletOutputAmount: 59_588, locktime: 4_230_900, rbf: true }
];

export let receiveAddresses: ReceiveAddress[] = [
  { id: 7, address: 'tb1q8y4gk9c7sx2l5h3pj6n0d4u8v2w9zfepev8d', label: 'Invoice #104', created: 'Today, 14:20', status: 'used', derivationPath: "m/84'/1'/0'/0/7" },
  { id: 8, address: 'tb1q7s5dmj6gq0y8az4n2x9cp3lvrwku0ehkq5zn', label: 'July savings', created: 'Today, 15:08', status: 'awaiting', derivationPath: "m/84'/1'/0'/0/8" }
];

export const utxos: Utxo[] = [
  { outpoint: 'f7c42c16...a1ec:0', amount: 1_250_000, confirmations: 286, address: 'tb1q2la...p29a', label: 'Savings', frozen: false },
  { outpoint: 'c807a142...52ad:1', amount: 842_150, confirmations: 94, address: 'tb1q2la...p29a', label: 'Savings top-up', frozen: false },
  { outpoint: '12fed941...16ba:0', amount: 389_090, confirmations: 12, address: 'tb1q1jd...a04q', label: 'Refund', frozen: false }
];

export const shortSats = (sats: number) => new Intl.NumberFormat('en-US').format(sats);
export const btc = (sats: number) => (sats / 100_000_000).toFixed(8);
