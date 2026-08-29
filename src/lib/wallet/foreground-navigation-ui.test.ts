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
const settings = readFileSync(
  new URL('../../routes/settings/+page.svelte', import.meta.url),
  'utf8'
);
const walletCore = readFileSync(
  new URL('../../../src-tauri/src/wallet.rs', import.meta.url),
  'utf8'
);
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

  it('keeps scans alive across read-only routes and cancels before exclusive routes or lock', () => {
    const navigationStart = appShell.indexOf('beforeNavigate(({ to }) =>');
    const navigationEnd = appShell.indexOf('afterNavigate(({ from }) =>', navigationStart);
    const navigation = appShell.slice(navigationStart, navigationEnd);
    expect(navigation).toContain('routeCancelsSync(to.url.pathname)');
    expect(navigation).toContain('walletService.cancelSync().catch(() => undefined)');
    const cancellationPolicyStart = appShell.indexOf('const routeCancelsSync =');
    const cancellationPolicyEnd = appShell.indexOf('const active =', cancellationPolicyStart);
    const cancellationPolicy = appShell.slice(cancellationPolicyStart, cancellationPolicyEnd);
    expect(cancellationPolicy).not.toContain("'/activity'");
    expect(cancellationPolicy).not.toContain("'/coins'");

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
    expect(overview).toContain('syncStatusIsActive(syncStatus)');
    expect(overview).toContain('startSyncStatusPolling()');
    expect(overview).toContain('syncAge(snapshot?.syncedAt ?? null, syncClock)');
  });

  it('does not start a second compact-filter scan after reattaching and never auto-starts one on mobile', () => {
    expect(overview).toContain('if (syncStatusIsActive(syncStatus)) inheritedSyncObserved = true;');
    expect(overview).toContain("syncSource.type === 'compact_filters' && !mobileRuntime");
    expect(overview).toContain('!inheritedSyncObserved');
  });

  it('routes mobile wallets to Bitcoin Core setup instead of attempting local or compact-filter sync', () => {
    expect(overview).toContain("syncSource?.type === 'bitcoin_core'");
    expect(overview).toContain("syncSource?.type === 'compact_filters'");
    expect(overview).toContain("nodeConfig?.backend.type === 'local_core'");
    expect(overview).toContain("await goto('/settings#network-services')");
    expect(overview).toContain("translate($locale, 'Set up wallet sync')");
    expect(overview).toContain(
      'Configure a trusted remote Bitcoin Core node before refreshing this wallet on mobile.'
    );
  });

  it('hides experimental compact filters on mobile and rejects hidden native entry points', () => {
    expect(settings).toContain("syncSourceType = mobileRuntime ? 'bitcoin_core' : syncSource.type");
    expect(settings).toContain('{#if !mobileRuntime}<button');
    expect(settings).toContain('Compact filters · Experimental');
    expect(settings).toContain("!mobileRuntime || source.syncSource.type === 'bitcoin_core'");
    expect(profileCommands).toContain('ensure_sync_source_supported_on_platform(&source)?');
    expect(profileCommands).toContain('ensure_sync_source_supported_on_platform(&sync_source)?');
    expect(walletCore).toContain('if cfg!(any(target_os = "ios", target_os = "android"))');
    expect(walletCore).toContain(
      'Compact-filter sync is experimental and unavailable on mobile. Configure Bitcoin Core instead.'
    );
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
