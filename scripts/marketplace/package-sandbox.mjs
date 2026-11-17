import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { childEnvironment, snapshotSource } from './verify-readiness.mjs';
import { resolveBackendSource, walletRoot } from './backend-process.mjs';
import { inventory } from './deployment/verify-bundle.mjs';

if (process.versions.node !== '24.19.0' || process.argv.length !== 2)
  throw new Error('Use pinned Node 24.19.0; this builder accepts no CLI overrides.');
if (process.env.TAURI_ENV_PLATFORM) throw new Error('A native build cannot package the test site.');
const backend = resolveBackendSource();
const template = fileURLToPath(new URL('./deployment/', import.meta.url));
const generated = join(walletRoot, 'outputs/marketplace-backend/staging-site');
const directory = join(
  walletRoot,
  'outputs/marketplace-backend',
  `package-${new Date().toISOString().replaceAll(':', '-')}-${randomBytes(6).toString('hex')}`
);
const bundle = join(directory, 'bundle');
const lock = join(walletRoot, 'outputs/marketplace-backend/.verification-lock');
let lockOwned = false;
const frontendSource = snapshotSource(walletRoot);
const backendSource = snapshotSource(backend);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const copy = (source, target, filter = () => true) => {
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error('Source symlinks cannot enter the test distribution.');
  if (stat.isDirectory()) {
    mkdirSync(target, { recursive: true, mode: 0o755 });
    for (const name of readdirSync(source).sort())
      if (filter(name)) copy(join(source, name), join(target, name), filter);
  } else if (stat.isFile() && stat.size <= 32 * 1024 * 1024) {
    copyFileSync(source, target);
    chmodSync(target, 0o644);
  } else throw new Error('Unsupported distribution file.');
};

