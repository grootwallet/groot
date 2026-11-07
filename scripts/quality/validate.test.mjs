import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validationSteps, runValidation } from './validate.mjs';
const scripts = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url))).scripts;

test('CI replaces one plain unit pass with coverage and preserves the mandatory inventory', () => {
  const base = scripts.validate.split(' && ').map((s) => s.slice(5));
  assert.deepEqual(
    validationSteps(scripts, 'coverage'),
    base.map((s) => (s === 'test' ? 'test:coverage' : s))
  );
  assert.equal(validationSteps(scripts, 'coverage').filter((s) => s === 'test:coverage').length, 1);
  assert.ok(validationSteps(scripts, 'coverage').includes('test:release-gate'));
});
test('internal acceptance replaces only the explicit source-approval boundary', () => {
  assert.deepEqual(
    validationSteps(scripts, 'internal'),
    validationSteps(scripts, 'coverage').map((s) =>
      s === 'test:release-gate' ? 'test:release-gate:internal' : s
    )
  );
});
test('every gate failure stops validation including failures after internal source checks', () => {
  const steps = validationSteps(scripts, 'internal');
  for (let failing = 0; failing < steps.length; failing++) {
    const ran = [];
    assert.equal(
      runValidation(scripts, 'internal', (s) => {
        ran.push(s);
        return ran.length - 1 === failing ? 1 : 0;
      }),
      1
    );
    assert.deepEqual(ran, steps.slice(0, failing + 1));
  }
  assert.equal(
    runValidation(scripts, 'internal', () => 0),
    0
  );
  assert.equal(
    runValidation(scripts, 'internal', () => null),
    1
  );
});
test('unknown modes, missing/duplicate gates and unsupported canonical steps fail closed', () => {
  for (const validate of [
    'pnpm test',
    'pnpm test:release-gate',
    'pnpm test && pnpm test && pnpm test:release-gate',
    'pnpm missing && pnpm test && pnpm test:release-gate',
    'echo unsafe && pnpm test && pnpm test:release-gate'
  ]) {
    assert.throws(() => validationSteps({ ...scripts, validate }, 'internal'));
  }
  assert.throws(() => validationSteps(scripts, 'unknown'));
});
