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
const unlock = readFileSync(new URL('../../routes/unlock/+page.svelte', import.meta.url), 'utf8');
const activity = readFileSync(
  new URL('../../routes/activity/+page.svelte', import.meta.url),
  'utf8'
);
const coins = readFileSync(new URL('../../routes/coins/+page.svelte', import.meta.url), 'utf8');

describe('foreground wallet navigation', () => {
  it('focuses the selected wallet credential after the locked route finishes loading', () => {
    expect(unlock).toContain("credentialForm?.querySelector<HTMLInputElement>('input')?.focus()");
    expect(unlock).toContain('bind:this={credentialForm}');
    expect(unlock.indexOf('await tick()')).toBeLessThan(unlock.indexOf('.focus()'));
  });

  it('keeps automatic sync active across receive, send, and settings routes', () => {
    for (const route of ['/receive', '/send', '/multisig/receive', '/multisig/send']) {
      expect(appShell).toContain(`'${route}'`);
    }
    expect(appShell).not.toContain(
      'if (to && foregroundWalletRoutes.has(to.url.pathname)) liveSync?.stop();'
    );
    const paused = appShell.slice(
      appShell.indexOf('let syncPausedRoute'),
      appShell.indexOf('const showQuickActions')
    );
    expect(paused).not.toContain('foregroundWalletRoutes');
    expect(paused).not.toContain("'/settings'");
    expect(appShell).toContain('5_000');
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

  it('keeps automatic sync compact and reserves detailed progress for manual refresh', () => {
    expect(overview).toContain("syncStatus.source === 'bitcoin_core'");
    expect(overview).toContain("'Scanning Bitcoin Core history'");
    expect(overview).toContain("'Wallet sync progress'");
    expect(overview).toContain('let manualSyncDetailsVisible = $state(false)');
    expect(overview).toContain('manualSyncDetailsVisible = manual');
    expect(overview).toContain('if (manual) await walletShell.pauseAutomaticSync()');
    expect(overview).toContain('if (manual) walletShell.resumeAutomaticSync()');
    expect(overview).toContain('void sync(false)');
    expect(overview).toContain('onclick={() => sync(true)}');
    expect(overview).toContain(
      "{#if manualSyncDetailsVisible && syncStatus && (syncInProgress || syncStatus.state === 'failed')}"
    );
    expect(overview).toContain(
      "if (syncStatus?.state !== 'failed') manualSyncDetailsVisible = false"
    );
    expect(overview).toContain('syncStatusIsActive(syncStatus)');
    expect(overview).toContain('startSyncStatusPolling()');
    expect(overview).toContain('if (!syncing && !syncStatusIsActive(syncStatus)) return;');
    expect(unlock).toContain('walletShell.requestUnlockSync(selectedWalletId)');
    expect(overview).toContain('walletShell.consumeUnlockSync(selectedProfile.id)');
    expect(overview).not.toContain('setTimeout(resolve, 1_000)');
    expect(overview).toContain('syncAge(snapshot?.syncedAt ?? null, syncClock)');
    expect(overview).toContain("status.failureCode === 'invalid_node_config'");
    expect(overview).toContain("status.failureCode === 'node_syncing'");
    expect(overview).toContain("status.failureCode === 'node_history_unavailable'");
    expect(overview).toContain("status.failureCode === 'internal_error'");
    expect(overview).toContain('syncFailureDescription(syncStatus)');
  });

  it('gives coin freezing exclusive ownership before applying its local state', () => {
    const start = coins.indexOf('async function confirmFrozenState()');
    const end = coins.indexOf('function beginObservedReceiveClaim', start);
    const mutation = coins.slice(start, end);
    expect(mutation.indexOf('await walletShell.pauseAutomaticSync()')).toBeGreaterThan(-1);
    expect(mutation.indexOf('await walletShell.pauseAutomaticSync()')).toBeLessThan(
      mutation.indexOf('walletService.setCoinFrozen.bind(walletService)')
    );
    expect(mutation.indexOf('utxos = utxos.map')).toBeLessThan(
      mutation.indexOf('walletShell.resumeAutomaticSync()')
    );
  });

  it('starts the safe initial scan automatically and presents resumable progress', () => {
    expect(overview).toContain("initialScanMode = $state<'new' | 'birthday' | 'full'>('new')");
    expect(overview).toContain('let showManualScanOptions = $state(false)');
    expect(overview).toContain('let showAdvancedScanOptions = $state(false)');
    expect(overview).toContain("'New wallet · no earlier activity'");
    expect(overview).toContain("'Existing wallet · use a birthday block'");
    expect(overview).toContain("'Full history · safest'");
    expect(overview).toContain("'Address discovery options'");
    expect(overview).toContain('!snapshot?.syncedAt && nodeReady');
    expect(overview).toContain("page.url.searchParams.get('initial') === 'new'");
    expect(overview).toContain('void startInitialScan()');
    expect(overview).toContain(
      "href={nodeReady && savedRecoveryCanResume ? undefined : '/settings'}"
    );
    expect(overview).toContain("const credential = ''");
    expect(overview).toContain('walletService.fullRescan(credential)');
    expect(overview).toContain('recoveryStatus.processedBlocks');
    expect(overview).toContain('<Amount value={0} hidden={$discreetMode} />');
    expect(overview).toContain("'Never synced'");
  });

  it('checks the selected Mainnet wallet setup instead of assuming Mainnet is ready', () => {
    expect(overview).toContain("const isMainnet = defaultConfig.network === 'mainnet'");
    expect(overview).toContain('walletService.networkSetupSources()');
    expect(overview).not.toContain('isMainnet ? Promise.resolve([])');
    expect(overview).toContain(
      'if (isMainnet && nodeReady) await walletService.testNodeConnection()'
    );
    expect(overview).toContain("await goto('/settings?networkSetup=1')");
    expect(
      overview.indexOf('if (isMainnet && nodeReady) await walletService.testNodeConnection()')
    ).toBeLessThan(overview.indexOf('walletService.paymentDraft()'));
    expect(
      overview.indexOf('if (isMainnet && nodeReady) await walletService.testNodeConnection()')
    ).toBeLessThan(overview.indexOf('walletService.overview(selectedProfile.id)'));
  });

  it('does not start a second post-unlock scan after reattaching to an inherited scan', () => {
    expect(overview).toContain('if (syncStatusIsActive(syncStatus)) inheritedSyncObserved = true;');
    expect(overview).toMatch(
      /walletShell\.consumeUnlockSync\(selectedProfile\.id\)[\s\S]*!inheritedSyncObserved/
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
