import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const modal = readFileSync(new URL('../components/TxDetailsModal.svelte', import.meta.url), 'utf8');
const adapter = readFileSync(new URL('./tauri.ts', import.meta.url), 'utf8');
const singleSend = readFileSync(new URL('../../routes/send/+page.svelte', import.meta.url), 'utf8');
const multisigSend = readFileSync(
  new URL('../../routes/multisig/send/+page.svelte', import.meta.url),
  'utf8'
);

describe('transaction explorer opening', () => {
  it('routes packaged clicks through the wallet boundary instead of a webview anchor', () => {
    expect(modal).toContain('walletService.openTransactionExplorer(transaction.id)');
    expect(modal).toContain("translate($locale, 'Could not open explorer')");
    expect(modal).toContain('role="alert"');
    expect(modal).not.toMatch(/<a[^>]+target="_blank"/);
    expect(adapter).toContain("command<void>('transaction_explorer_open', { txid })");
  });

  it('offers the same guarded explorer and copy controls after every send broadcast', () => {
    for (const route of [singleSend, multisigSend]) {
      expect(route).toContain('transactionExplorerUrl(defaultConfig.network, txid)');
      expect(route).toContain('walletService.openTransactionExplorer(txid)');
      expect(route).toContain("await copyText(txid, 'identifier')");
      expect(route).toContain('class="hash-box"');
      expect(route).toContain("translate($locale, 'View on mempool.space')");
      expect(route).not.toMatch(/<a[^>]+target="_blank"/);
    }
  });
});
