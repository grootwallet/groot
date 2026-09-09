import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const component = readFileSync(new URL('./NetworkStatus.svelte', import.meta.url), 'utf8');

describe('locked network status', () => {
  it('loads saved non-secret setup before branching into unlocked live checks', () => {
    const refreshStart = component.indexOf('async function refresh()');
    const refreshEnd = component.indexOf('\n  function show()', refreshStart);
    const refresh = component.slice(refreshStart, refreshEnd);

    expect(refresh.indexOf('walletService.nodeConfig()')).toBeGreaterThan(-1);
    expect(refresh.indexOf('walletService.syncSource()')).toBeGreaterThan(-1);
    expect(refresh.indexOf('walletService.nodeConfig()')).toBeLessThan(
      refresh.indexOf('if (!locked)')
    );
    expect(refresh.indexOf('walletService.syncSource()')).toBeLessThan(
      refresh.indexOf('if (!locked)')
    );
    expect(component).toContain("translate($locale, 'Unlock to check')");
  });

  it('keeps credentialed live checks behind unlock', () => {
    const unlockedBranch = component.slice(component.indexOf('if (!locked)'));
    expect(unlockedBranch).toContain('walletService.estimateFees()');
    expect(unlockedBranch).toContain('walletService.testNodeConnection()');
    expect(component).toContain('Node credentials remain sealed until a wallet is unlocked.');
  });
});
