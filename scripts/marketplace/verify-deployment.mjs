import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import { checkServerIdentity } from 'node:tls';
import { join } from 'node:path';
import {
  ProcessHarness,
  assertFreePort,
  childEnvironment,
  inspectRuntime,
  snapshotSource,
  listBrowserCases,
  verifyBrowserReport
} from './verify-readiness.mjs';
import { walletRoot, resolveBackendSource } from './backend-process.mjs';
import { verifyBundle } from './deployment/verify-bundle.mjs';
import { deploymentEnvironment } from './deployment/control.mjs';

if (process.argv.length !== 2) throw new Error('Deployment verification accepts no CLI overrides.');
const backend = resolveBackendSource();
const stamp = `${new Date().toISOString().replaceAll(':', '-')}-${randomBytes(6).toString('hex')}`;
const directory = join(walletRoot, 'outputs/marketplace-backend', `deployment-${stamp}`);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const port = 5298;
const origin = `https://127.0.0.1:${port}`;
const abort = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => abort.abort());
const harness = new ProcessHarness({
  root: walletRoot,
  signal: abort.signal,
  onBlocked: () => abort.abort()
});
const frontend = snapshotSource(walletRoot);
const service = snapshotSource(backend);
let deployedBundle;
let deployedManifestSha256;
const report = {
  schemaVersion: 1,
  scope: 'Private production-assets sandbox over TLS; simulated money only.',
  startedAt: new Date().toISOString(),
  status: 'running',
  frontendSha256: frontend.sha256,
  backendSha256: service.sha256,
  automaticRetries: 0,
  phases: []
};
const save = () =>
  writeFileSync(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', {
    mode: 0o600
  });
const unchanged = () => {
  if (
    frontend.sha256 !== snapshotSource(walletRoot).sha256 ||
    service.sha256 !== snapshotSource(backend).sha256
  )
    throw new Error('Source drift: stop and start a fresh verification.');
  if (deployedBundle) {
    verifyBundle(deployedBundle);
    if (
      createHash('sha256')
        .update(readFileSync(join(deployedBundle, 'manifest.json')))
        .digest('hex') !== deployedManifestSha256
    )
      throw new Error('Deployment bundle changed during verification.');
  }
};
const base = childEnvironment(process.env, process.execPath);
async function phase(id, args, extra = {}, expected) {
  unchanged();
  console.log(`Starting ${id}`);
  const entry = { id, status: 'running' };
  report.phases.push(entry);
  save();
  const child = harness.start({
    id,
    args,
    env: { ...base, ...extra },
    log: join(directory, `${id}.log`)
  });
  const result = await child.result;
  await child.stop();
  if (result.code !== 0 || result.signal || result.timedOut || abort.signal.aborted) {
    entry.status = 'failed';
    save();
    throw new Error(`${id} failed; retained logs.`);
  }
  if (expected) entry.counts = verifyBrowserReport(extra.GROOT_READINESS_JSON, expected);
  unchanged();
  entry.status = 'passed';
  save();
}

