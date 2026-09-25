import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyRuntimeNetwork, defaultConfig, SWITCHABLE_NETWORKS } from '$lib/config';

const settings = readFileSync(
  new URL('../../routes/settings/+page.svelte', import.meta.url),
  'utf8'
);
const adapter = readFileSync(new URL('./tauri.ts', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../components/AppShell.svelte', import.meta.url), 'utf8');
const welcome = readFileSync(new URL('../../routes/welcome/+page.svelte', import.meta.url), 'utf8');
const native = readFileSync(new URL('../../../src-tauri/src/lib.rs', import.meta.url), 'utf8');
const nativeNetwork = readFileSync(
  new URL('../../../src-tauri/src/build_network.rs', import.meta.url),
  'utf8'
);

describe('restart-bound Bitcoin network switching', () => {
  it('exposes only the requested runtime choices', () => {
    expect(SWITCHABLE_NETWORKS).toEqual(['regtest', 'testnet4', 'mainnet']);
  });

  it('requires an explicit Settings confirmation and explains isolation', () => {
    expect(settings).toContain('{#each SWITCHABLE_NETWORKS as candidate}');
    expect(settings).toContain("networkSwitchTarget === 'mainnet'");
    expect(settings).toContain('walletService.switchNetwork(networkSwitchTarget)');
    expect(settings).toContain(
      'Switching restarts Groot. Each network keeps separate wallets and settings.'
    );
    expect(settings).toContain("loadingLabel={translate($locale, 'Restarting…')}");
    expect(settings).toContain('walletService.session()');
    expect(settings).toContain("translate($locale, '{walletName} settings'");
    expect(welcome).toContain('class="onboarding-settings"');
    expect(welcome).toContain('href="/settings"');
  });

  it('applies native network endpoints before wallet routes mount', () => {
    const original = { ...defaultConfig };
    applyRuntimeNetwork('testnet4');
    expect(defaultConfig).toEqual({
      network: 'testnet4',
      esploraUrl: 'https://mempool.space/testnet4/api',
      explorerUrl: 'https://mempool.space/testnet4'
    });
    applyRuntimeNetwork('mainnet');
    expect(defaultConfig).toEqual({
      network: 'mainnet',
      esploraUrl: null,
      explorerUrl: 'https://mempool.space'
    });
    applyRuntimeNetwork(original.network);
  });

  it('lets native startup authoritatively apply the active network before routes mount', () => {
    const runtime = shell.indexOf('const runtime = await walletService.runtimePlatform()');
    const identityCheck = shell.indexOf(
      'runtime.networkSwitching !== networkSwitchingBuild',
      runtime
    );
    const applied = shell.indexOf('applyRuntimeNetwork(runtime.network)');
    const ready = shell.indexOf("startupState = 'ready'", applied);
    expect(runtime).toBeGreaterThan(-1);
    expect(identityCheck).toBeGreaterThan(runtime);
    expect(applied).toBeGreaterThan(identityCheck);
    expect(ready).toBeGreaterThan(applied);
    expect(adapter).toContain("command<void>('bitcoin_network_switch'");
    expect(native).toContain('build_network::save_selection_at(&root, selected)');
    expect(native).toContain('app.request_restart()');
    expect(native.indexOf('initialize_network(app.handle())')).toBeLessThan(
      native.indexOf('ProcessLock::acquire_for_app(app.handle())')
    );
    expect(nativeNetwork).toContain('root.join("networks").join(name_for(selected))');
  });
});
