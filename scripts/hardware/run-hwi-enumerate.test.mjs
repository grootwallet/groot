import assert from 'node:assert/strict';
import test from 'node:test';

import { runBounded } from './run-hwi-enumerate.mjs';

test('bounded runner returns successful output', () => {
  const result = runBounded(process.execPath, ['-e', 'process.stdout.write("safe")'], 1_000);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'safe');
  assert.equal(result.stderr, '');
});

test('bounded runner kills an unattended device prompt', () => {
  const result = runBounded(process.execPath, ['-e', 'setInterval(() => {}, 1_000)'], 50);

  assert.equal(result.status, null);
  assert.equal(result.error?.code, 'ETIMEDOUT');
});
