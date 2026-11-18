import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateCameraEntitlements(xml) {
  const keys = [...xml.matchAll(/<key>\s*([^<]+?)\s*<\/key>/g)].map((match) => match[1]);
  if (
    keys.length !== 1 ||
    keys[0] !== 'com.apple.security.device.camera' ||
    !/<key>\s*com\.apple\.security\.device\.camera\s*<\/key>\s*<true\s*\/>/.test(xml)
  )
    throw new Error('Groot must have exactly the camera entitlement, enabled');
}

export function verifyMacosCameraAccess(app) {
  execFileSync('codesign', ['--verify', '--strict', app], { stdio: 'pipe' });
  const entitlements = execFileSync('codesign', ['-d', '--entitlements', ':-', app], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  validateCameraEntitlements(entitlements);
  const description = execFileSync(
    '/usr/libexec/PlistBuddy',
    ['-c', 'Print :NSCameraUsageDescription', join(app, 'Contents/Info.plist')],
    { encoding: 'utf8' }
  ).trim();
  if (!description) throw new Error('Groot must explain camera access in Info.plist');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('usage: verify-macos-camera.mjs /absolute/Groot.app');
  verifyMacosCameraAccess(resolve(process.argv[2]));
  console.log('Camera entitlement and usage description verified.');
}
