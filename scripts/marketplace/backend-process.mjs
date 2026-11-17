import { readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertFreePort, childEnvironment, identifyServer } from './verify-readiness.mjs';

export const walletRoot = fileURLToPath(new URL('../../', import.meta.url));
/** Only an explicitly selected local sibling checkout can supply the separate service. */
export function resolveBackendSource(
  value = process.env.GROOT_MARKETPLACE_SOURCE ??
    join(dirname(walletRoot.replace(/\/$/, '')), 'groot-marketplace')
) {
  if (!isAbsolute(value))
    throw new Error('GROOT_MARKETPLACE_SOURCE must be an absolute local checkout path.');
  const source = realpathSync(value);
  const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
  if (
    manifest.name !== '@grootwallet/marketplace' ||
    manifest.private !== true ||
    manifest.engines?.node !== process.versions.node
  )
    throw new Error('The separate marketplace checkout or pinned runtime is incompatible.');
  return source;
}
export async function ready(child) {
  let timer;
  await Promise.race([
    child.ready,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Owned sandbox did not become ready.')), 45000);
    })
  ]).finally(() => clearTimeout(timer));
}
/** Both listeners are strict, exclusively owned loopback children. No existing listener is reused. */
export async function startSandbox({
  harness,
  source,
  directory,
  frontendPort,
  backendPort,
  database,
  nonce
}) {
  await assertFreePort(frontendPort);
  await assertFreePort(backendPort);
  const env = childEnvironment(process.env, process.execPath);
  const backend = harness.start({
    id: 'backend',
    args: [join(source, 'src/main.mjs')],
    env: {
      ...env,
      GROOT_MARKETPLACE_MODE: 'sandbox',
      GROOT_MARKETPLACE_HOST: '127.0.0.1',
      GROOT_MARKETPLACE_PORT: String(backendPort),
      GROOT_MARKETPLACE_ORIGIN: `http://127.0.0.1:${frontendPort}`,
      GROOT_MARKETPLACE_DATABASE: database,
      GROOT_MARKETPLACE_SECURE_COOKIES: '0'
    },
    log: join(directory, 'backend.log'),
    server: true,
    timeoutMs: 12 * 60 * 60 * 1000
  });
  await ready(backend);
  const frontend = harness.start({
    id: 'frontend',
    args: ['scripts/marketplace/readiness-server.mjs'],
    env: {
      ...env,
      GROOT_MARKETPLACE_BACKEND: '1',
      GROOT_MARKETPLACE_PROXY_PORT: String(backendPort),
      GROOT_READINESS_PORT: String(frontendPort),
      GROOT_READINESS_NONCE: nonce
    },
    log: join(directory, 'frontend.log'),
    server: true,
    timeoutMs: 12 * 60 * 60 * 1000
  });
  await ready(frontend);
  await identifyServer(frontendPort, nonce);
  return { backend, frontend };
}
