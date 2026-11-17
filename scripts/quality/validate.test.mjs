import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validationGroups, runValidation } from './validate.mjs';

const scripts = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url))).scripts;
const groups = (mode) => validationGroups(scripts, mode);
const mandatory = [
  'format:check',
  'test:agent-scaffolding',
  'test:ci-workflows',
  'test:ci-harness',
  'test:boundaries',
  'test:marketplace-transport',
  'test:marketplace-provider',
  'test:secret-surfaces',
  'test:supply-chain',
  'test:brand',
  'test:versions',
  'test:localization',
  'test:hardware-preflight',
  'test:release-gate',
  'release:test:update',
  'release:test:hwi',
  'release:test:compare',
  'test:dev-runtime',
  'check',
  'test',
  'build'
];

test('all validation modes use the same complete, nonduplicated inventory', () => {
  assert.deepEqual(groups('standard').flat().sort(), [...mandatory].sort());
  assert.deepEqual(
    groups('coverage').flat(),
    groups('standard')
      .flat()
      .map((step) => (step === 'test' ? 'test:coverage' : step))
  );
  assert.deepEqual(
    groups('internal').flat(),
    groups('coverage')
      .flat()
      .map((step) => (step === 'test:release-gate' ? 'test:release-gate:internal' : step))
  );
});

test('independent checks overlap within the limit and SvelteKit writers stay serialized', async () => {
  const limit = 3;
  const frontend = new Set(['check', 'test:coverage', 'build']);
  const active = new Set();
  const completed = [];
  let peak = 0;
  const status = await runValidation(
    scripts,
    'coverage',
    async (step) => {
      if (frontend.has(step)) assert.ok([...active].every((other) => !frontend.has(other)));
      active.add(step);
      peak = Math.max(peak, active.size);
      await new Promise((resolve) => setImmediate(resolve));
      active.delete(step);
      completed.push(step);
      return 0;
    },
    limit
  );
  assert.equal(status, 0);
  assert.equal(peak, limit);
  assert.deepEqual(
    completed.filter((step) => frontend.has(step)),
    [...frontend]
  );
  assert.deepEqual(completed.sort(), groups('coverage').flat().sort());
});

test('every failed gate fails validation while independent checks still produce evidence', async () => {
  const plan = groups('internal');
  for (const failing of plan.flat()) {
    const ran = [];
    const status = await runValidation(
      scripts,
      'internal',
      async (step) => {
        ran.push(step);
        // Treat a signal or absent exit status as a failure.
        return step === failing ? null : 0;
      },
      4
    );
    assert.equal(status, 1, failing);
    const expected = plan.flatMap((group) =>
      group.includes(failing) ? group.slice(0, group.indexOf(failing) + 1) : group
    );
    assert.deepEqual(ran.sort(), expected.sort());
  }
});

test('unknown modes, missing gates and invalid concurrency fail closed', async () => {
  assert.throws(() => groups('unknown'), /Unknown validation mode/);
  for (const step of groups('internal').flat()) {
    const incomplete = { ...scripts };
    delete incomplete[step];
    assert.throws(() => validationGroups(incomplete, 'internal'), /Missing validation script/);
  }
  await assert.rejects(
    runValidation(scripts, 'standard', () => 0, 0),
    /positive integer/
  );
});
