import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./build-mainnet-internal-rc.mjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
);
const multiConfig = JSON.parse(
  readFileSync(new URL('../../src-tauri/tauri.multi.conf.json', import.meta.url), 'utf8')
);

test('internal RC permits only the reviewed fixed-mainnet and multi-network targets', () => {
  assert.match(source, /const buildTarget = process\.argv\[2\] \?\? 'mainnet'/);
  assert.match(source, /Internal RC build target must be exactly mainnet or multi/);
  assert.match(source, /GROOT_BUILD_NETWORK: buildTarget/);
  assert.match(source, /GROOT_MACOS_SIGNING_TEAM_ID: 'REHEARSAL_ONLY'/);
  assert.match(source, /validateCompiledTeamId\([\s\S]*'REHEARSAL_ONLY'/);
  assert.match(source, /requireProductionSigning: false/);
  assert.doesNotMatch(source, /Developer ID Application|notarytool|stapler|git push/);
});

test('internal multi-network RC uses the HWI-sealed multi configuration', () => {
  assert.equal(
    packageJson.scripts['build:native:multi:internal'],
    'node scripts/release/build-mainnet-internal-rc.mjs multi'
  );
  assert.equal(multiConfig.productName, 'Groot');
  assert.equal(multiConfig.identifier, 'app.groot.wallet');
  assert.equal(multiConfig.build.beforeBuildCommand, 'pnpm build:multi');
  assert.equal(multiConfig.bundle.resources['.release-stage/hwi'], 'hwi');
});

test('internal RC creates the same branded drag-to-Applications DMG used by production', () => {
  assert.match(source, /scripts\/release\/create-macos-dmg\.mjs/);
  assert.match(source, /outputDmg/);
  assert.match(source, /outputDmg,[\s\S]*'Groot'/);
});
