import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const nativeCommands = readFileSync(
  new URL('../../../src-tauri/src/wallet/profile_commands.rs', import.meta.url),
  'utf8'
);
const walletCore = readFileSync(
  new URL('../../../src-tauri/src/wallet.rs', import.meta.url),
  'utf8'
);
const multisigCommands = readFileSync(
  new URL('../../../src-tauri/src/wallet/multisig_proposal_commands.rs', import.meta.url),
  'utf8'
);
const runtimeContract = readFileSync(new URL('./contracts/runtime.ts', import.meta.url), 'utf8');
const settings = readFileSync(
  new URL('../../routes/settings/+page.svelte', import.meta.url),
  'utf8'
);
const directAdoptionRoutes = [
  readFileSync(new URL('../../routes/welcome/+page.svelte', import.meta.url), 'utf8'),
  readFileSync(new URL('../../routes/hardware/new/+page.svelte', import.meta.url), 'utf8')
];
const welcome = directAdoptionRoutes[0];
const multisigCreationRoute = readFileSync(
  new URL('../../routes/multisig/new/+page.svelte', import.meta.url),
  'utf8'
);
const multisigPolicyRoute = readFileSync(
  new URL('../../routes/multisig/+page.svelte', import.meta.url),
  'utf8'
);

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
    expect(sourceDto).toContain('ready');
    expect(sourceDto).not.toMatch(/password|credential|nodeConfig/i);
  });

  it('revalidates the source and re-encrypts its RPC password for the destination wallet', () => {
    const source = nativeCommand('network_setup_adopt');

    expect(source).toContain(
      'authorize_wallet_session(&state, source, false, registry.inactivity_timeout_minutes)'
    );
    expect(source).not.toContain('.is_unlocked(source)');
    expect(source).toContain('session.config != config');
    expect(source).toContain('checked_node_status(&client, config.clone())');
    expect(source).toContain('node_secret_path_for(&app, destination)');
    expect(source).toContain('credential.as_str()');
    expect(source).toContain('sync_source_path_for(&app, destination)');
    expect(
      source.indexOf('load_node_auth_session(&app, &state, credential.as_str())')
    ).toBeLessThan(source.indexOf('mark_selected_mainnet_node_verified(&app, &state)'));
  });

  it('offers the same default choice for software, hardware, and multisig creation', () => {
    for (const route of [...directAdoptionRoutes, multisigCreationRoute]) {
      expect(route).toContain('let reuseNetworkSetup = $state(true)');
      expect(route).toContain('walletService.networkSetupSources()');
      expect(route).toContain(
        'Copies its node and sync method. This wallet protects its own copy.'
      );
    }
    expect(welcome).toContain('networkSetupSource?.walletId');
    expect(welcome).toContain('creation.networkSetupCopied');
    expect(directAdoptionRoutes[1]).toContain('walletService.adoptNetworkSetup(');
    expect(multisigCreationRoute).toContain('networkSetupSourceWalletId');
    expect(multisigCreationRoute).not.toContain('walletService.adoptNetworkSetup(');
  });

  it('copies multisig network setup before publishing the new profile', () => {
    const copy = multisigCommands.indexOf(
      'profile_commands::copy_network_setup_before_profile_commit('
    );
    const commit = multisigCommands.indexOf('commit_multisig_profile(&app, id, &wallet)?;', copy);

    expect(copy).toBeGreaterThan(-1);
    expect(commit).toBeGreaterThan(copy);
  });

  it('finishes software network setup inside native creation before publishing success', () => {
    const createStart = nativeCommands.indexOf('pub fn wallet_create');
    const createEnd = nativeCommands.indexOf('#[tauri::command]', createStart);
    const create = nativeCommands.slice(createStart, createEnd);
    const nativeCopy = create.indexOf('create_from_mnemonic(');
    const nativeResult = create.indexOf('Ok(SoftwareWalletCreation {');
    const successScreen = welcome.indexOf("mode = 'created';");
    const createCall = welcome.indexOf('await walletService.createWallet(');

    expect(nativeCopy).toBeGreaterThan(-1);
    expect(nativeResult).toBeGreaterThan(nativeCopy);
    expect(successScreen).toBeGreaterThan(createCall);
    expect(create).toContain('network_setup_source_wallet_id.as_deref()');
    expect(welcome.slice(createCall, successScreen)).not.toContain('adoptNetworkSetup(');
  });

  it('rolls back a selected multisig copy failure while retaining the explicit offline option', () => {
    const standardCreate = multisigCommands.slice(
      multisigCommands.indexOf('pub async fn multisig_create'),
      multisigCommands.indexOf('pub async fn multisig_recovery_create')
    );

    expect(standardCreate).toContain('copy_network_setup_before_profile_commit(');
    expect(standardCreate.indexOf('require_requested_network_setup(')).toBeLessThan(
      standardCreate.indexOf('commit_multisig_profile(&app, id, &wallet)?;')
    );
    expect(nativeCommands).toContain('pub(super) fn copy_network_setup_before_profile_commit(');
    expect(nativeCommands).toContain('copied: true');
    expect(nativeCommands).toContain('copied: false');
    expect(nativeCommands).toContain(
      'diagnostics::DiagnosticEventKind::NetworkConfigurationChanged'
    );
    expect(nativeCommands).toContain('diagnostics::DiagnosticOutcome::Failed');
  });

  it('persists the verified node tip as the birthday for a generated software wallet', () => {
    expect(nativeCommands).toContain('birthday_height: Some(birthday_height)');
    expect(walletCore).toContain('if let Some(birthday_height) = network_setup.birthday_height');
    expect(walletCore).toContain(
      'INSERT INTO groot_recovery_settings (singleton, birthday_height, gap_limit)'
    );
  });

  it('does not silently publish a multisig wallet when the user selected setup reuse', () => {
    expect(multisigCreationRoute).toContain('sources.find((source) => source.ready) ?? sources[0]');
    expect(multisigCreationRoute).toContain('if (!source?.ready)');
    expect(multisigCommands).toContain('require_requested_network_setup(');
    expect(multisigCommands).toContain('commit_multisig_profile(&app, id, &wallet)?;');
  });

  it('does not mistake an offline policy-status read for a missing hardware signer', () => {
    expect(multisigPolicyRoute).toContain('Promise.allSettled([');
    expect(multisigPolicyRoute).toContain(
      "if (address.status === 'fulfilled') policyAddress = address.value"
    );
    expect(multisigPolicyRoute).toContain('policySigner && policyDevice}<div class="device-scan"');
  });

  it('leaves multisig refresh ownership with the global live-sync scheduler', () => {
    expect(multisigPolicyRoute).toContain('walletService.multisigSnapshot()');
    expect(multisigPolicyRoute).not.toContain('walletService.syncMultisig()');
  });

  it('lets existing wallets adopt the same setup from Settings', () => {
    expect(settings).toContain('Use an existing network setup');
    expect(settings).toContain('walletService.adoptNetworkSetup(');
    expect(settings).toContain('Wallet data stays separate.');
    expect(settings).toContain('Unlock the source wallet first.');
    expect(settings).toContain('source.ready');
    expect(settings).not.toContain(
      "defaultConfig.network === 'mainnet'\n        ? Promise.resolve([])"
    );
    expect(settings).not.toContain(
      "defaultConfig.network !== 'mainnet' && reusableNetworkSetups.length > 0"
    );
    expect(settings).toContain("page.url.searchParams.get('networkSetup') === '1'");
    expect(settings).toContain('if (reusableNetworkSetups.length > 0) openNetworkReuse()');
  });

  it('separates managed, local, and custom node choices without rendering managed credentials', () => {
    expect(settings).toContain("setNodeLocation('managed')");
    expect(settings).toContain("setNodeLocation('local_core')");
    expect(settings).toContain("setNodeLocation('remote_core')");
    expect(settings).toContain("nodeMode === 'managed'");
    expect(settings).toContain('Groot managed node');
    expect(settings).toContain('Custom remote');
    expect(settings).toContain('Check managed status');
    expect(settings).toContain('managedRenewalAvailable');
    expect(settings).toContain('{:else}<label class="field"');
    expect(settings).toContain('walletService.configureManagedNode(walletCredential)');
  });

  it('presents Mainnet Core activity, fees, and broadcast as one understandable setting', () => {
    expect(settings).toContain("defaultConfig.network === 'mainnet'");
    expect(settings).toContain('Bitcoin Core connection');
    expect(settings).toContain('Groot managed · activity, fees, and broadcast');
    expect(settings).toContain('This Mac · activity, fees, and broadcast');
    expect(settings).toContain('Custom remote · activity, fees, and broadcast');
    expect(settings).toContain('class="warning-box managed-privacy-warning"');
    expect(settings).toContain('Privacy tradeoff');
    expect(settings).toContain('class="node-wallet-credential"');
  });

  it('renews managed access only inside native code after wallet authentication', () => {
    const source = nativeCommand('managed_node_configure');

    expect(source).toContain('verify_selected_credential(&app, credential.as_str())');
    expect(source).toContain('managed_mainnet_node_admission(');
    expect(source).toContain('persist_mainnet_node_admission(');
    expect(source).not.toContain('password: String');
  });

  it('keeps the public descriptor behind the standard progressive disclosure', () => {
    expect(welcome).toContain('class="proposal-review-details created-wallet-details"');
    expect(welcome).toContain(
      "createdWalletDetailsOpen ? 'View less details' : 'View more details'"
    );
    expect(welcome.indexOf('{#if descriptorCopied}')).toBeGreaterThan(
      welcome.indexOf('class="proposal-review-details created-wallet-details"')
    );
  });
});
