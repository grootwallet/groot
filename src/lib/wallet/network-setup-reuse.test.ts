import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const nativeCommands = readFileSync(
  new URL('../../../src-tauri/src/wallet/profile_commands.rs', import.meta.url),
  'utf8'
);
const runtimeContract = readFileSync(new URL('./contracts/runtime.ts', import.meta.url), 'utf8');
const settings = readFileSync(
  new URL('../../routes/settings/+page.svelte', import.meta.url),
  'utf8'
);
const creationRoutes = [
  readFileSync(new URL('../../routes/welcome/+page.svelte', import.meta.url), 'utf8'),
  readFileSync(new URL('../../routes/hardware/new/+page.svelte', import.meta.url), 'utf8'),
  readFileSync(new URL('../../routes/multisig/new/+page.svelte', import.meta.url), 'utf8')
];

function nativeCommand(name: string): string {
  const start = nativeCommands.indexOf(`pub async fn ${name}`);
  expect(start).toBeGreaterThan(-1);
  const end = nativeCommands.indexOf('#[tauri::command]', start);
  return nativeCommands.slice(start, end === -1 ? nativeCommands.length : end);
}

describe('protected network setup reuse', () => {
  it('never returns node credentials to the webview', () => {
    const start = runtimeContract.indexOf('export type NetworkSetupSource');
    const end = runtimeContract.indexOf('\n};', start);
    const sourceDto = runtimeContract.slice(start, end);

    expect(sourceDto).toContain('walletId');
    expect(sourceDto).toContain('syncSource');
    expect(sourceDto).not.toMatch(/password|credential|nodeConfig/i);
  });

  it('revalidates the source and re-encrypts its RPC password for the destination wallet', () => {
    const source = nativeCommand('network_setup_adopt');

    expect(source).toContain('.is_unlocked(source)');
    expect(source).toContain('session.config != config');
    expect(source).toContain('checked_node_status(&client, config.clone())');
    expect(source).toContain('node_secret_path_for(&app, destination)');
    expect(source).toContain('credential.as_str()');
    expect(source).toContain('sync_source_path_for(&app, destination)');
  });

  it('offers the same default choice for software, hardware, and multisig creation', () => {
    for (const route of creationRoutes) {
      expect(route).toContain('let reuseNetworkSetup = $state(true)');
      expect(route).toContain('walletService.networkSetupSources()');
      expect(route).toContain('walletService.adoptNetworkSetup(');
      expect(route).toContain(
        'Copies its node and sync method. This wallet protects its own copy.'
      );
    }
  });

  it('lets existing wallets adopt the same setup from Settings', () => {
    expect(settings).toContain('Use an existing network setup');
    expect(settings).toContain('walletService.adoptNetworkSetup(');
    expect(settings).toContain('Wallet data stays separate.');
  });
});