mkdirSync(directory, { recursive: true, mode: 0o700 });
try {
  if (existsSync(lock)) {
    if (
      !process.env.GROOT_SANDBOX_LOCK_OWNER ||
      readFileSync(join(lock, 'owner'), 'utf8') !== process.env.GROOT_SANDBOX_LOCK_OWNER
    )
      throw new Error('Another verifier or packager owns frontend generation.');
  } else {
    mkdirSync(lock);
    lockOwned = true;
    writeFileSync(join(lock, 'owner'), directory, { mode: 0o600 });
  }
  // The adapter writes only this owned, ignored output. Refuse a redirected output path.
  for (const path of [dirname(dirname(generated)), dirname(generated), generated]) {
    try {
      if (lstatSync(path).isSymbolicLink()) throw new Error('Redirected build output.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  rmSync(generated, { recursive: true, force: true });
  const buildLog = execFileSync(
    process.execPath,
    ['node_modules/vite/bin/vite.js', 'build', '--mode', 'marketplace-sandbox'],
    {
      cwd: walletRoot,
      env: {
        ...childEnvironment(process.env, process.execPath),
        GROOT_MARKETPLACE_SANDBOX_BUILD: '1',
        GROOT_MARKETPLACE_BACKEND: '0'
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 8 * 1024 * 1024,
      timeout: 180000
    }
  );
  writeFileSync(join(directory, 'build.log'), buildLog, { mode: 0o600 });
  copy(generated, join(bundle, 'site'), (name) => !name.endsWith('.map'));
  copy(join(backend, 'src'), join(bundle, 'backend/src'), (name) => name.endsWith('.mjs'));
  copy(
    join(backend, 'scripts'),
    join(bundle, 'backend/scripts'),
    (name) => name.endsWith('.mjs') && name !== 'verify.mjs'
  );
  copy(join(backend, 'package.json'), join(bundle, 'backend/package.json'));
  for (const name of ['README.md', 'SECURITY.md', 'CONTRACT.md', '.node-version', '.nvmrc'])
    copy(join(backend, name), join(bundle, 'backend', name));
  copy(join(backend, 'docs'), join(bundle, 'backend/docs'), (name) => name.endsWith('.md'));
  copy(join(walletRoot, 'LICENSE'), join(bundle, 'WALLET-UI-LICENSE'));
  copy(join(template, 'compose.yaml'), join(bundle, 'compose.yaml'));
  copy(join(template, 'Dockerfile.edge'), join(bundle, 'Dockerfile.edge'));
  copy(join(template, 'dockerignore'), join(bundle, '.dockerignore'));
  mkdirSync(join(bundle, 'operations'), { mode: 0o755 });
  for (const name of ['control.mjs', 'verify-bundle.mjs'])
    copy(join(template, name), join(bundle, 'operations', name));
  const html = readFileSync(join(bundle, 'site/index.html'), 'utf8');
  const scriptHashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter((match) => !/\bsrc\s*=/.test(match[1]))
    .map((match) => `'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`);
  if (!scriptHashes.length) throw new Error('Expected reviewed SvelteKit bootstrap scripts.');
  const policy = `default-src 'none'; script-src 'self' ${scriptHashes.join(' ')}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'`;
  writeFileSync(
    join(bundle, 'Caddyfile'),
    readFileSync(join(template, 'Caddyfile'), 'utf8').replace('@@CSP@@', policy)
  );
  writeFileSync(
    join(bundle, 'README.md'),
    readFileSync(join(walletRoot, 'docs/marketplace/staging-deployment.md'))
  );
  if (
    snapshotSource(walletRoot).sha256 !== frontendSource.sha256 ||
    snapshotSource(backend).sha256 !== backendSource.sha256
  )
    throw new Error('Source changed during packaging; do not deploy this incomplete output.');
  const manifest = {
    schemaVersion: 1,
    mode: 'sandbox',
    liveTrading: false,
    nodeVersion: process.versions.node,
    builtAt: new Date().toISOString(),
    frontend: {
      sourceSha256: frontendSource.sha256,
      head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: walletRoot }).toString().trim(),
      clean: !execFileSync('git', ['status', '--porcelain'], { cwd: walletRoot }).toString().trim()
    },
    backend: {
      sourceSha256: backendSource.sha256,
      head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: backend }).toString().trim(),
      clean: !execFileSync('git', ['status', '--porcelain'], { cwd: backend }).toString().trim()
    },
    files: inventory(bundle)
  };
  writeFileSync(join(bundle, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {
    mode: 0o644
  });
  writeFileSync(
    join(directory, 'source-manifests.json'),
    JSON.stringify({ frontendSource, backendSource }, null, 2) + '\n',
    { mode: 0o600 }
  );
  execFileSync('tar', ['-czf', join(directory, 'sandbox.tar.gz'), '-C', directory, 'bundle'], {
    timeout: 30000
  });
  writeFileSync(
    join(directory, 'artifact.json'),
    JSON.stringify(
      {
        status: 'packaged',
        scope: 'Private simulated-money sandbox only; no release authorization.',
        bundle,
        archiveSha256: digest(readFileSync(join(directory, 'sandbox.tar.gz'))),
        manifestSha256: digest(readFileSync(join(bundle, 'manifest.json')))
      },
      null,
      2
    ) + '\n',
    { mode: 0o600 }
  );
  console.log(`Private sandbox package: ${directory}`);
} catch (error) {
  if (error.stderr)
    writeFileSync(join(directory, 'build-error.log'), error.stderr, { mode: 0o600 });
  writeFileSync(join(directory, 'failure.txt'), String(error.message).slice(0, 8192) + '\n', {
    mode: 0o600
  });
  writeFileSync(join(directory, 'FAILED'), 'Incomplete package: rebuild from frozen source.\n', {
    mode: 0o600
  });
  console.error(
    `Sandbox packaging failed; evidence retained in ${relative(walletRoot, directory)}.`
  );
  process.exitCode = 1;
} finally {
  if (lockOwned) rmSync(lock, { recursive: true });
}
