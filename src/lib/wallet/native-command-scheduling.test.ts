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
    ['wallet_notifications', profileCommands],
    ['wallet_notifications_ack', profileCommands],
    ['multisig_sync', multisigCommands],
    ['tx_proposals', transactionCommands],
    ['multisig_proposals', multisigProposalCommands],
    ['external_signer_proposals', hardwareCommands],
    ['multisig_create', multisigProposalCommands],
    ['multisig_recovery_create', multisigProposalCommands],
    ['network_setup_adopt', profileCommands],
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
});
