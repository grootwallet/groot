import { test } from 'node:test';
import assert from 'node:assert/strict';
import childProcess, { execFileSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  chmodSync,
  readFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { assertDeploymentOwnership, control, deploymentEnvironment } from './control.mjs';
import { inventory, verifyBundle } from './verify-bundle.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'groot-deployment-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const tls = join(root, 'tls');
  mkdirSync(tls, { mode: 0o700 });
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:P-256',
      '-nodes',
      '-keyout',
      join(tls, 'key.pem'),
      '-out',
      join(tls, 'cert.pem'),
      '-days',
      '2',
      '-subj',
      '/CN=sandbox.example',
      '-addext',
      'subjectAltName=DNS:sandbox.example,IP:127.0.0.1,IP:::1'
    ],
    { stdio: 'ignore', timeout: 10000 }
  );
  chmodSync(join(tls, 'key.pem'), 0o600);
  return {
    root,
    tls,
    env: {
      GROOT_SANDBOX_ORIGIN: 'https://sandbox.example',
      GROOT_SANDBOX_TLS_DIR: tls,
      GROOT_SANDBOX_ACCESS_HASH: '$2a$14$' + 'a'.repeat(53)
    }
  };
}

test('deployment rejects origin injection, missing access gate, unsafe listeners and exposed TLS keys', (t) => {
  const { tls, env } = fixture(t);
  const valid = deploymentEnvironment(env);
  assert.equal(valid.GROOT_SANDBOX_AUTHORITY, 'sandbox.example');
  assert.equal(valid.GROOT_SANDBOX_BIND, '127.0.0.1');
  for (const origin of [
    'http://sandbox.example',
    'https://sandbox.example/',
    'https://user:pass@sandbox.example',
    'https://sandbox.example/path',
    'https://sandbox.example?query',
    'https://sandbox.example#fragment',
    'https://sandbox.example\n',
    'https://sandbox.example/evil"'
  ])
    assert.throws(() => deploymentEnvironment({ ...env, GROOT_SANDBOX_ORIGIN: origin }));
  for (const change of [
    { GROOT_SANDBOX_ACCESS_HASH: '' },
    { GROOT_SANDBOX_ACCESS_HASH: '$2a$04$' + 'a'.repeat(53) },
    { GROOT_SANDBOX_PORT: '80' },
    { GROOT_SANDBOX_PORT: '65536' },
    { GROOT_SANDBOX_PORT: '5298\n' },
    { GROOT_SANDBOX_BIND: 'evil.example' },
    { GROOT_SANDBOX_PROJECT: '../other' },
    { GROOT_SANDBOX_TLS_DIR: './tls' }
  ])
    assert.throws(() => deploymentEnvironment({ ...env, ...change }));
  chmodSync(join(tls, 'key.pem'), 0o644);
  assert.throws(() => deploymentEnvironment(env));
});

test('deployment refuses symbolic-linked certificate material', (t) => {
  const { root, tls, env } = fixture(t);
  const external = join(root, 'external-key');
  writeFileSync(external, 'key', { mode: 0o600 });
  rmSync(join(tls, 'key.pem'));
  symlinkSync(external, join(tls, 'key.pem'));
  assert.throws(() => deploymentEnvironment(env));
});

test('TLS preflight accepts matching DNS/IP SANs and rejects malformed or mismatched private material', (t) => {
  const { tls, env } = fixture(t);
  const originalCertificate = readFileSync(join(tls, 'cert.pem'));
  const originalKey = readFileSync(join(tls, 'key.pem'));
  for (const origin of ['https://sandbox.example', 'https://127.0.0.1:5298', 'https://[::1]:5298'])
    assert.equal(
      deploymentEnvironment({ ...env, GROOT_SANDBOX_ORIGIN: origin }).GROOT_SANDBOX_ORIGIN,
      origin
    );
  assert.throws(
    () => deploymentEnvironment({ ...env, GROOT_SANDBOX_ORIGIN: 'https://wrong-host.example' }),
    /TLS certificate/
  );
  writeFileSync(join(tls, 'cert.pem'), 'malformed certificate sentinel');
  assert.throws(() => deploymentEnvironment(env), /TLS certificate/);
  writeFileSync(join(tls, 'cert.pem'), originalCertificate);
  writeFileSync(join(tls, 'key.pem'), 'malformed private key sentinel');
  assert.throws(
    () => deploymentEnvironment(env),
    (error) => /TLS certificate/.test(error.message) && !error.message.includes('sentinel')
  );
  writeFileSync(join(tls, 'key.pem'), originalKey);
  const other = fixture(t);
  writeFileSync(join(tls, 'key.pem'), readFileSync(join(other.tls, 'key.pem')));
  assert.throws(() => deploymentEnvironment(env), /TLS certificate/);
});

