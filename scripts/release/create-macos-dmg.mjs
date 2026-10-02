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
mkdirSync(dirname(output), { recursive: true });

const temporaryRoot = mkdtempSync(join(process.env.TMPDIR ?? '/tmp', 'groot-styled-dmg.'));
const staging = join(temporaryRoot, 'staging');
const mount = join(temporaryRoot, 'mount');
const writableDmg = join(temporaryRoot, 'Groot-layout.dmg');
let attached = false;

try {
  mkdirSync(staging, { mode: 0o700 });
  mkdirSync(mount, { mode: 0o700 });
  mkdirSync(join(staging, '.background'), { mode: 0o755 });
  cpSync(app, join(staging, 'Groot.app'), { recursive: true, preserveTimestamps: true });
  symlinkSync('/Applications', join(staging, 'Applications'));
  copyFileSync(
    join(repoRoot, 'scripts/release/assets/groot-dmg-background.png'),
    join(staging, '.background/groot-dmg-background.png')
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
    'attach',
    '-readwrite',
    '-noverify',
    '-noautoopen',
    '-mountpoint',
    mount,
    writableDmg
  ]);
  attached = true;
  run('osascript', [
    '-e',
    'on run argv',
    '-e',
    'set mountPath to item 1 of argv',
    '-e',
    'tell application "Finder"',
    '-e',
    'set dmgFolder to (POSIX file mountPath as alias)',
    '-e',
    'open dmgFolder',
    '-e',
    'set dmgWindow to container window of dmgFolder',
    '-e',
    'set current view of dmgWindow to icon view',
    '-e',
    'set toolbar visible of dmgWindow to false',
    '-e',
    'set statusbar visible of dmgWindow to false',
    '-e',
    'set the bounds of dmgWindow to {120, 120, 780, 540}',
    '-e',
    'set arrangement of icon view options of dmgWindow to not arranged',
    '-e',
    'set icon size of icon view options of dmgWindow to 112',
    '-e',
    'set text size of icon view options of dmgWindow to 14',
    '-e',
    'set background picture of icon view options of dmgWindow to file ".background:groot-dmg-background.png" of dmgFolder',
    '-e',
    'set position of item "Groot.app" of dmgFolder to {170, 220}',
    '-e',
    'set position of item "Applications" of dmgFolder to {490, 220}',
    '-e',
    'update dmgFolder without registering applications',
    '-e',
    'delay 2',
    '-e',
    'close dmgWindow',
    '-e',
    'end tell',
    '-e',
    'end run',
    mount
  ]);
  run('sync', []);
  run('hdiutil', ['detach', mount]);
  attached = false;
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
  if (attached) {
    try {
      run('hdiutil', ['detach', mount, '-force']);
    } catch {
      // Preserve the original failure; temporary cleanup remains best-effort.
    }
  }
  rmSync(temporaryRoot, { recursive: true, force: true });
}
