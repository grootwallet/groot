import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const profileCommands =
  readFileSync(
    new URL('../../../src-tauri/src/wallet/profile_commands.rs', import.meta.url),
    'utf8'
  ) +
  '\n' +
  readFileSync(
    new URL('../../../src-tauri/src/wallet/recovery_commands.rs', import.meta.url),
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
const walletCore =
  readFileSync(new URL('../../../src-tauri/src/wallet.rs', import.meta.url), 'utf8') +
  '\n' +
  readFileSync(new URL('../../../src-tauri/src/wallet/profiles.rs', import.meta.url), 'utf8') +
  '\n' +
  readFileSync(
    new URL('../../../src-tauri/src/wallet/notification_delivery.rs', import.meta.url),
    'utf8'
  );
const coordinationCommands = readFileSync(
  new URL('../../../src-tauri/src/wallet/coordination_commands.rs', import.meta.url),
  'utf8'
);

function commandSource(source: string, command: string): string {
  const start = source.indexOf(`pub async fn ${command}(`);
  expect(start, `${command} must remain an asynchronous native command`).toBeGreaterThan(-1);
  const nextCommand = source.indexOf('#[tauri::command]', start);
  return source.slice(start, nextCommand === -1 ? source.length : nextCommand);
}

function synchronousCommandSource(source: string, command: string): string {
  const start = source.indexOf(`pub fn ${command}`);
  expect(start, `${command} must remain a native command`).toBeGreaterThan(-1);
  const nextCommand = source.indexOf('#[tauri::command]', start);
  return source.slice(start, nextCommand === -1 ? source.length : nextCommand);
}

describe('native command scheduling', () => {
  it.each([
    profileCommands,
    multisigCommands,
    multisigProposalCommands,
    transactionCommands,
    hardwareCommands,
    walletCore,
    coordinationCommands
  ])('keeps every serialized command off the main thread, including cancellation', (source) => {
    const commands = source.split('#[tauri::command]').slice(1);
    for (const command of commands) {
      const body = command.slice(0, command.indexOf('\n}') + 2);
      if (!body.includes('operation_guard(')) continue;
      expect(body).toMatch(/pub async fn /);
      expect(body.indexOf('tauri::async_runtime::spawn_blocking')).toBeGreaterThan(-1);
      expect(body.indexOf('operation_guard(')).toBeGreaterThan(
        body.indexOf('tauri::async_runtime::spawn_blocking')
      );
    }
  });

  it('lists only public setup availability independently of the selected wallet lock', () => {
    const source = synchronousCommandSource(profileCommands, 'network_setup_sources');
    expect(source).not.toContain('require_unlocked');
    expect(source).toContain('unlocked.is_unlocked(profile.id)');
    expect(source).toContain('session.config == config');
    // Mobile source eligibility is protected by the same per-profile unlock;
    // locked availability still exposes no source settings or credentials.
    expect(source.indexOf('unlocked.is_unlocked(profile.id)')).toBeLessThan(
      source.indexOf('read_sync_source_for')
    );
    expect(source).toContain('ensure_sync_source_supported_on_platform');
    const dto = profileCommands.slice(
      profileCommands.indexOf('pub struct NetworkSetupSource'),
      profileCommands.indexOf('pub struct SoftwareWalletCreation')
    );
    expect(dto).not.toContain('sync_source');
    expect(dto).not.toContain('password');
    expect(profileCommands).toContain(
      'authorize_wallet_session(state, source, false, registry.inactivity_timeout_minutes)?'
    );
  });

  it.each(['multisig_create', 'multisig_recovery_create'])(
    '%s rejects duplicates before any protected network copy',
    (command) => {
      const source = commandSource(multisigProposalCommands, command);
      const duplicateCheck = source.indexOf('find_exact_descriptor_profile(');
      expect(duplicateCheck).toBeGreaterThan(-1);
      expect(duplicateCheck).toBeLessThan(source.indexOf('prepare_profile_directory('));
      expect(source).toContain('require_requested_network_setup(');
    }
  );
  it.each(['node_config', 'wallet_sync_source'])(
    '%s exposes only saved non-secret network configuration while locked',
    (command) => {
      const source = synchronousCommandSource(profileCommands, command);
      expect(source).not.toContain('require_unlocked');
      expect(source).toMatch(/read_(node_config|sync_source)\(&app\)/);
    }
  );

  it.each([
    ['multisig_acknowledge_coldcard_policy', walletCore],
    ['wallet_reset_regtest', walletCore],
    ['wallet_inactivity_timeout_save', profileCommands],
    ['wallet_cancel_onboarding', profileCommands],
    ['address_discard', profileCommands],
    ['wallet_sync_source_save', profileCommands],
    ['multisig_setup_draft', multisigCommands],
    ['multisig_setup_draft_save', multisigCommands],
    ['multisig_setup_draft_discard', multisigCommands],
    ['multisig_signer_rename', multisigCommands],
    ['multisig_export', multisigCommands],
    ['multisig_export_bsms', multisigCommands],
    ['multisig_recover_bsms', multisigCommands],
    ['multisig_recovery_drill', multisigCommands],
    ['multisig_recovery_drill_status', multisigCommands],
    ['multisig_recover', multisigCommands],
    ['multisig_address_claim_observed', multisigCommands],
    ['multisig_address_discard', multisigCommands],
    ['multisig_policy_renewal_prepare', multisigProposalCommands],
    ['multisig_delayed_spend_prepare', multisigProposalCommands],
    ['multisig_proposal_import', multisigProposalCommands],
    ['multisig_proposal_discard_signature', multisigProposalCommands],
    ['multisig_proposal_cancel', multisigProposalCommands],
    ['tx_proposal_cancel', transactionCommands],
    ['external_signer_create', hardwareCommands],
    ['external_signer_export_descriptor', hardwareCommands],
    ['external_signer_proposal_import', hardwareCommands],
    ['external_signer_proposal_discard_signature', hardwareCommands],
    ['external_signer_proposal_cancel', hardwareCommands],
    ...[
      'fees_estimate',
      'wallet_generate_mnemonic',
      'wallet_create',
      'wallet_recover',
      'wallet_verify_backup',
      'wallet_reveal_and_verify_backup'
    ].map((name) => [name, profileCommands]),
    ['wallet_lock', profileCommands],
    ['wallet_rename', profileCommands],
    ['wallet_select', profileCommands],
    ['address_create', profileCommands],
    ['wallet_sync', profileCommands],
    ['recovery_scan_status', profileCommands],
    ['recovery_scan_settings', profileCommands],
    ['recovery_scan_settings_save', profileCommands],
    ['wallet_full_rescan_cancel', profileCommands],
    ['coin_set_frozen', profileCommands],
    ['multisig_coin_set_frozen', profileCommands],
    ['wallet_full_rescan', profileCommands],
    ['wallet_notifications', profileCommands],
    ['wallet_notifications_ack', profileCommands],
    ['multisig_sync', multisigCommands],
    ['multisig_address_create', multisigCommands],
    ['tx_proposals', transactionCommands],
    ['tx_prepare', transactionCommands],
    ['tx_acceleration_prepare', transactionCommands],
    ['multisig_acceleration_prepare', transactionCommands],
    ['tx_max_spend', transactionCommands],
    ['coin_selection_preview', walletCore],
    ['multisig_coin_selection_preview', walletCore],
    ['rbf_acceleration_quote', transactionCommands],
    ['cpfp_acceleration_quote', transactionCommands],
    ['external_signer_wallet', hardwareCommands],
    ['tx_sign_and_broadcast', transactionCommands],
    ['multisig_proposals', multisigProposalCommands],
    ['multisig_proposal_broadcast', multisigProposalCommands],
    ['external_signer_proposals', hardwareCommands],
    ['external_signer_proposal_broadcast', hardwareCommands],
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

  it.each([
    ['tx_sign_and_broadcast', transactionCommands],
    ['external_signer_proposal_broadcast', hardwareCommands],
    ['multisig_proposal_broadcast', multisigProposalCommands]
  ])('%s preserves the accepted outcome around all subsequent persistence', (command, source) => {
    const body = commandSource(source, command);
    const broadcast = body.indexOf('let txid = broadcast_transaction(');
    const accepted = body.indexOf('Ok(accepted_broadcast_result(txid, || {');
    expect(broadcast).toBeGreaterThan(-1);
    expect(accepted).toBeGreaterThan(broadcast);
    expect(body.slice(broadcast, accepted)).not.toContain('db.transaction()');
    expect(body).not.toContain('Ok(BroadcastResultDto {');
  });

  it.each([
    ['multisig_acknowledge_coldcard_policy', walletCore],
    ['wallet_reset_regtest', walletCore],
    ['wallet_inactivity_timeout_save', profileCommands],
    ['address_discard', profileCommands],
    ['wallet_sync_source_save', profileCommands],
    ['multisig_signer_rename', multisigCommands],
    ['multisig_export', multisigCommands],
    ['multisig_export_bsms', multisigCommands],
    ['multisig_recover_bsms', multisigCommands],
    ['multisig_recovery_drill', multisigCommands],
    ['multisig_recovery_drill_status', multisigCommands],
    ['multisig_recover', multisigCommands],
    ['multisig_address_claim_observed', multisigCommands],
    ['multisig_address_discard', multisigCommands],
    ['multisig_policy_renewal_prepare', multisigProposalCommands],
    ['multisig_delayed_spend_prepare', multisigProposalCommands],
    ['multisig_proposal_import', multisigProposalCommands],
    ['multisig_proposal_discard_signature', multisigProposalCommands],
    ['multisig_proposal_cancel', multisigProposalCommands],
    ['tx_proposal_cancel', transactionCommands],
    ['external_signer_create', hardwareCommands],
    ['external_signer_export_descriptor', hardwareCommands],
    ['external_signer_proposal_import', hardwareCommands],
    ['external_signer_proposal_discard_signature', hardwareCommands],
    ['external_signer_proposal_cancel', hardwareCommands]
  ])('%s rejects selection changes before queued wallet work', (name, source) => {
    const command = commandSource(source, name);
    const captured = command.indexOf(
      'let expected_wallet_id = load_registry(&app)?.selected_wallet_id;'
    );
    const worker = command.indexOf('tauri::async_runtime::spawn_blocking');
    const lock = command.indexOf('operation_guard(&state)?');
    const checked = command.indexOf(
      'load_registry(&app)?.selected_wallet_id != expected_wallet_id'
    );
    expect(captured).toBeGreaterThan(-1);
    expect(captured).toBeLessThan(worker);
    expect(checked).toBeGreaterThan(lock);
    expect(command).toContain('"wallet_selection_changed"');
    const authorization = command.indexOf('require_unlocked(');
    if (authorization !== -1) expect(checked).toBeLessThan(authorization);
  });

  it('wallet locking cancels automatic sync before waiting for the wallet-operation lock', () => {
    const source = commandSource(profileCommands, 'wallet_lock');
    expect(source.indexOf('cancel_foreground_sync(&state)?')).toBeGreaterThan(-1);
    expect(source.indexOf('cancel_foreground_sync(&state)?')).toBeLessThan(
      source.indexOf('operation_guard(&state)?')
    );
  });

  it.each(['wallet_notifications', 'wallet_notifications_ack'])(
    '%s binds identity before opening the database',
    (command) => {
      const source = commandSource(profileCommands, command);
      expect(source).toContain('wallet_id: Uuid');
      expect(source.indexOf('require_wallet_read_context')).toBeGreaterThan(
        source.indexOf('operation_guard(&state)?')
      );
      expect(source.indexOf('require_wallet_read_context')).toBeLessThan(
        source.indexOf('open_multisig_db')
      );
      if (command.endsWith('_ack')) expect(source).toContain('Some(session_id)');
    }
  );

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

  it('keeps remote birthday validation off the native UI thread and cancels ordinary sync first', () => {
    const source = commandSource(profileCommands, 'recovery_scan_settings_save');
    expect(source.indexOf('spawn_blocking(move ||')).toBeGreaterThan(-1);
    expect(source.indexOf('cancel_foreground_sync(&state)?')).toBeLessThan(
      source.indexOf('operation_guard(&state)?')
    );
    expect(source.indexOf('checked_block_height(&rpc_client(')).toBeGreaterThan(-1);
  });
});