test('TLS preflight rejects not-yet-valid and expired certificates at the exact validity boundary', (t) => {
  const { tls, env } = fixture(t);
  const certificate = new X509Certificate(readFileSync(join(tls, 'cert.pem')));
  for (const rejectedTime of [
    Date.parse(certificate.validFrom) - 1,
    Date.parse(certificate.validTo)
  ]) {
    const clock = t.mock.method(Date, 'now', () => rejectedTime);
    try {
      assert.throws(() => deploymentEnvironment(env), /TLS certificate/);
    } finally {
      clock.mock.restore();
    }
  }
  assert.equal(deploymentEnvironment(env).GROOT_SANDBOX_ORIGIN, env.GROOT_SANDBOX_ORIGIN);
  execFileSync(
    'openssl',
    [
      'x509',
      '-in',
      join(tls, 'cert.pem'),
      '-signkey',
      join(tls, 'key.pem'),
      '-days',
      '0',
      '-out',
      join(tls, 'expired.pem')
    ],
    { stdio: 'ignore', timeout: 10000 }
  );
  writeFileSync(join(tls, 'cert.pem'), readFileSync(join(tls, 'expired.pem')));
  assert.throws(() => deploymentEnvironment(env), /TLS certificate/);
});

test('incident-stop configuration remains available after certificate expiry or deletion without relaxing scope checks', (t) => {
  const { tls, env } = fixture(t);
  const certificate = new X509Certificate(readFileSync(join(tls, 'cert.pem')));
  const clock = t.mock.method(Date, 'now', () => Date.parse(certificate.validTo));
  try {
    assert.throws(() => deploymentEnvironment(env), /TLS certificate/);
    assert.equal(
      deploymentEnvironment(env, { validateTls: false }).GROOT_SANDBOX_PROJECT,
      'groot-marketplace-sandbox'
    );
  } finally {
    clock.mock.restore();
  }
  rmSync(tls, { recursive: true });
  assert.throws(() => deploymentEnvironment(env));
  assert.equal(deploymentEnvironment(env, { validateTls: false }).GROOT_SANDBOX_TLS_DIR, tls);
  for (const change of [
    { GROOT_SANDBOX_PROJECT: '../foreign-deployment' },
    { GROOT_SANDBOX_ORIGIN: 'http://sandbox.example' },
    { GROOT_SANDBOX_TLS_DIR: './relative' }
  ])
    assert.throws(() => deploymentEnvironment({ ...env, ...change }, { validateTls: false }));
});

test('ownership checks use the exact selected Docker environment rather than another daemon', (t) => {
  const environment = {
    PATH: process.env.PATH,
    DOCKER_HOST: 'unix:///private/tmp/groot-fixture-docker.sock'
  };
  const observed = [];
  const replacement = t.mock.method(childProcess, 'execFileSync', (command, args, options) => {
    assert.equal(command, 'docker');
    observed.push(options.env);
    return '';
  });
  syncBuiltinESMExports();
  try {
    assertDeploymentOwnership('groot-test-environment', environment);
  } finally {
    replacement.mock.restore();
    syncBuiltinESMExports();
  }
  assert.equal(observed.length, 3);
  assert.ok(observed.every((value) => value === environment));
});

test('incident down/status use owned immutable IDs without bundle, Compose, TLS or secrets', (t) => {
  const project = 'groot-test-incident';
  const container = 'a'.repeat(64);
  const network = 'b'.repeat(64);
  const environment = {
    PATH: process.env.PATH,
    DOCKER_HOST: 'unix:///private/tmp/groot-incident-fixture.sock',
    GROOT_SANDBOX_PROJECT: project,
    GROOT_SANDBOX_ORIGIN: 'damaged configuration',
    GROOT_SANDBOX_TLS_DIR: '/does/not/exist',
    GROOT_SANDBOX_ACCESS_HASH: ''
  };
  const labels = {
    'com.groot.marketplace.scope': 'private-sandbox-v1',
    'com.docker.compose.project': project
  };
  const observed = [];
  const replacement = t.mock.method(childProcess, 'execFileSync', (command, args, options) => {
    assert.equal(command, 'docker');
    assert.equal(options.env, environment);
    observed.push(args);
    if (args[0] === 'ps') return container;
    if (args[0] === 'inspect') return JSON.stringify([{ Config: { Labels: labels } }]);
    if (args[0] === 'network' && args[1] === 'ls') return network;
    if (args[0] === 'network' && args[1] === 'inspect') return JSON.stringify([{ Labels: labels }]);
    if (args[0] === 'volume' && args[1] === 'ls') return `${project}_state`;
    if (args[0] === 'volume' && args[1] === 'inspect') return JSON.stringify([{ Labels: labels }]);
    return '';
  });
  syncBuiltinESMExports();
  try {
    assert.deepEqual(control('status', environment), {
      containers: [container],
      networks: [network],
      volume: `${project}_state`
    });
    assert.deepEqual(observed.at(-1), [
      'container',
      'inspect',
      '--format',
      '{{.Id}} {{.Name}} {{.State.Status}}',
      container
    ]);
    observed.length = 0;
    control('down', environment);
    assert.deepEqual(observed.slice(-3), [
      ['container', 'stop', '--timeout', '15', container],
      ['container', 'rm', container],
      ['network', 'rm', network]
    ]);
    assert.ok(observed.every((args) => args[0] !== 'compose'));
    assert.ok(observed.every((args) => !(args[0] === 'volume' && args[1] === 'rm')));
    assert.ok(observed.find((args) => args[0] === 'ps').includes('--no-trunc'));
  } finally {
    replacement.mock.restore();
    syncBuiltinESMExports();
  }
});

