import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const profileCommands = readFileSync(
  new URL('../../../src-tauri/src/wallet/profile_commands.rs', import.meta.url),
  'utf8'
);
const multisigCommands = readFileSync(
  new URL('../../../src-tauri/src/wallet/multisig_setup_commands.rs', import.meta.url),
  'utf8'
);
const multisigProposalCommands = readFileSync(
  new URL('../../../src-tauri/src/wallet/multisig_proposal_commands.rs', import.meta.url),
  'utf8'
);
const transactionCommands = readFileSync(
  new URL('../../../src-tauri/src/wallet/transaction_commands.rs', import.meta.url),
  'utf8'
);
const hardwareCommands = readFileSync(
  new URL('../../../src-tauri/src/wallet/hardware_commands.rs', import.meta.url),
  'utf8'
);
const walletCore = readFileSync(
  new URL('../../../src-tauri/src/wallet.rs', import.meta.url),
  'utf8'
);

function commandSource(source: string, command: string): string {
  const start = source.indexOf(`pub async fn ${command}`);
  expect(start, `${command} must remain an asynchronous native command`).toBeGreaterThan(-1);
  const nextCommand = source.indexOf('#[tauri::command]', start);
  return source.slice(start, nextCommand === -1 ? source.length : nextCommand);
}

describe('native command scheduling', () => {
  it.each([
    ['wallet_select', profileCommands],
    ['wallet_sync', profileCommands],
    ['wallet_full_rescan', profileCommands],
    ['wallet_notifications', profileCommands],
    ['wallet_notifications_ack', profileCommands],
    ['multisig_sync', multisigCommands],
    ['tx_proposals', transactionCommands],
    ['multisig_proposals', multisigProposalCommands],
    ['external_signer_proposals', hardwareCommands],
    ['hardware_health_checks', hardwareCommands],
    ['multisig_signer_policy_verifications', hardwareCommands],
    ['multisig_create', multisigProposalCommands],
    ['multisig_recovery_create', multisigProposalCommands],
    ['network_setup_adopt', profileCommands],
    ['mainnet_core_admit', profileCommands],
    ['node_config_save', profileCommands],
    ['node_connection_test', profileCommands]
  ])('%s keeps blocking disk and RPC work off the native UI thread', (command, source) => {
    expect(commandSource(source, command)).toContain('tauri::async_runtime::spawn_blocking');
  });

  it('node saving cancels automatic sync before waiting for the wallet-operation lock', () => {
    const source = commandSource(profileCommands, 'node_config_save');
    expect(source.indexOf('cancel_foreground_sync(&state)?')).toBeGreaterThan(-1);
    expect(source.indexOf('cancel_foreground_sync(&state)?')).toBeLessThan(
      source.indexOf('operation_guard(&state)?')
    );
  });

  it('network setup reuse cancels automatic sync before waiting for the wallet-operation lock', () => {
    const source = commandSource(profileCommands, 'network_setup_adopt');
    expect(source.indexOf('cancel_foreground_sync(&state)?')).toBeGreaterThan(-1);
    expect(source.indexOf('cancel_foreground_sync(&state)?')).toBeLessThan(
      source.indexOf('operation_guard(&state)?')
    );
  });

  it('wallet switching cancels automatic sync before waiting for the wallet-operation lock', () => {
    const source = commandSource(profileCommands, 'wallet_select');
    expect(source.indexOf('cancel_foreground_sync(&state)?')).toBeGreaterThan(-1);
    expect(source.indexOf('cancel_foreground_sync(&state)?')).toBeLessThan(
      source.indexOf('operation_guard(&state)?')
    );
  });

  it('keeps the Core network scan outside the short SQLite write transaction', () => {
    const start = walletCore.indexOf('fn sync_wallet_with_core(');
    const end = walletCore.indexOf('fn sync_wallet_with_compact_filters(', start);
    const source = walletCore.slice(start, end);
    expect(source.indexOf('emitter.mempool()')).toBeGreaterThan(-1);
    expect(source.indexOf('emitter.mempool()')).toBeLessThan(source.indexOf('db.transaction()'));
  });

  it('authenticates a full rescan under the operation lock but scans after that scope ends', () => {
    const source = commandSource(profileCommands, 'wallet_full_rescan');
    const guard = source.indexOf('let _operation = operation_guard(&state)?');
    const scan = source.indexOf('full_rescan_loaded_wallet(');
    const setupScopeEnd = source.lastIndexOf('};', scan);
    expect(guard).toBeGreaterThan(-1);
    expect(setupScopeEnd).toBeGreaterThan(guard);
    expect(scan).toBeGreaterThan(setupScopeEnd);
  });
});
