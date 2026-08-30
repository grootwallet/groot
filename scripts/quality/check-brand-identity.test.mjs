import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

function installedCommand(command) {
  const result = spawnSync('/bin/sh', ['-c', `command -v ${command}`], {
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, `required test command is unavailable: ${command}`);
  return result.stdout.trim();
}

function restrictedCommandPath(commands) {
  const restrictedPath = mkdtempSync(path.join(tmpdir(), 'groot-brand-gate-path-'));
  for (const command of commands) {
    symlinkSync(installedCommand(command), path.join(restrictedPath, command));
  }
  return restrictedPath;
}

function runBrandGateAt(root, commandPath) {
  return spawnSync('/bin/bash', [path.join(root, 'scripts/quality/check-brand-identity.sh')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PATH: commandPath }
  });
}

function runBrandGate(commandPath) {
  return runBrandGateAt(repositoryRoot, commandPath);
}

function brandFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'groot-brand-gate-fixture-'));
  const write = (relativePath, contents) => {
    const destination = path.join(root, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, contents);
  };
  const scriptDestination = path.join(root, 'scripts/quality/check-brand-identity.sh');
  mkdirSync(path.dirname(scriptDestination), { recursive: true });
  cpSync(path.join(repositoryRoot, 'scripts/quality/check-brand-identity.sh'), scriptDestination);
  write(
    'src-tauri/tauri.conf.json',
    '{"productName": "Groot", "mainBinaryName": "Groot", "title": "Groot", "identifier": "app.groot.wallet"}'
  );
  write('package.json', '{"name": "groot-wallet"}');
  write('src-tauri/Cargo.toml', 'name = "groot"\nname = "Groot"\n');
  write('src/routes/+layout.svelte', '<title>Groot</title>');
  const legacyIcon =
    'M512 100C100 100 100 100 100 512C100 924 100 924 512 924C924 924 924 924 924 512C924 100 924 100 512 100Z\ntranslate(219 219) scale(4.578)\n';
  write('assets/brand/app-icon-legacy-source.svg', legacyIcon);
  write('assets/brand/app-icon-layered-source.svg', 'translate(219 219) scale(4.578)');
  write(
    'assets/brand/app-icon-layers/01-background.svg',
    '<rect width="1024" height="1024" fill="#102A4C"/>'
  );
  write('assets/brand/app-icon-layers/02-control.svg', 'translate(219 219) scale(4.578)');
  write('src-tauri/icons/macos-icon-source.svg', legacyIcon);
  write('src-tauri/Info.plist', 'Groot');
  write('src-tauri/capabilities/default.json', '{}');
  write('src-tauri/app-icon.svg', '<svg/>');
  write('e2e/branding.spec.ts', '// Intentional historical Satchel assertion');
  mkdirSync(path.join(root, 'static'), { recursive: true });
  return { root, write };
}

test('brand gate falls back to system grep when ripgrep is unavailable', () => {
  const commandPath = restrictedCommandPath(['cmp', 'dirname', 'find', 'grep']);
  try {
    const result = runBrandGate(commandPath);

    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(
      result.stdout,
      /Groot brand identity gate: public and technical namespaces updated\./
    );
  } finally {
    rmSync(commandPath, { recursive: true, force: true });
  }
});

test('brand gate fails clearly when no supported search tool is available', () => {
  const commandPath = restrictedCommandPath(['cmp', 'dirname']);
  try {
    const result = runBrandGate(commandPath);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ripgrep or system grep\/find are required/);
  } finally {
    rmSync(commandPath, { recursive: true, force: true });
  }
});

test('grep fallback fails closed when file discovery errors', () => {
  const commandPath = restrictedCommandPath(['cmp', 'dirname', 'grep']);
  const failingFind = path.join(commandPath, 'find');
  writeFileSync(failingFind, '#!/bin/sh\nexit 2\n');
  chmodSync(failingFind, 0o755);
  try {
    const result = runBrandGate(commandPath);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /brand identity file discovery failed/);
  } finally {
    rmSync(commandPath, { recursive: true, force: true });
  }
});

test('grep fallback rejects hidden and newline-named deprecated-brand files', () => {
  const commandPath = restrictedCommandPath(['cmp', 'dirname', 'find', 'grep']);
  const fixture = brandFixture();
  try {
    fixture.write('src/.scratch', 'Satchel');
    let result = runBrandGateAt(fixture.root, commandPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /current user-facing surface still contains Satchel/);

    rmSync(path.join(fixture.root, 'src/.scratch'));
    fixture.write('e2e/nested\nbranding.spec.ts', 'Satchel');
    result = runBrandGateAt(fixture.root, commandPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /current user-facing surface still contains Satchel/);
  } finally {
    rmSync(commandPath, { recursive: true, force: true });
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('grep fallback preserves layered-icon mask rejection', () => {
  const commandPath = restrictedCommandPath(['cmp', 'dirname', 'find', 'grep']);
  const fixture = brandFixture();
  try {
    fixture.write('assets/brand/app-icon-layers/03-mask.svg', '<rect rx="12"/>');
    const result = runBrandGateAt(fixture.root, commandPath);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /modern Apple icon artwork must remain square and unmasked/);
  } finally {
    rmSync(commandPath, { recursive: true, force: true });
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
