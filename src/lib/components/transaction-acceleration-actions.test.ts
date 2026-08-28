import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const component = readFileSync(new URL('./TxDetailsModal.svelte', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');

describe('transaction acceleration actions', () => {
  it('uses the shared transaction modal for single-key and multisig RBF and CPFP links', () => {
    expect(component).toContain("multisig ? '/multisig/send' : '/send'");
    expect(component).toContain('accelerate=rbf');
    expect(component).toContain('accelerate=cpfp');
    expect(component).toContain("<ArrowUp size={15} />{translate($locale, 'Increase fee (RBF)')}");
    expect(component).toContain("<Layers size={15} />{translate($locale, 'Spend output (CPFP)')}");
  });

  it('offers sender-side RBF only for replaceable outgoing transactions', () => {
    expect(component).toContain("transaction.direction === 'sent'");
    expect(component).toContain('transaction.rbf === true');
    expect(component).toContain('{#if canIncreaseFee}<Button');
  });

  it('offers CPFP only when the transaction pays an output to this wallet', () => {
    expect(component).toContain('(transaction.walletOutputAmount ?? 0) > 0');
    expect(component).toContain('{#if canSpendOutput}<Button');
  });

  it('gives the two actions a responsive grid without shrinking their icons', () => {
    expect(component).toContain('class="psbt-actions transaction-acceleration-actions"');
    expect(appCss).toMatch(
      /\.transaction-acceleration-actions\s*\{[^}]*repeat\(auto-fit, minmax\(190px, 1fr\)\)/s
    );
    expect(appCss).toMatch(
      /\.transaction-acceleration-actions \.button > svg\s*\{[^}]*flex: 0 0 auto/s
    );
  });

  it('presents replacement lineage as a compact visual journey with optional explanation', () => {
    expect(component).toContain('class="transaction-lineage-journey"');
    expect(component).toContain("'Earlier transaction'");
    expect(component).toContain("'Newer transaction'");
    expect(component).toContain("'Why are both shown?'");
    expect(component).toContain('compactIdentifier(transaction.replaces ?? transaction.id, 8, 6)');
    expect(component).toContain(
      'compactIdentifier(transaction.replacedBy ?? transaction.id, 8, 6)'
    );
    expect(component).toContain('compactIdentifier(transaction.id)');
    expect(appCss).toMatch(/\.transaction-lineage-journey\s*\{[^}]*grid-template-columns/s);
  });
});