let compose;
let env;
let password;
let hash;
let owned = false;
let lockOwned = false;
const lock = join(walletRoot, 'outputs/marketplace-backend/.verification-lock');
try {
  save();
  mkdirSync(lock);
  lockOwned = true;
  writeFileSync(join(lock, 'owner'), directory, { mode: 0o600 });
  await assertFreePort(port);
  report.runtime = await inspectRuntime(walletRoot);
  await phase('deployment-unit', ['--test', 'scripts/marketplace/deployment/deployment.test.mjs']);
  await phase('resource-ownership', [
    '--test',
    'scripts/marketplace/deployment/ownership.test.mjs'
  ]);
  await phase('package', ['scripts/marketplace/package-sandbox.mjs'], {
    GROOT_SANDBOX_LOCK_OWNER: directory
  });
  const packaged = readFileSync(join(directory, 'package.log'), 'utf8').match(
    /^Private sandbox package: (.+)$/m
  );
  assert.ok(packaged, 'Package command must identify its exact owned output.');
  const packageDirectory = packaged[1].replace(/^<workspace>/, walletRoot.replace(/\/$/, ''));
  const artifact = JSON.parse(readFileSync(join(packageDirectory, 'artifact.json')));
  assert.equal(artifact.status, 'packaged');
  const bundle = artifact.bundle;
  const manifest = verifyBundle(bundle);
  assert.equal(manifest.frontend.sourceSha256, frontend.sha256);
  assert.equal(manifest.backend.sourceSha256, service.sha256);
  report.bundle = {
    directory: bundle,
    archiveSha256: artifact.archiveSha256,
    manifestSha256: artifact.manifestSha256
  };
  deployedBundle = bundle;
  deployedManifestSha256 = artifact.manifestSha256;
  unchanged();
  const config = readFileSync(join(bundle, 'compose.yaml'), 'utf8');
  const nodeImage = config.match(/image: (node:[^\s]+)/)[1];
  const caddyImage = readFileSync(join(bundle, 'Dockerfile.edge'), 'utf8').match(
    /FROM (caddy:[^\s]+)/
  )[1];
  // Deliberately no pulls here: image installation/provenance review precedes acceptance.
  report.images = [nodeImage, caddyImage].map((image) => {
    const details = JSON.parse(
      execFileSync('docker', ['image', 'inspect', image], { encoding: 'utf8' })
    )[0];
    return {
      reference: image,
      id: details.Id,
      architecture: details.Architecture,
      digests: details.RepoDigests
    };
  });
  const tls = join(directory, 'tls');
  mkdirSync(tls, { mode: 0o700 });
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      join(tls, 'key.pem'),
      '-out',
      join(tls, 'cert.pem'),
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1'
    ],
    { stdio: 'ignore' }
  );
  chmodSync(join(tls, 'key.pem'), 0o600);
  password = randomBytes(32).toString('base64url');
  hash = execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '-i',
      '--network',
      'none',
      caddyImage,
      'caddy',
      'hash-password',
      '--algorithm',
      'bcrypt'
    ],
    { input: password + '\n', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 }
  ).trim();
  env = deploymentEnvironment({
    ...base,
    GROOT_SANDBOX_ORIGIN: origin,
    GROOT_SANDBOX_TLS_DIR: tls,
    GROOT_SANDBOX_ACCESS_HASH: hash,
    GROOT_SANDBOX_PROJECT: `groot-test-${randomBytes(8).toString('hex')}`
  });
  const composeArgs = [
    'compose',
    '--project-name',
    env.GROOT_SANDBOX_PROJECT,
    '--file',
    join(bundle, 'compose.yaml')
  ];
  compose = (args, output = 'pipe') =>
    execFileSync('docker', [...composeArgs, ...args], {
      cwd: bundle,
      env,
      encoding: 'utf8',
      stdio: output === 'pipe' ? ['ignore', 'pipe', 'pipe'] : output,
      timeout: 60000
    });
  await phase('control-check', [join(bundle, 'operations/control.mjs'), 'check'], env);
  owned = true;
  await phase('control-up', [join(bundle, 'operations/control.mjs'), 'up'], env);
  const ca = readFileSync(join(tls, 'cert.pem'));
  const authorization = `Basic ${Buffer.from(`tester:${password}`).toString('base64')}`;
  const probe = (path, { headers = {}, method = 'GET', body, authenticate = true } = {}) =>
    new Promise((resolveProbe, rejectProbe) => {
      const text = body === undefined ? undefined : JSON.stringify(body);
      const req = request(
        new URL(path, origin),
        {
          ca,
          // A hostile HTTP Host header must not change the TLS peer being tested.
          servername: '',
          checkServerIdentity: (_hostname, certificate) =>
            checkServerIdentity('127.0.0.1', certificate),
          method,
          headers: {
            ...(authenticate ? { Authorization: authorization } : {}),
            ...(text
              ? {
                  Origin: origin,
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(text)
                }
              : {}),
            ...headers
          },
          timeout: 5000
        },
        (response) => {
          const chunks = [];
          let size = 0;
          response.on('data', (chunk) => {
            size += chunk.length;
            if (size > 1024 * 1024) req.destroy(new Error('Probe body too large.'));
            else chunks.push(chunk);
          });
          response.on('error', rejectProbe);
          response.on('end', () =>
            resolveProbe({
              status: response.statusCode,
              headers: response.headers,
              text: Buffer.concat(chunks).toString('utf8')
            })
          );
        }
      );
      req.on('error', rejectProbe);
      req.on('timeout', () => req.destroy(new Error('Probe timed out.')));
      req.end(text);
    });
  async function healthy() {
    const deadline = Date.now() + 30000;
    let last = 'no response';
    while (Date.now() < deadline && !abort.signal.aborted) {
      try {
        const response = await probe('/healthz');
        if (response.status === 200) return;
        last = `HTTP ${response.status}`;
      } catch (error) {
        last = error.code ?? 'connection failed';
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
    throw new Error(`Owned TLS deployment did not become healthy: ${last}.`);
  }
  await healthy();
  await phase('control-status', [join(bundle, 'operations/control.mjs'), 'status'], env);
  await phase(
    'staging-smoke',
    [
      join(bundle, 'backend/scripts/staging-smoke.mjs'),
      `--origin=${origin}`,
      `--report=${join(directory, 'https-smoke.json')}`
    ],
    {
      NODE_EXTRA_CA_CERTS: join(tls, 'cert.pem'),
      GROOT_STAGING_BASIC_AUTH_USER: 'tester',
      GROOT_STAGING_BASIC_AUTH_PASSWORD: password
    }
  );
  for (const path of ['/healthz', '/v1/capabilities', '/marketplace/backend', '/_app/version.json'])
    assert.equal(
      (await probe(path, { authenticate: false })).status,
      401,
      'Every route needs private access.'
    );
  assert.equal((await probe('/healthz', { headers: { Host: 'evil.example' } })).status, 403);
  assert.equal(
    (await probe('/v1/session', { headers: { Origin: 'https://evil.example' } })).status,
    403
  );
  for (const path of [
    '/marketplace/discover',
    '/wallet',
    '/.env',
    '/src/routes/marketplace/backend/+page.svelte',
    '/@vite/client'
  ])
    assert.equal((await probe(path)).status, 404);
  const capabilities = JSON.parse((await probe('/v1/capabilities')).text);
  assert.equal(capabilities.mode, 'sandbox');
  assert.equal(capabilities.data.liveTrading, false);
  const ui = await probe('/marketplace/backend');
  assert.equal(ui.status, 200);
  assert.match(ui.headers['strict-transport-security'], /max-age=/);
  assert.match(ui.headers['content-security-policy'], /script-src 'self' 'sha256-/);
  assert.equal(ui.headers['cache-control'], 'no-store');
  assert.equal(ui.headers['x-frame-options'], 'DENY');
  const registered = await probe('/v1/accounts', {
    method: 'POST',
    body: {
      username: `restart_${randomBytes(8).toString('hex')}`,
      password: randomBytes(24).toString('hex')
    }
  });
  assert.equal(registered.status, 201);
  const cookieText = registered.headers['set-cookie'][0];
  for (const attribute of ['Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/v1'])
    assert.ok(cookieText.includes(attribute));
  const client = JSON.parse(registered.text).data;
  const sessionHeaders = {
    Cookie: cookieText.split(';')[0],
    'X-Groot-Marketplace-CSRF': client.csrfToken
  };
  const key = randomUUID();
  const offers = await probe('/v1/offers?intent=buy&amountCents=15000', {
    headers: sessionHeaders
  });
  assert.equal(offers.status, 200);
  const offer = JSON.parse(offers.text).data[0];
  assert.ok(offer?.id);
  const quote = await probe('/v1/quotes', {
    method: 'POST',
    headers: { ...sessionHeaders, 'Idempotency-Key': key },
    body: { offerId: offer.id, amountCents: 15000 }
  });
  assert.equal(quote.status, 201);
  const quoteData = JSON.parse(quote.text).data;
  const createKey = randomUUID();
  const trade = await probe('/v1/trades', {
    method: 'POST',
    headers: { ...sessionHeaders, 'Idempotency-Key': createKey },
    body: { quoteId: quoteData.id }
  });
  assert.equal(trade.status, 201);
  compose(['restart', '--timeout', '15', 'backend']);
  await healthy();
  const replay = await probe('/v1/trades', {
    method: 'POST',
    headers: { ...sessionHeaders, 'Idempotency-Key': createKey },
    body: { quoteId: quoteData.id }
  });
  assert.equal(replay.status, trade.status);
  assert.equal(replay.text, trade.text);
  const saved = await probe('/v1/trades', { headers: sessionHeaders });
  assert.equal(JSON.parse(saved.text).data.length, 1);
  const backendId = compose(['ps', '--quiet', 'backend']).trim();
  const details = JSON.parse(
    execFileSync('docker', ['inspect', backendId], { encoding: 'utf8' })
  )[0];
  assert.equal(details.Config.User, '1000:1000');
  assert.equal(details.HostConfig.ReadonlyRootfs, true);
  assert.deepEqual(details.HostConfig.CapDrop, ['ALL']);
  assert.ok(
    !details.HostConfig.PortBindings || !Object.keys(details.HostConfig.PortBindings).length
  );
  const edgeId = compose(['ps', '--quiet', 'edge']).trim();
  const edge = JSON.parse(execFileSync('docker', ['inspect', edgeId], { encoding: 'utf8' }))[0];
  const networks = Object.values(details.NetworkSettings.Networks);
  report.runtimeImages = { backend: details.Image, edge: edge.Image };
  assert.equal(networks.length, 1);
  const network = JSON.parse(
    execFileSync('docker', ['network', 'inspect', networks[0].NetworkID], { encoding: 'utf8' })
  )[0];
  assert.equal(network.Internal, true);
  assert.ok(
    Object.values(edge.NetworkSettings.Networks).some(
      (entry) => entry.NetworkID === networks[0].NetworkID
    )
  );
  assert.equal(Object.values(edge.NetworkSettings.Networks).length, 2);
  assert.deepEqual(edge.NetworkSettings.Ports['8443/tcp'], [
    { HostIp: '127.0.0.1', HostPort: String(port) }
  ]);
  compose([
    'exec',
    '-T',
    'backend',
    'node',
    '-e',
    "const s=require('node:net').connect({host:'1.1.1.1',port:443});s.setTimeout(1000);s.once('connect',()=>{s.destroy();process.exitCode=1});s.once('error',()=>s.destroy());s.once('timeout',()=>s.destroy());"
  ]);
  report.probes = {
    privateAccess: true,
    verifiedTLS: true,
    secureCookies: true,
    deniedRoutes: true,
    hostileOriginHost: true,
    restartIdempotency: true,
    oneSavedTrade: true,
    containerIsolation: true,
    outboundTcpBlocked: true
  };
  save();
  const inventories = new Map();
  for (const browser of ['chromium', 'webkit']) {
    const json = join(directory, `inventory-${browser}.json`);
    await phase(
      `inventory-${browser}`,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--config=scripts/marketplace/deployment/playwright.config.mjs',
        '--list'
      ],
      {
        GROOT_READINESS_PORT: String(port),
        GROOT_READINESS_BROWSER: browser,
        GROOT_READINESS_JSON: json,
        GROOT_READINESS_RESULTS: join(directory, 'inventory-results'),
        GROOT_MARKETPLACE_BACKEND: '1',
        GROOT_MARKETPLACE_DEPLOYMENT: '1',
        GROOT_SANDBOX_TEST_PASSWORD: password
      }
    );
    inventories.set(browser, listBrowserCases(json));
  }
  for (let pass = 1; pass <= 2; pass++)
    for (const browser of ['chromium', 'webkit']) {
      const id = `pass-${pass}-${browser}`;
      await phase(
        id,
        [
          'node_modules/@playwright/test/cli.js',
          'test',
          '--config=scripts/marketplace/deployment/playwright.config.mjs'
        ],
        {
          GROOT_MARKETPLACE_BACKEND: '1',
          GROOT_MARKETPLACE_DEPLOYMENT: '1',
          GROOT_SANDBOX_TEST_PASSWORD: password,
          GROOT_READINESS_PORT: String(port),
          GROOT_READINESS_BROWSER: browser,
          GROOT_READINESS_JSON: join(directory, `${id}.json`),
          GROOT_READINESS_VERSION: join(directory, `${id}-browser.json`),
          GROOT_READINESS_RESULTS: join(directory, `${id}-results`),
          MARKETPLACE_BACKEND_EVIDENCE_DIR: join(directory, `${id}-screenshots`)
        },
        inventories.get(browser)
      );
    }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error.message)
    .replaceAll(password || '<no-password>', '<redacted>')
    .replaceAll(hash || '<no-hash>', '<redacted>');
  console.error(report.error);
  process.exitCode = 1;
} finally {
  if (owned) {
    try {
      const logs = compose(['logs', '--no-color']);
      writeFileSync(
        join(directory, 'containers.log'),
        logs.replaceAll(password, '<redacted>').replaceAll(hash, '<redacted>'),
        { mode: 0o600 }
      );
      execFileSync(process.execPath, [join(deployedBundle, 'operations/control.mjs'), 'down'], {
        cwd: deployedBundle,
        env: { ...env, GROOT_SANDBOX_TLS_DIR: join(directory, 'missing-tls') },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60000
      });
      report.stopped = true;
      report.incidentStopWithoutTLS = true;
      report.retainedTestVolume = `${env.GROOT_SANDBOX_PROJECT}_state`;
    } catch {
      report.status = 'failed';
      report.stopped = false;
      process.exitCode = 1;
    }
  }
  await harness.close();
  if (lockOwned) {
    const { rmSync } = await import('node:fs');
    rmSync(lock, { recursive: true });
  }
  report.finishedAt = new Date().toISOString();
  save();
  console.log(`Deployment verification ${report.status}: ${join(directory, 'report.json')}`);
}
