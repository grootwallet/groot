import assert from 'node:assert/strict';
import test from 'node:test';
import { compareBomRefs } from './sbom-order.mjs';

test('SBOM references use locale-independent code-unit ordering', () => {
  const components = ['pkg:z', 'pkg:Z', 'pkg:é', 'pkg:e'].map((ref) => ({ 'bom-ref': ref }));
  components.sort(compareBomRefs);
  assert.deepEqual(
    components.map((component) => component['bom-ref']),
    ['pkg:Z', 'pkg:e', 'pkg:z', 'pkg:é']
  );
});
