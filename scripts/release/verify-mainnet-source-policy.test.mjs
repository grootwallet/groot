import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  validateBrowserNetworkSource,
  validateBuildScriptSource,
  validateCompiledNetworkSource,
  validateCrateDatabaseOpenSources,
  validateMainnetSourcePolicy,
  validateReleasePolicySource,
  validateWalletOpenGuardSource
} from './verify-mainnet-source-policy.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

const buildFixture = (
  body,
  emission = 'println!("cargo:rustc-cfg=groot_network=\\"{network}\\"");'
) => `
fn main() {
  let network = std::env::var("GROOT_BUILD_NETWORK").unwrap_or_else(|_| "regtest".to_owned());
  match network.as_str() { ${body} }
  ${emission}
}`;

test('pins every reviewed mainnet-critical source byte', () => {
  const read = (path) => readFileSync(`${repoRoot}${path}`, 'utf8');
  assert.doesNotThrow(() => validateMainnetSourcePolicy(read));
  assert.throws(
    () =>
      validateMainnetSourcePolicy((path) =>
        path === 'src/lib/config.ts'
          ? `${read(path)}\nSUPPORTED_NETWORKS.push(hidden);`
          : read(path)
      ),
    /changed after the mainnet-candidate policy snapshot/
  );
});

test('browser gate accepts only the four reviewed build identities', () => {
  validateBrowserNetworkSource(
    "export const SUPPORTED_NETWORKS = [\n 'signet', 'testnet4', 'regtest', 'mainnet'\n] as const;"
  );
  assert.throws(
    () =>
      validateBrowserNetworkSource(
        "export const SUPPORTED_NETWORKS = ['signet', 'testnet4', 'regtest'] as const;"
      ),
    /unsafe/
  );
  assert.throws(
    () =>
      validateBrowserNetworkSource(`
const decoy = \`export const SUPPORTED_NETWORKS = ['signet', 'testnet4', 'regtest', 'mainnet'] as const;\`;
export const SUPPORTED_NETWORKS = ['mainnet'] as const;`),
    /unsafe/
  );
  assert.throws(
    () =>
      validateBrowserNetworkSource(
        `export const SUPPORTED_NETWORKS = ['signet', 'testnet4', 'regtest', 'mainnet', ...hidden] as const;`
      ),
    /unsafe/
  );
});

test('native build gate rejects a mainnet match arm', () => {
  const source = buildFixture(`
    "regtest" | "signet" | "testnet4" => {}
    "mainnet" => enable_without_the_reviewed_single_arm()
  `);
  assert.throws(() => validateBuildScriptSource(source), /exact reviewed match/);
});

test('trusted release gate requires the dedicated compile-time mainnet identity', () => {
  validateReleasePolicySource(`
pub fn ensure_runtime_network_enabled(_network: Network) -> Result<(), ReleasePolicyError> {
  #[cfg(not(groot_network = "mainnet"))]
  if _network == Network::Bitcoin {
    return Err(ReleasePolicyError::MainnetDisabled);
  }
  Ok(())
}`);
  assert.throws(
    () =>
      validateReleasePolicySource(`
pub fn ensure_runtime_network_enabled(network: Network) -> Result<(), ReleasePolicyError> { Ok(()) }`),
    /exact fail-closed implementation/
  );
  assert.throws(
    () =>
      validateReleasePolicySource(`
const MAINNET_ENABLED: bool = cfg!(groot_network = "mainnet");
pub fn ensure_runtime_network_enabled(_network: Network) -> Result<(), ReleasePolicyError> { Ok(()) }`),
    /runtime cfg boolean/
  );
  assert.throws(
    () =>
      validateReleasePolicySource(`
#[cfg(any())]
pub fn ensure_runtime_network_enabled(_network: Network) -> Result<(), ReleasePolicyError> {
  #[cfg(not(groot_network = "mainnet"))]
  if _network == Network::Bitcoin { return Err(ReleasePolicyError::MainnetDisabled); }
  Ok(())
}
pub fn ensure_runtime_network_enabled(_network: Network) -> Result<(), ReleasePolicyError> { Ok(()) }`),
    /exactly once/
  );
});

