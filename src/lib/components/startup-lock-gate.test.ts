import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const shell = readFileSync(new URL('./AppShell.svelte', import.meta.url), 'utf8');

describe('startup wallet lock gate', () => {
  it('resolves the trusted session before mounting authenticated route content', () => {
    expect(shell).toContain(
      "let startupState = $state<'checking' | 'ready' | 'failed'>('checking')"
    );
    expect(shell).toContain('const selection = await walletService.session()');
    expect(shell).toContain("await goto('/unlock')");

    const gate = shell.indexOf("{#if startupState !== 'ready'}");
    const authenticatedBranch = shell.indexOf('{:else}', gate);
    const routeContent = shell.indexOf('{@render children?.()}', authenticatedBranch);
    expect(gate).toBeGreaterThan(-1);
    expect(authenticatedBranch).toBeGreaterThan(gate);
    expect(routeContent).toBeGreaterThan(authenticatedBranch);
  });

  it('shows no wallet data when startup session verification fails', () => {
    expect(shell).toContain("startupState = 'failed'");
    expect(shell).toContain('Groot could not verify the wallet lock state.');
    expect(shell).toContain('onclick={resolveStartupRoute}>Retry</button>');
  });
});
