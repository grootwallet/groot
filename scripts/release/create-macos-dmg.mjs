#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const [appArgument, outputArgument, volumeName = 'Groot'] = process.argv.slice(2);

function fail(message) {
  throw new Error(`macOS DMG creation failed: ${message}`);
}

function run(command, arguments_) {
  return execFileSync(command, arguments_, { cwd: repoRoot, stdio: 'inherit' });
}

if (process.platform !== 'darwin') fail('this helper requires macOS');
if (!appArgument || !outputArgument || !isAbsolute(appArgument) || !isAbsolute(outputArgument)) {
  fail('usage: create-macos-dmg.mjs /absolute/Groot.app /new/absolute/Groot.dmg [volume name]');
}
const app = resolve(appArgument);
const output = resolve(outputArgument);
if (!app.endsWith('.app') || !existsSync(app)) fail('the app bundle is missing');
if (existsSync(output)) fail(`output already exists: ${output}`);
if (volumeName !== 'Groot') fail('the release DMG volume name must be exactly Groot');
mkdirSync(dirname(output), { recursive: true });

const temporaryRoot = mkdtempSync(join(process.env.TMPDIR ?? '/tmp', 'groot-styled-dmg.'));
const staging = join(temporaryRoot, 'staging');
const writableDmg = join(temporaryRoot, 'Groot-layout.dmg');

try {
  mkdirSync(staging, { mode: 0o700 });
  mkdirSync(join(staging, '.background'), { mode: 0o755 });
  cpSync(app, join(staging, 'Groot.app'), { recursive: true, preserveTimestamps: true });
  symlinkSync('/Applications', join(staging, 'Applications'));
  copyFileSync(
    join(repoRoot, 'scripts/release/assets/groot-dmg-background.png'),
    join(staging, '.background/groot-dmg-background.png')
  );
  copyFileSync(
    join(repoRoot, 'scripts/release/assets/groot-dmg.DS_Store'),
    join(staging, '.DS_Store')
  );
  run('hdiutil', [
    'create',
    '-volname',
    volumeName,
    '-srcfolder',
    staging,
    '-ov',
    '-format',
    'UDRW',
    writableDmg
  ]);
  run('hdiutil', [
    'convert',
    writableDmg,
    '-format',
    'UDZO',
    '-imagekey',
    'zlib-level=9',
    '-o',
    output
  ]);
  console.log(`Styled DMG created: ${basename(output)}`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