test('compiled network gate rejects an unscoped Bitcoin selection', () => {
  assert.throws(
    () => validateCompiledNetworkSource('pub const NETWORK : Network = Network::Bitcoin ;'),
    /exact reviewed set/
  );
});

test('comments cannot hide live mainnet declarations or satisfy required guards', () => {
  assert.throws(
    () =>
      validateBrowserNetworkSource(`
// export const SUPPORTED_NETWORKS = ['signet', 'testnet4', 'regtest', 'mainnet'] as const;
export const SUPPORTED_NETWORKS = ['mainnet'] as const;`),
    /unsafe/
  );
  assert.throws(
    () =>
      validateReleasePolicySource(`
// #[cfg(not(groot_network = "mainnet"))]
pub fn ensure_runtime_network_enabled(network: Network) -> Result<(), ReleasePolicyError> { Ok(()) }`),
    /exact fail-closed implementation/
  );
});

test('indirection and decoy safe snippets cannot bypass native network checks', () => {
  assert.throws(
    () =>
      validateBuildScriptSource(`
${buildFixture('"regtest" | "signet" | "testnet4" | "mainnet" => {} _ => panic!("GROOT_BUILD_NETWORK must be exactly regtest, signet, testnet4, or mainnet"),')}
match network.as_str() { "mainnet" => enable(), _ => {} }`),
    /exact reviewed match|not uniquely recognizable/
  );
  assert.throws(
    () =>
      validateBuildScriptSource(
        buildFixture(`
  "regtest" | "signet" | "testnet4" | "mainnet" => {}
  _ => panic!("GROOT_BUILD_NETWORK must be exactly regtest, signet, testnet4, or mainnet"),
`) + '\nprintln!("cargo:rustc-cfg=groot_network=\\"mainnet\\"");'
      ),
    /not bound/
  );
  assert.throws(
    () =>
      validateCompiledNetworkSource(`
pub const NETWORK: Network = Network::Signet;
pub const NETWORK: Network = Network::Testnet4;
pub const NETWORK: Network = Network::Regtest;
#[cfg(groot_network = "mainnet")] pub const NETWORK: Network = Network::Bitcoin;
const SELECTED: Network = Network::Bitcoin;
pub const NETWORK: Network = SELECTED;`),
    /exact reviewed set/
  );
  assert.throws(
    () =>
      validateCompiledNetworkSource(`
#[cfg(any())] pub const NETWORK: Network = Network::Signet;
#[cfg(any())] pub const NETWORK: Network = Network::Testnet4;
#[cfg(any())] pub const NETWORK: Network = Network::Regtest;
#[cfg(groot_network = "mainnet")] pub const NETWORK: Network = Network::Bitcoin;
macro_rules! selected { () => { pub const NETWORK: Network = Network::Bitcoin; } }
selected!();`),
    /generate|exact reviewed set/
  );
  assert.throws(
    () =>
      validateCompiledNetworkSource(`
#[cfg(groot_network = "signet")] pub const NETWORK: Network = Network::Signet;
#[cfg(groot_network = "testnet4")] pub const NETWORK: Network = Network::Testnet4;
#[cfg(groot_network = "regtest")] pub const NETWORK: Network = Network::Regtest;
#[cfg(groot_network = "mainnet")] pub static NETWORK: Network = Network::Bitcoin;`),
    /exact reviewed set/
  );
});

test('Rust lifetimes and nested comments cannot expose policy decoys', () => {
  assert.throws(
    () =>
      validateReleasePolicySource(`
fn harmless<'a>() {}
/* outer /* nested */ const MAINNET_ENABLED: bool = cfg!(groot_network = "mainnet"); */
const MAINNET_ENABLED: bool = true;`),
    /runtime cfg boolean/
  );
});

