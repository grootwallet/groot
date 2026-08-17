import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const component = readFileSync(new URL('./TxDetailsModal.svelte', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');

describe('transaction acceleration actions', () => {
  it('uses the shared transaction modal for single-key and multisig RBF and CPFP links', () => {
    expect(component).toContain("multisig ? '/multisig/send' : '/send'");
    expect(component).toContain('accelerate=rbf');
    expect(component).toContain('accelerate=cpfp');
    expect(component).toContain('<ArrowUp size={15} />Increase fee');
    expect(component).toContain('<Layers size={15} />Spend output (CPFP)');
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
});
