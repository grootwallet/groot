import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const shell = readFileSync(new URL('./AppShell.svelte', import.meta.url), 'utf8');
const buildIdentity = readFileSync(new URL('./BuildIdentity.svelte', import.meta.url), 'utf8');
const brandLockup = readFileSync(new URL('./BrandLockup.svelte', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const settings = readFileSync(
  new URL('../../routes/settings/+page.svelte', import.meta.url),
  'utf8'
);
const buildScript = readFileSync(new URL('../../../src-tauri/build.rs', import.meta.url), 'utf8');

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

  it('shows the native version and commit before wallet unlock', () => {
    const runtime = shell.indexOf('const runtime = await walletService.runtimePlatform()');
    const session = shell.indexOf('const selection = await walletService.session()');
    expect(runtime).toBeGreaterThan(-1);
    expect(session).toBeGreaterThan(runtime);
    expect(shell).toContain('runtime.version !== APP_VERSION');
    expect(shell).toContain('<BuildIdentity runtime={runtimeIdentity} placement="sidebar" />');
    expect(shell).toContain(
      '{#if onboardingRoute}<BuildIdentity runtime={runtimeIdentity} placement="onboarding" />{/if}'
    );
    expect(settings).toContain('<BuildIdentity placement="settings" />');
    expect(buildIdentity).toContain("'Groot v{version} · {commit}'");
    expect(buildIdentity).toContain("await copyText(identity, 'build-information')");
    expect(buildIdentity).toContain("aria-label={translate($locale, 'Copy build information')}");
    expect(buildIdentity).toContain("copyState = 'failed'");
    expect(appCss).toContain('.build-identity button:focus-visible');
    expect(appCss).toContain('.build-identity-onboarding');
    expect(buildIdentity).toContain("commit.endsWith('-dirty') ? '-dirty' : ''");
    expect(buildScript).toContain(
      'GROOT_BUILD_COMMIT does not match the checked-out repository commit'
    );
    expect(buildScript).toContain('A release build requires an exact repository commit identity');
    expect(buildScript).toContain('A release build requires a clean source checkout');
    expect(buildScript).toContain('watch_repository_sources();');
    expect(buildScript).toContain('"ls-files",');
    expect(buildScript).toContain('"--others",');
    expect(buildScript).toContain('"--exclude-standard",');
    expect(buildScript).toContain('"src-tauri/capabilities"');
    expect(buildScript).toContain('directories.insert(encoded.into_owned())');
  });

  it('keeps global Settings and public network status available while locked', () => {
    expect(shell).toContain("let settingsRoute = $derived(page.url.pathname === '/settings')");
    expect(shell).toContain('!settingsRoute &&');
    expect(shell).toContain('locked={walletLocked}');
    expect(shell).toContain('class="locked-settings-link"');
    expect(settings).toContain('walletService.session()');
    expect(settings).toContain(
      '{#if walletUnlocked}<section class="settings-group wallet-details">'
    );
    expect(settings).toContain(
      'Appearance and Bitcoin network remain available while your wallet is locked.'
    );
    expect(settings).toContain('Wallet-specific network details are locked');
    expect(appCss).toContain('.locked-settings-link:focus-visible');
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