test('database guards must precede every production wallet opener', () => {
  const guarded = (
    name,
    open,
    permit = 'DatabaseOpenPermit',
    validator = 'validate_database_open_permit',
    result = 'Connection'
  ) => `
fn ${name}(path: &Path, permit: &${permit}) -> ApiResult<${result}> {
  ${validator}(permit)?;
  let value = ${open}(path)?;
}`;
  const authenticationOpener = guarded(
    'open_authentication_database',
    'Connection::open',
    'AuthenticationDatabaseOpenPermit',
    'validate_authentication_database_open_permit',
    'AuthenticationDatabase'
  );
  assert.doesNotThrow(() =>
    validateWalletOpenGuardSource(
      `${guarded('open_wallet_database', 'Connection::open')}
${guarded('open_existing_wallet_database_read_only', 'Connection::open_with_flags')}
${authenticationOpener}`
    )
  );
  assert.throws(
    () =>
      validateWalletOpenGuardSource(`
${guarded('open_wallet_database', 'Connection::open')}
${guarded('open_existing_wallet_database_read_only', 'Connection::open_with_flags')}
${authenticationOpener}
fn bypass(path: &Path) { Connection::open(path); }`),
    /outside the guarded helpers/
  );
  assert.throws(
    () =>
      validateWalletOpenGuardSource(`
${guarded('open_wallet_database', 'Connection::open')}
${guarded('open_existing_wallet_database_read_only', 'Connection::open_with_flags')}
${authenticationOpener}
fn bypass(path: &Path) { (Connection::open)(path); }`),
    /outside the guarded helpers/
  );
  assert.throws(
    () =>
      validateWalletOpenGuardSource(`
${guarded('open_wallet_database', 'Connection::open')}
${guarded('open_existing_wallet_database_read_only', 'Connection::open_with_flags')}
${authenticationOpener}
fn bypass(path: &Path) { <Connection>::open(path); }`),
    /outside the guarded helpers/
  );
  assert.throws(
    () =>
      validateWalletOpenGuardSource(`
fn open_wallet_database(path: &Path) {
  validate_database_open_permit(&permit)?;
  Connection::open(path);
}
${guarded('open_existing_wallet_database_read_only', 'Connection::open_with_flags')}
${authenticationOpener}`),
    /typed admission permit/
  );
  assert.throws(
    () =>
      validateWalletOpenGuardSource(`
fn open_wallet_database(path: &Path, permit: &DatabaseOpenPermit) -> ApiResult<Connection> {
  Connection::open(path);
  validate_database_open_permit(permit)?;
}
${guarded('open_existing_wallet_database_read_only', 'Connection::open_with_flags')}
${authenticationOpener}`),
    /admission-guarded before opening/
  );
  assert.throws(
    () =>
      validateWalletOpenGuardSource(`
${guarded('open_wallet_database', 'Connection::open')}
${guarded('open_existing_wallet_database_read_only', 'Connection::open_with_flags')}
${guarded('open_authentication_database', 'Connection::open')}`),
    /typed admission permit/
  );
  assert.throws(
    () =>
      validateWalletOpenGuardSource(`
${guarded('open_wallet_database', 'Connection::open')}
${guarded('open_existing_wallet_database_read_only', 'Connection::open_with_flags')}
${guarded(
  'open_authentication_database',
  'Connection::open',
  'AuthenticationDatabaseOpenPermit',
  'validate_authentication_database_open_permit'
)}`),
    /purpose-bound result type/
  );
});

test('database opens are rejected across the production Rust crate', () => {
  assert.doesNotThrow(() =>
    validateCrateDatabaseOpenSources([
      ['src-tauri/src/lib.rs', 'fn harmless() {}'],
      ['src-tauri/src/wallet.rs', 'fn approved_helpers_are_checked_separately() {}'],
      [
        'src-tauri/src/inline_tests.rs',
        '#[cfg(test)] mod tests { fn opens_only_in_tests() { Connection::open("test"); } }'
      ]
    ])
  );
  assert.throws(
    () =>
      validateCrateDatabaseOpenSources([
        [
          'src-tauri/src/new_backend.rs',
          'fn bypass() { bdk_wallet::rusqlite::Connection::open("wallet"); }'
        ]
      ]),
    /outside the guarded wallet helpers/
  );
  assert.throws(
    () =>
      validateCrateDatabaseOpenSources([
        ['src-tauri/src/new_backend.rs', 'use rusqlite::Connection as Db;']
      ]),
    /may not alias/
  );
});
