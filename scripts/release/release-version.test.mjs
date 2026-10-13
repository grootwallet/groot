import assert from 'node:assert/strict';
import test from 'node:test';
import { isAcceptedReleaseVersion } from './release-version.mjs';
test('owner naming admits existing releases and 5.2 candidates without authorizing other majors', () => {
  for (const version of ['0.0.0', '0.5.1', '0.12.10', '5.2.0', '5.2.0-rc03'])
    assert.equal(isAcceptedReleaseVersion(version), true, version);
  for (const version of [
    '1.0.0',
    '5.3.0',
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