test('incident operations reject foreign resources and malformed names or IDs before mutation', (t) => {
  const project = 'groot-test-incident-denial';
  const container = 'c'.repeat(64);
  const observed = [];
  let foreign = true;
  let identity = container;
  const replacement = t.mock.method(childProcess, 'execFileSync', (command, args) => {
    assert.equal(command, 'docker');
    observed.push(args);
    if (args[0] === 'ps') return identity;
    if (args[0] === 'inspect')
      return JSON.stringify([
        {
          Config: {
            Labels: {
              'com.groot.marketplace.scope': foreign ? 'foreign' : 'private-sandbox-v1',
              'com.docker.compose.project': project
            }
          }
        }
      ]);
    return '';
  });
  syncBuiltinESMExports();
  try {
    for (const action of ['status', 'down'])
      assert.throws(
        () => control(action, { GROOT_SANDBOX_PROJECT: project }),
        /another application/
      );
    foreign = false;
    identity = '--all';
    assert.throws(() => control('down', { GROOT_SANDBOX_PROJECT: project }), /identity/);
    const calls = observed.length;
    assert.throws(() => control('down', { GROOT_SANDBOX_PROJECT: '--all' }), /deployment name/i);
    assert.equal(observed.length, calls);
    assert.ok(observed.every((args) => args[0] !== 'container'));
    assert.ok(observed.every((args) => !args.includes('rm')));
  } finally {
    replacement.mock.restore();
    syncBuiltinESMExports();
  }
});

test('complete bundle inventory detects tampering, extra files, missing files and symlink replacement', (t) => {
  const { root } = fixture(t);
  const bundle = join(root, 'bundle');
  mkdirSync(bundle);
  writeFileSync(join(bundle, 'runtime.mjs'), 'export const mode="sandbox";');
  const manifest = {
    schemaVersion: 1,
    mode: 'sandbox',
    liveTrading: false,
    nodeVersion: '24.19.0',
    files: inventory(bundle)
  };
  writeFileSync(join(bundle, 'manifest.json'), JSON.stringify(manifest));
  assert.equal(verifyBundle(bundle).mode, 'sandbox');
  const original = readFileSync(join(bundle, 'runtime.mjs'));
  writeFileSync(join(bundle, 'runtime.mjs'), 'tampered');
  assert.throws(() => verifyBundle(bundle));
  writeFileSync(join(bundle, 'runtime.mjs'), original);
  writeFileSync(join(bundle, '.env'), 'accidental secret');
  assert.throws(() => verifyBundle(bundle));
  rmSync(join(bundle, '.env'));
  rmSync(join(bundle, 'runtime.mjs'));
  assert.throws(() => verifyBundle(bundle));
  symlinkSync(join(root, 'tls/key.pem'), join(bundle, 'runtime.mjs'));
  assert.throws(() => verifyBundle(bundle));
});

test('a valid file inventory cannot authorize a live-mode or unknown-runtime bundle', (t) => {
  const { root } = fixture(t);
  const bundle = join(root, 'bundle');
  mkdirSync(bundle);
  for (const change of [
    { mode: 'live' },
    { liveTrading: true },
    { nodeVersion: '20.0.0' },
    { schemaVersion: 2 }
  ]) {
    writeFileSync(
      join(bundle, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        mode: 'sandbox',
        liveTrading: false,
        nodeVersion: '24.19.0',
        files: [],
        ...change
      })
    );
    assert.throws(() => verifyBundle(bundle));
  }
});
