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
    expect(monitor).not.toContain('cancelFullRescan');

    const manualLockStart = appShell.indexOf('async function lockSelectedWallet()');
    const manualLockEnd = appShell.indexOf('async function refreshSetupDraft()', manualLockStart);
    expect(appShell.slice(manualLockStart, manualLockEnd)).not.toContain('cancelFullRescan');
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
    expect(overview).toContain("status.failureCode === 'invalid_node_config'");
    expect(overview).toContain("status.failureCode === 'internal_error'");
    expect(overview).toContain('syncFailureDescription(syncStatus)');
  });

  it('requires an explicit first-scan start and presents resumable recovery progress', () => {
    expect(overview).toContain("initialScanMode = $state<'new' | 'birthday' | 'full'>('new')");
    expect(overview).toContain('let showManualScanOptions = $state(false)');
    expect(overview).toContain('let showAdvancedScanOptions = $state(false)');
    expect(overview).toContain("'New wallet · no earlier activity'");
    expect(overview).toContain("'Existing wallet · use a birthday block'");
    expect(overview).toContain("'Full history · safest'");
    expect(overview).toContain("'Address discovery options'");
    expect(overview).toContain('!snapshot?.syncedAt && nodeReady');
    expect(overview).toContain("href={nodeReady ? undefined : '/settings'}");
    expect(overview).toContain('walletService.fullRescan(credential)');
    expect(overview).toContain('recoveryStatus.processedBlocks');
    expect(overview).toContain('<Amount value={0} hidden={$discreetMode} />');
    expect(overview).toContain("'Never synced'");
  });

  it('does not start a second compact-filter scan after reattaching to an inherited scan', () => {
    expect(overview).toContain('if (syncStatusIsActive(syncStatus)) inheritedSyncObserved = true;');
    expect(overview).toContain(
      "if (syncSource.type === 'compact_filters' && !inheritedSyncObserved) void sync(false);"
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
