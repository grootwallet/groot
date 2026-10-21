import assert from 'node:assert/strict';
import test from 'node:test';
import { isAcceptedReleaseVersion } from './release-version.mjs';
test('owner naming admits the approved release lines and numbered 5.3 candidates only', () => {
  for (const version of [
    '0.0.0',
    '0.5.1',
    '0.12.10',
    '5.2.0',
    '5.2.0-rc03',
    '5.3.0-rc1',
    '5.3.0-rc2',
    '5.3.0-rc13'
  ])
    assert.equal(isAcceptedReleaseVersion(version), true, version);
  for (const version of [
    '1.0.0',
    '5.3.0',
    '5.3.0-rc0',
    '5.3.0-rc01',
    '5.3.0-rc',
    '5.3.0-rc1+build',
    '5.3.1-rc1',
    '5.4.0-rc1',
    '5.2.1',
    '5.2.0-beta1',
    '5.2.0-rc3',
    '5.2.0+build',
    'v5.2.0',
    '0.05.1',
    '0.5.1-rc03',
    '5.2.0\n',
    null
  ])
    assert.equal(isAcceptedReleaseVersion(version), false, String(version));
});
