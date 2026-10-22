import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Keep generated Xcode metadata current without changing signing or wallet data.
 * @param {string} source
 * @param {{identifier: string, version: string, bundleVersion: string}} identity
 */
export function prepareIosProject(source, identity) {
  if (
    identity.identifier !== 'app.groot.wallet.mobile.testnet4.dev' ||
    !source.includes(`PRODUCT_BUNDLE_IDENTIFIER: ${identity.identifier}`) ||
    !/^5\.3\.0-rc[1-9][0-9]*$/.test(identity.version) ||
    !/^[0-9]+$/.test(identity.bundleVersion)
  ) {
    throw new Error('Unexpected iOS development identity; generated project was not changed.');
  }
  const external = '      - path: Externals\n';
  const excluded = `${external}        excludes: ["**/*.a"]\n`;
  if (!source.includes(excluded)) {
    if (source.split(external).length !== 2)
      throw new Error('Inspect the generated Externals source entry.');
    source = source.replace(external, excluded);
  }
  if (!source.includes('      - sdk: LocalAuthentication.framework')) {
    const security = '      - sdk: Security.framework';
    if (source.split(security).length !== 2)
      throw new Error('Inspect the generated framework links.');
    source = source.replace(security, `${security}\n      - sdk: LocalAuthentication.framework`);
  }
  if (!/CFBundleShortVersionString: .+/.test(source) || !/CFBundleVersion: .+/.test(source)) {
    throw new Error('Inspect the generated Apple version properties.');
  }
  return source
    .replace(
      /CFBundleShortVersionString: .+/,
      `CFBundleShortVersionString: ${identity.version.split('-')[0]}`
    )
    .replace(/CFBundleVersion: .+/, `CFBundleVersion: "${identity.bundleVersion}"`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(readFileSync('src-tauri/tauri.ios.conf.json', 'utf8'));
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const path = 'src-tauri/gen/apple/project.yml';
  const original = readFileSync(path, 'utf8');
  const updated = prepareIosProject(original, {
    identifier: config.identifier,
    version,
    bundleVersion: config.bundle.iOS.bundleVersion
  });
  if (updated !== original) writeFileSync(path, updated);
}
