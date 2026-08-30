import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const rust = readFileSync(
  new URL('../../../src-tauri/src/wallet/diagnostics.rs', import.meta.url),
  'utf8'
);
const route = readFileSync(
  new URL('../../routes/diagnostics/+page.svelte', import.meta.url),
  'utf8'
);
const shell = readFileSync(new URL('../components/AppShell.svelte', import.meta.url), 'utf8');
const settings = readFileSync(
  new URL('../../routes/settings/+page.svelte', import.meta.url),
  'utf8'
);
const profileCommands = readFileSync(
  new URL('../../../src-tauri/src/wallet/profile_commands.rs', import.meta.url),
  'utf8'
);
const multisigCommands = readFileSync(
  new URL('../../../src-tauri/src/wallet/multisig_setup_commands.rs', import.meta.url),
  'utf8'
);

describe('diagnostic event boundary', () => {
  it('uses a native fixed-field schema and strict error allowlist', () => {
    expect(rust).toContain('pub struct DiagnosticRecordDto');
    expect(rust).toContain('fn safe_error_code(code: &str)');
    expect(rust).toContain('_ => "internal_error"');
    expect(rust).not.toMatch(
      /pub struct DiagnosticRecordDto[\s\S]*?(credential|mnemonic|seed|descriptor|psbt|txid|outpoint|device_id|rpc_url)\s*:/
    );
  });

  it('keeps diagnostics accessible without unlocking wallet data', () => {
    expect(shell).toContain("page.url.pathname === '/diagnostics'");
    expect(shell).toContain('locked={restrictedUtilityRoute}');
    expect(shell).not.toContain('href="/diagnostics"');
    expect(settings).toContain('href="/diagnostics"');
    expect(settings.indexOf('href="/diagnostics"')).toBeLessThan(
      settings.indexOf("translate($locale, 'Wallet deletion')")
    );
    expect(route).toContain('walletService.diagnostics()');
    expect(route).not.toContain('walletService.snapshot()');
  });

  it('records receive creation and discard without address or label values', () => {
    expect(rust).toContain('ReceiveAddressDiscarded');
    expect(profileCommands).toContain('diagnostics::DiagnosticEventKind::ReceiveAddressDiscarded');
    expect(multisigCommands).toContain('diagnostics::DiagnosticEventKind::ReceiveAddressDiscarded');
    expect(profileCommands).toContain('item_count: u32::try_from(response.labels.len()).ok()');
    expect(multisigCommands).toContain('item_count: u32::try_from(response.labels.len()).ok()');
  });

  it('offers deterministic native CSV and JSON exports', () => {
    expect(route).toContain('exportDiagnostics(format)');
    expect(route).toContain("exportLog('csv')");
    expect(route).toContain("exportLog('json')");
    expect(route).toContain('walletService.revealSavedFile(result.revealToken!)');
    expect(route).toContain('label: result.revealLabel');
    expect(rust).toContain('csv_export_is_deterministic_and_quotes_every_field');
  });

  it('keeps table dividers continuous across the safe-context column', () => {
    expect(route).toContain('<div class="diagnostic-context">');
    expect(route).not.toMatch(/td:last-child\s*\{[^}]*display:\s*flex/s);
  });
});
