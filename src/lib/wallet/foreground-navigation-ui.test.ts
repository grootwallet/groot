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

  it('runs contended snapshot reads away from the native window thread', () => {
    expect(profileCommands).toContain('pub async fn wallet_snapshot(app: AppHandle)');
    expect(multisigCommands).toContain('pub async fn multisig_snapshot(app: AppHandle)');
    expect(multisigCommands).toContain('pub async fn multisig_wallet(app: AppHandle)');
  });
});
