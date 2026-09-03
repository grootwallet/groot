import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeEnumeration } from './summarize-enumeration.mjs';

test('reports a ready Jade without exposing its identifiers', () => {
  const result = summarizeEnumeration(
    JSON.stringify([
      {
        type: 'jade',
        model: 'jade',
        fingerprint: 'sensitive-fingerprint',
        path: '/sensitive/device/path'
      }
    ])
  );

  assert.deepEqual(result, { lines: ['jade: ready'], status: 0 });
});

test('maps a canceled Jade login to an actionable sanitized state', () => {
  const result = summarizeEnumeration(
    JSON.stringify([
      {
        type: 'jade',
        model: 'jade',
        code: -13,
        error: 'JadeError: -32000 - private raw message /sensitive/device/path'
      }
    ])
  );

  assert.deepEqual(result, {
    lines: ['jade: detected; login canceled (start again and enter the PIN on Jade)'],
    status: 3
  });
  assert.doesNotMatch(result.lines.join(' '), /-13|-32000|sensitive|private raw/i);
});

test('maps a Jade network mismatch to the Testnet configuration action', () => {
  const result = summarizeEnumeration(
    JSON.stringify([
      {
        type: 'jade',
        model: 'jade',
        code: -13,
        error: 'JadeError: -32003 - private raw message'
      }
    ])
  );

  assert.deepEqual(result, {
    lines: [
      'jade: detected; wallet network mismatch (use a Testnet-configured Jade for Groot Regtest)'
    ],
    status: 3
  });
});

test('uses Jade-specific login guidance for an otherwise unknown Jade error', () => {
  const result = summarizeEnumeration(
    JSON.stringify([{ type: 'jade', model: 'jade', code: -13, error: 'private failure' }])
  );

  assert.deepEqual(result, {
    lines: ['jade: detected; log in on Jade and keep it connected over USB'],
    status: 3
  });
});

test('rejects unreadable and empty enumeration responses safely', () => {
  assert.deepEqual(summarizeEnumeration('{'), {
    lines: ['HWI returned an unreadable device list.'],
    status: 4
  });
  assert.deepEqual(summarizeEnumeration('[]'), {
    lines: ['No hardware wallet detected.'],
    status: 2
  });
});

test('labels removed legacy devices unsupported without exposing identifiers', () => {
  const result = summarizeEnumeration(
    JSON.stringify([
      {
        type: 'keepkey',
        model: 'keepkey',
        fingerprint: 'sensitive-fingerprint',
        path: '/sensitive/device/path'
      },
      {
        type: 'digitalbitbox',
        model: 'digitalbitbox',
        fingerprint: 'other-sensitive-fingerprint',
        path: '/other/sensitive/device/path'
      }
    ])
  );

  assert.deepEqual(result, {
    lines: ['keepkey: unsupported by Groot', 'digitalbitbox: unsupported by Groot'],
    status: 3
  });
  assert.doesNotMatch(result.lines.join(' '), /fingerprint|\/sensitive\/|other-sensitive/);
});
