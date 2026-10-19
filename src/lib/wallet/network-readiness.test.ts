import { expect, it } from 'vitest';
import { requiresMobileNodeSetup } from './network-readiness';

it('requires explicit remote RPC configuration on mobile before scan approval', () => {
  const configured = {
    backend: { type: 'remote_core' as const, url: 'https://synthetic.example/' },
    auth: 'user_pass' as const,
    username: 'synthetic-user'
  };
  expect(requiresMobileNodeSetup(configured)).toBe(false);
  expect(requiresMobileNodeSetup(null)).toBe(true);
  expect(
    requiresMobileNodeSetup({
      ...configured,
      backend: { type: 'local_core', url: 'http://127.0.0.1:48332' }
    })
  ).toBe(true);
  expect(requiresMobileNodeSetup({ ...configured, auth: 'cookie' })).toBe(true);
  expect(requiresMobileNodeSetup({ ...configured, username: ' ' })).toBe(true);
  expect(
    requiresMobileNodeSetup({ ...configured, backend: { type: 'remote_core', url: '' } })
  ).toBe(true);
});
