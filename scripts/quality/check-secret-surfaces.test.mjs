import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  approvedCapabilityPermissions,
  hasUnreviewedLogging,
  sensitiveStringIsWrappedBeforeFallibleWork,
  validateCsp
} from './check-secret-surfaces.mjs';

const approved = JSON.stringify({
  permissions: ['core:default', 'clipboard-manager:allow-write-text']
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'groot-capabilities-'));
  writeFileSync(join(directory, 'default.json'), approved);
  return directory;
}

function rejectsExtra(name, arrange) {
  test(name, () => {
    const directory = fixture();
    try {
      arrange(directory);
      assert.throws(
        () => approvedCapabilityPermissions(directory),
        /must contain only the reviewed regular file default\.json/
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test('accepts only the reviewed default capability', () => {
  const directory = fixture();
  try {
    assert.deepEqual([...approvedCapabilityPermissions(directory)].sort(), [
      'clipboard-manager:allow-write-text',
      'core:default'
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

rejectsExtra('rejects a second top-level JSON capability', (directory) => {
  writeFileSync(join(directory, 'extra.json'), approved);
});

rejectsExtra('rejects a nested capability directory', (directory) => {
  const nested = join(directory, 'nested');
  mkdirSync(nested);
  writeFileSync(join(nested, 'extra.json'), approved);
});

rejectsExtra('rejects an alternate TOML capability', (directory) => {
  writeFileSync(
    join(directory, 'extra.toml'),
    'permissions = ["clipboard-manager:allow-read-text"]'
  );
});

rejectsExtra('rejects a symlinked capability entry', (directory) => {
  symlinkSync(join(directory, 'default.json'), join(directory, 'linked.json'));
});

test('detects alternate JavaScript and Rust logging spellings', () => {
  for (const source of [
    "console['log'](secret)",
    'console.trace(secret)',
    'console.table(secret)',
    'print!("{secret}")',
    'eprint!("{secret}")',
    'tracing::debug!(?secret)',
    'std::io::stderr().write_all(secret)'
  ]) {
    assert.equal(hasUnreviewedLogging(source), true, source);
  }
  assert.equal(hasUnreviewedLogging('const catalog = console;'), false);
});

test('requires credential strings to enter Zeroizing before fallible work', () => {
  assert.equal(
    sensitiveStringIsWrappedBeforeFallibleWork(`
use zeroize::Zeroizing;
pub fn safe(credential: String) -> Result<(), Error> {
  let credential = Zeroizing::new(credential);
  fallible()?;
  use_it(credential)
}`),
    true
  );
  assert.equal(
    sensitiveStringIsWrappedBeforeFallibleWork(`
pub async fn unsafe_command(password: String) -> Result<(), Error> {
  fallible()?;
  let password = Zeroizing::new(password);
  use_it(password)
}`),
    false
  );
  assert.equal(
    sensitiveStringIsWrappedBeforeFallibleWork(`
pub fn lifetime_decoy<'a>(credential: String) -> Result<(), Error> {
  /* outer /* nested */ let credential = Zeroizing::new(credential); */
  fallible()?;
  use_it(credential)
}`),
    false
  );
  assert.equal(
    sensitiveStringIsWrappedBeforeFallibleWork(`
pub fn unsafe_comment(credential: String) -> Result<(), Error> {
  // let credential = Zeroizing::new(credential);
  fallible()?;
  use_it(credential)
}`),
    false
  );
  assert.equal(
    sensitiveStringIsWrappedBeforeFallibleWork(`
pub fn unsafe_raw_string(credential: String) -> Result<(), Error> {
  let decoy = r#"prefix "//
  let credential = Zeroizing::new(credential);
  "#;
  fallible()?;
  use_it(credential)
}`),
    false
  );
  assert.equal(
    sensitiveStringIsWrappedBeforeFallibleWork(`
pub unsafe fn unsafe_modifier(credential: String) -> Result<(), Error> {
  fallible()?;
  let credential = Zeroizing::new(credential);
  use_it(credential)
}`),
    false
  );
  assert.equal(
    sensitiveStringIsWrappedBeforeFallibleWork(`
pub fn qualified(credential: std::string::String) -> Result<(), Error> {
  fallible()?;
  let credential = Zeroizing::new(credential);
  use_it(credential)
}`),
    false
  );
  assert.equal(
    sensitiveStringIsWrappedBeforeFallibleWork(`
pub async fn dispatched(wallet_password: String) -> Result<(), Error> {
  spawn_blocking(move || {
    let wallet_password = Zeroizing::new(wallet_password);
    use_it(wallet_password)
  }).await?
}`),
    false
  );
  for (const [declaration, parameter] of [
    ['', 'credential: ::std::string::String'],
    ['', 'credential: ::std :: string :: String'],
    ['', 'password: alloc::string::String'],
    ['', 'passphrase: String'],
    ['type CredentialText = String;', 'credential: CredentialText'],
    ['use std::string::String as SecretText;', 'secret: SecretText']
  ]) {
    assert.equal(
      sensitiveStringIsWrappedBeforeFallibleWork(`${declaration}
pub fn alias_or_synonym(${parameter}) -> Result<(), Error> {
  fallible()?;
  Ok(())
}`),
      false,
      parameter
    );
  }
  assert.equal(
    sensitiveStringIsWrappedBeforeFallibleWork(`
use crate::Noop as Zeroizing;
pub fn fake_wrapper(credential: String) -> Result<(), Error> {
  let credential = Zeroizing::new(credential);
  fallible()?;
  Ok(())
}`),
    false
  );
  assert.equal(
    sensitiveStringIsWrappedBeforeFallibleWork(`
use crate::noop::Zeroizing;
pub fn fake_origin(credential: String) -> Result<(), Error> {
  let credential = Zeroizing::new(credential);
  Ok(())
}`),
    false
  );
  assert.equal(
    sensitiveStringIsWrappedBeforeFallibleWork(`
mod Zeroizing { pub fn new<T>(value: T) -> T { value } }
pub fn fake_module(credential: String) -> Result<(), Error> {
  let credential = Zeroizing::new(credential);
  Ok(())
}`),
    false
  );
});

const approvedCsp =
  "default-src 'self'; connect-src ipc: http://ipc.localhost; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; worker-src 'self' blob:; media-src 'self' blob:; manifest-src 'none'; base-uri 'none'; form-action 'self'";

test('accepts the exact reviewed local IPC CSP', () => {
  assert.doesNotThrow(() => validateCsp(approvedCsp));
});

test('rejects a lookalike IPC origin suffix', () => {
  assert.throws(
    () => validateCsp(approvedCsp.replace('http://ipc.localhost', 'http://ipc.localhost.evil')),
    /connect-src/
  );
});

test('rejects an additional remote connect origin', () => {
  assert.throws(
    () =>
      validateCsp(
        approvedCsp.replace('http://ipc.localhost', 'http://ipc.localhost https://example.com')
      ),
    /connect-src/
  );
});

test('rejects duplicate CSP directives instead of applying last-wins semantics', () => {
  assert.throws(
    () => validateCsp(`${approvedCsp}; connect-src https://evil.example`),
    /connect-src must appear exactly once/
  );
});

test('rejects case-variant CSP duplicates and wildcard sources', () => {
  assert.throws(
    () => validateCsp(`CONNECT-SRC *; ${approvedCsp}`),
    /connect-src must appear exactly once/
  );
  assert.throws(
    () => validateCsp(approvedCsp.replace("img-src 'self' data: blob:", 'img-src *')),
    /img-src/
  );
  assert.throws(
    () => validateCsp(approvedCsp.replace("script-src 'self'", 'script-src https:')),
    /script-src/
  );
  assert.throws(
    () => validateCsp(approvedCsp.replace("script-src 'self'", 'script-src *.evil.example')),
    /script-src/
  );
});
