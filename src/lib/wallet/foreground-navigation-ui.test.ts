import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appShell = readFileSync(new URL('../components/AppShell.svelte', import.meta.url), 'utf8');
const profileCommands = readFileSync(
  new URL('../../../src-tauri/src/wallet/profile_commands.rs', import.meta.url),
  'utf8'
);
const multisigCommands = readFileSync(
  new URL('../../../src-tauri/src/wallet/multisig_setup_commands.rs', import.meta.url),
  'utf8'
);
const overview = readFileSync(new URL('../../routes/+page.svelte', import.meta.url), 'utf8');
const activity = readFileSync(
  new URL('../../routes/activity/+page.svelte', import.meta.url),
  'utf8'
);
const coins = readFileSync(new URL('../../routes/coins/+page.svelte', import.meta.url), 'utf8');

describe('foreground wallet navigation', () => {
  it('cancels automatic sync before entering receive and send routes', () => {
    for (const route of ['/receive', '/send', '/multisig/receive', '/multisig/send']) {
      expect(appShell).toContain(`'${route}'`);
    }
    expect(appShell).toContain(
      'if (to && foregroundWalletRoutes.has(to.url.pathname)) liveSync?.stop();'
    );
    expect(appShell).toContain('foregroundWalletRoutes.has(page.url.pathname)');
  });

  it('cancels any native sync before navigation or an automatic-lock route change', () => {
    const navigationStart = appShell.indexOf('beforeNavigate(({ to }) =>');
    const navigationEnd = appShell.indexOf('afterNavigate(({ from }) =>', navigationStart);
    expect(appShell.slice(navigationStart, navigationEnd)).toContain(
      'walletService.cancelSync().catch(() => undefined)'
    );

    const monitorStart = appShell.indexOf('sessionMonitor = createSessionMonitor(');
    const monitorEnd = appShell.indexOf('sessionMonitor.start()', monitorStart);
    const monitor = appShell.slice(monitorStart, monitorEnd);
    expect(monitor.indexOf('walletService.cancelSync().catch(() => undefined)')).toBeGreaterThan(
      -1
    );
    expect(monitor.indexOf('walletService.cancelSync().catch(() => undefined)')).toBeLessThan(
      monitor.indexOf("goto('/unlock')")
    );
  });

  it('treats cancellation and expiry as navigation instead of stacked route failures', () => {
    expect(overview).toContain("cause.code === 'sync_cancelled'");
    expect(overview).toContain("cause.code === 'wallet_locked'");
    expect(coins).toContain("cause.code === 'sync_cancelled'");
    expect(coins).toContain("cause.code === 'wallet_locked'");
    expect(activity).toContain("cause.code === 'wallet_locked'");
  });

  it('shows native Bitcoin Core scan progress on Overview', () => {
    expect(overview).toContain("syncStatus.source === 'bitcoin_core'");
    expect(overview).toContain("'Scanning Bitcoin Core history'");
    expect(overview).toContain("'Wallet sync progress'");
  });

  it('runs contended snapshot reads away from the native window thread', () => {
    expect(profileCommands).toContain('pub async fn wallet_snapshot(app: AppHandle)');
    expect(multisigCommands).toContain('pub async fn multisig_snapshot(app: AppHandle)');
    expect(multisigCommands).toContain('pub async fn multisig_wallet(app: AppHandle)');
  });

  it('does not expose a new wallet kind before native selection commits', () => {
    const start = appShell.indexOf('async function selectWallet(walletId: string)');
    const end = appShell.indexOf('provideWalletShellContext', start);
    const selection = appShell.slice(start, end);
    const nativeSelection = selection.indexOf('await walletService.selectWallet(walletId)');
    const shellSelection = selection.indexOf('selectedWalletId = selection.profile.id');
    expect(nativeSelection).toBeGreaterThan(-1);
    expect(shellSelection).toBeGreaterThan(nativeSelection);
    expect(selection).not.toContain('selectedWalletId = walletId');
    expect(appShell).toContain("{#key `${selectedWalletId ?? 'none'}:${page.url.pathname}`}");
  });

  it('stops automatic sync before selecting another wallet', () => {
    const start = appShell.indexOf('async function selectWallet(walletId: string)');
    const end = appShell.indexOf('provideWalletShellContext', start);
    const selection = appShell.slice(start, end);
    expect(selection.indexOf('liveSync?.stop()')).toBeGreaterThan(-1);
    expect(selection.indexOf('liveSync?.stop()')).toBeLessThan(
      selection.indexOf('await walletService.selectWallet(walletId)')
    );
  });
});
