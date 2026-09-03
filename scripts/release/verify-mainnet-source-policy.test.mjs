import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  validateBrowserNetworkSource,
  validateBuildScriptSource,
  validateCompiledNetworkSource,
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
    /changed after the mainnet-disabled policy snapshot/
  );
});

test('browser gate tolerates formatting but rejects an added mainnet network', () => {
  validateBrowserNetworkSource(
    "export const SUPPORTED_NETWORKS = [\n 'signet', 'testnet4', 'regtest'\n] as const;"
  );
  assert.throws(
    () =>
      validateBrowserNetworkSource(
        "export const SUPPORTED_NETWORKS = ['signet', 'testnet4', 'regtest', 'mainnet'] as const;"
      ),
    /unsafe/
  );
  assert.throws(
    () =>
      validateBrowserNetworkSource(`
const decoy = \`export const SUPPORTED_NETWORKS = ['signet', 'testnet4', 'regtest'] as const;\`;
export const SUPPORTED_NETWORKS = ['mainnet'] as const;`),
    /mainnet|unsafe/
  );
  assert.throws(
    () =>
      validateBrowserNetworkSource(
        `export const SUPPORTED_NETWORKS = ['signet', 'testnet4', 'regtest', ...hidden] as const;`
      ),
    /unsafe/
  );
});

test('native build gate rejects a mainnet match arm', () => {
  const source = buildFixture(`
    "regtest" | "signet" | "testnet4" => {}
    "mainnet" => {}
  `);
  assert.throws(() => validateBuildScriptSource(source), /exact reviewed match/);
});

test('trusted release gate rejects true regardless of whitespace', () => {
  validateReleasePolicySource(`
const MAINNET_ENABLED : bool = false ;
pub fn ensure_runtime_network_enabled(network: Network) -> Result<(), ReleasePolicyError> {
  if network == Network::Bitcoin && !MAINNET_ENABLED {
    return Err(ReleasePolicyError::MainnetDisabled);
  }
  Ok(())
}`);
  assert.throws(
    () =>
      validateReleasePolicySource(`
const MAINNET_ENABLED: bool = true;
pub fn ensure_runtime_network_enabled(network: Network) -> Result<(), ReleasePolicyError> { Ok(()) }`),
    /not explicitly false/
  );
  assert.throws(
    () =>
      validateReleasePolicySource(`
const MAINNET_ENABLED: bool = false;
pub fn ensure_runtime_network_enabled(_network: Network) -> Result<(), ReleasePolicyError> { Ok(()) }`),
    /exact fail-closed implementation/
  );
  assert.throws(
    () =>
      validateReleasePolicySource(`
const MAINNET_ENABLED: bool = false;
#[cfg(any())]
pub fn ensure_runtime_network_enabled(network: Network) -> Result<(), ReleasePolicyError> {
  if network == Network::Bitcoin && !MAINNET_ENABLED { return Err(ReleasePolicyError::MainnetDisabled); }
  Ok(())
}
pub fn ensure_runtime_network_enabled(_network: Network) -> Result<(), ReleasePolicyError> { Ok(()) }`),
    /exactly once/
  );
});

test('compiled network gate rejects a whitespace-obscured Bitcoin selection', () => {
  assert.throws(
    () => validateCompiledNetworkSource('pub const NETWORK : Network = Network::Bitcoin ;'),
    /exact reviewed set/
  );
});

test('comments cannot hide live mainnet declarations or satisfy required guards', () => {
  assert.throws(
    () =>
      validateBrowserNetworkSource(`
// export const SUPPORTED_NETWORKS = ['signet', 'testnet4', 'regtest'] as const;
export const SUPPORTED_NETWORKS = ['mainnet'] as const;`),
    /unsafe/
  );
  assert.throws(
    () =>
      validateReleasePolicySource(`
// const MAINNET_ENABLED: bool = false;
const MAINNET_ENABLED: bool = true;
pub fn ensure_runtime_network_enabled(network: Network) -> Result<(), ReleasePolicyError> { Ok(()) }`),
    /not explicitly false/
  );
});

test('indirection and decoy safe snippets cannot bypass native network checks', () => {
  assert.throws(
    () =>
      validateBuildScriptSource(`
${buildFixture('"regtest" | "signet" | "testnet4" => {} _ => panic!("GROOT_BUILD_NETWORK must be exactly regtest, signet, or testnet4; mainnet is not compiled into this release"),')}
if network == String::from("mainnet") { enable(); }`),
    /exact reviewed match|live mainnet network literal/
  );
  assert.throws(
    () =>
      validateBuildScriptSource(
        buildFixture(`
  "regtest" | "signet" | "testnet4" => {}
  _ => panic!("GROOT_BUILD_NETWORK must be exactly regtest, signet, or testnet4; mainnet is not compiled into this release"),
`) + '\nmatch another { _ => {} }'
      ),
    /exact reviewed match/
  );
  assert.throws(
    () =>
      validateCompiledNetworkSource(`
pub const NETWORK: Network = Network::Signet;
pub const NETWORK: Network = Network::Testnet4;
pub const NETWORK: Network = Network::Regtest;
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
    /exact reviewed set|mainnet cfg/
  );
});

test('Rust lifetimes and nested comments cannot expose policy decoys', () => {
  assert.throws(
    () =>
      validateReleasePolicySource(`
fn harmless<'a>() {}
/* outer /* nested */ const MAINNET_ENABLED: bool = false; */
const MAINNET_ENABLED: bool = true;`),
    /not explicitly false/
  );
});

test('database guards must precede every production wallet opener', () => {
  const guarded = (name, open) => `
fn ${name}(path: &Path) {
  ensure_runtime_network_enabled(NETWORK).map_err(blocked)?;
  let value = ${open}(path)?;
}`;
  assert.doesNotThrow(() =>
    validateWalletOpenGuardSource(
      `${guarded('open_wallet_database', 'Connection::open')}
${guarded('open_existing_wallet_database_read_only', 'Connection::open_with_flags')}`
    )
  );
  assert.throws(
    () =>
      validateWalletOpenGuardSource(`
${guarded('open_wallet_database', 'Connection::open')}
${guarded('open_existing_wallet_database_read_only', 'Connection::open_with_flags')}
fn bypass(path: &Path) { Connection::open(path); }`),
    /outside the guarded helpers/
  );
  assert.throws(
    () =>
      validateWalletOpenGuardSource(`
${guarded('open_wallet_database', 'Connection::open')}
${guarded('open_existing_wallet_database_read_only', 'Connection::open_with_flags')}
fn bypass(path: &Path) { (Connection::open)(path); }`),
    /outside the guarded helpers/
  );
  assert.throws(
    () =>
      validateWalletOpenGuardSource(`
${guarded('open_wallet_database', 'Connection::open')}
${guarded('open_existing_wallet_database_read_only', 'Connection::open_with_flags')}
fn bypass(path: &Path) { <Connection>::open(path); }`),
    /outside the guarded helpers/
  );
});
