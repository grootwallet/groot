import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./build-mainnet-internal-rc.mjs', import.meta.url), 'utf8');

test('internal mainnet RC uses an ad-hoc-compatible runtime requirement', () => {
  assert.match(source, /GROOT_BUILD_NETWORK: 'mainnet'/);
  assert.match(source, /GROOT_MACOS_SIGNING_TEAM_ID: 'REHEARSAL_ONLY'/);
  assert.match(source, /validateCompiledTeamId\([\s\S]*'REHEARSAL_ONLY'/);
  assert.match(source, /requireProductionSigning: false/);
  assert.doesNotMatch(source, /Developer ID Application|notarytool|stapler|git push/);
});
