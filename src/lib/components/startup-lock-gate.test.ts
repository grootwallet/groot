import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const shell = readFileSync(new URL('./AppShell.svelte', import.meta.url), 'utf8');
const brandLockup = readFileSync(new URL('./BrandLockup.svelte', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');

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
    expect(shell).toContain("{translate($locale, 'Retry')}</button");
  });

  it('holds the native launch mark briefly without slowing the browser prototype', () => {
    expect(shell).toContain('const minimumStartupGateMs = isPrototypeWallet ? 0 : 1_800');
    expect(shell).toContain('await holdStartupGate()');
    expect(shell).toContain('<BrandLockup animated />');
    expect(brandLockup).toContain('animation: brand-lockup-reveal 900ms');
    expect(brandLockup).toContain('clip-path: inset(0 100% 0 0)');
    expect(brandLockup).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('acknowledges route navigation immediately without overriding reduced motion', () => {
    expect(shell).toContain('navigationPending = Boolean(to && to.url.href !== page.url.href)');
    expect(shell).toContain('class:navigation-pending={navigationPending}');
    expect(shell).toContain('class="navigation-progress" aria-hidden="true"');
    expect(appCss).toContain('.app-shell.navigation-pending .navigation-progress');
    expect(appCss).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
