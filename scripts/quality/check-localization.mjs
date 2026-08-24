import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse } from 'svelte/compiler';

const files = execFileSync(
  'find',
  ['src/routes', 'src/lib/components', '-name', '*.svelte', '-type', 'f'],
  { encoding: 'utf8' }
)
  .trim()
  .split('\n');

const catalogFiles = [
  'src/lib/i18n-catalog.ts',
  ...execFileSync('find', ['src/lib/locales', '-name', '*.ts', '-type', 'f'], { encoding: 'utf8' })
    .trim()
    .split('\n')
];
const catalogSource = catalogFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
const catalogKeys = new Set(
  [...catalogSource.matchAll(/^  (?:(['"])(.*?)\1|([A-Za-z_][A-Za-z0-9_]*)):\s*\{/gm)].map(
    (match) => (match[2] ?? match[3]).replaceAll("\\'", "'")
  )
);
const missing = new Map();
const rawCopy = [];
const rawExpressions = [];
const fileFilter = process.argv[2];
const allowedUntranslated = new Set([
  'BTC',
  'BDK',
  'PSBT',
  'PDF',
  'QR',
  'WU',
  'Groot',
  'Bitcoin Core',
  'Coldcard',
  'Ledger',
  'Trezor',
  'BitBox02',
  'Jade',
  'Testnet4',
  'Regtest',
  'BSMS 1.0',
  'wsh · sortedmulti · BIP48',
  '2 of 3',
  '3 of 5',
  '8 hex characters',
  'sats',
  'now',
  'of',
  '-of-',
  '· BDK',
  'all',
  'awaitingConfirmation',
  'confirmed',
  'failed',
  'notCounted',
  'pending',
  'replaced',
  'self_spend',
  'sortCoins',
  'px',
  'repeat(',
  ', minmax(0, 1fr))'
]);

for (const file of files) {
  if (fileFilter && !file.startsWith(fileFilter)) continue;
  const source = readFileSync(file, 'utf8');
  const ast = parse(source, { modern: true });
  const seen = new Set();
  const translatedKeys = [];
  function expressionStrings(value, messages = []) {
    if (!value || typeof value !== 'object') return messages;
    if (
      value.type === 'CallExpression' &&
      value.callee?.type === 'Identifier' &&
      value.callee.name === 'translate'
    )
      return messages;
    if (
      value.type === 'Literal' &&
      typeof value.value === 'string' &&
      /[A-Za-z]/.test(value.value)
    ) {
      messages.push(value.value.replace(/\s+/g, ' ').trim());
    }
    if (value.type === 'TemplateLiteral') {
      for (const quasi of value.quasis ?? []) {
        const text = quasi.value?.cooked?.replace(/\s+/g, ' ').trim();
        if (text && /[A-Za-z]/.test(text)) messages.push(text);
      }
    }
    for (const [name, child] of Object.entries(value)) {
      if (name === 'parent' || name === 'metadata') continue;
      if (Array.isArray(child)) child.forEach((entry) => expressionStrings(entry, messages));
      else expressionStrings(child, messages);
    }
    return messages;
  }
  function walk(value, parent) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (
      value.type === 'CallExpression' &&
      value.callee?.type === 'Identifier' &&
      value.callee.name === 'translate'
    ) {
      for (const message of expressionStrings(value.arguments?.[1])) translatedKeys.push(message);
    }
    if (
      value.type === 'CallExpression' &&
      value.callee?.type === 'Identifier' &&
      value.callee.name === 'toast' &&
      value.arguments?.[0]?.type === 'ObjectExpression'
    ) {
      for (const property of value.arguments[0].properties ?? []) {
        if (!['title', 'description'].includes(property.key?.name ?? property.key?.value)) continue;
        if (property.value?.type === 'Literal' && typeof property.value.value === 'string') {
          translatedKeys.push(property.value.value.replace(/\s+/g, ' ').trim());
        } else if (property.value?.type === 'TemplateLiteral') {
          rawExpressions.push(
            `${JSON.stringify(source.slice(property.value.start, property.value.end))}\t${file}`
          );
        } else if (property.value?.type === 'ConditionalExpression') {
          for (const message of expressionStrings(property.value)) translatedKeys.push(message);
        }
      }
    }
    if (value.type === 'Text' && parent?.type !== 'Attribute') {
      const text = (value.data ?? '').replace(/\s+/g, ' ').trim();
      if (/[A-Za-z]/.test(text) && !allowedUntranslated.has(text)) {
        rawCopy.push(`${JSON.stringify(text)}\t${file}`);
      }
    }
    if (value.type === 'ExpressionTag') {
      const attributeName = parent?.type === 'Attribute' ? parent.name : null;
      const userFacingAttribute = [
        'alt',
        'aria-label',
        'description',
        'detail',
        'emptyMessage',
        'hint',
        'label',
        'loadingLabel',
        'placeholder',
        'title'
      ].includes(attributeName);
      const displayExpression = parent?.type !== 'Attribute' || userFacingAttribute;
      const rootType = value.expression?.type;
      if (
        displayExpression &&
        ['ConditionalExpression', 'LogicalExpression', 'TemplateLiteral'].includes(rootType)
      ) {
        for (const message of expressionStrings(value.expression)) {
          if (!allowedUntranslated.has(message)) {
            rawExpressions.push(`${JSON.stringify(message)}\t${file}`);
          }
        }
      }
    }
    for (const [name, child] of Object.entries(value)) {
      if (name === 'parent' || name === 'metadata') continue;
      if (Array.isArray(child)) child.forEach((entry) => walk(entry, value));
      else walk(child, value);
    }
  }
  walk(ast, null);
  for (const key of translatedKeys) {
    if (catalogKeys.has(key)) continue;
    const locations = missing.get(key) ?? [];
    locations.push(file);
    missing.set(key, locations);
  }
}

if (rawExpressions.length > 0) {
  console.error(
    `Localization boundary found ${rawExpressions.length} untranslated expression fragments:`
  );
  [...new Set(rawExpressions)].sort().forEach((entry) => console.error(entry));
  process.exitCode = 1;
}

if (rawCopy.length > 0) {
  console.error(`Localization boundary found ${rawCopy.length} raw rendered messages:`);
  rawCopy.forEach((entry) => console.error(entry));
  process.exitCode = 1;
}

if (missing.size > 0) {
  console.error(`Localization catalog is missing ${missing.size} rendered messages:`);
  for (const [key, locations] of [...missing].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    console.error(`${JSON.stringify(key)}\t${[...new Set(locations)].join(',')}`);
  }
  process.exitCode = 1;
} else if (rawCopy.length === 0) {
  console.log('Localization catalog covers every explicitly localized rendered message.');
}
