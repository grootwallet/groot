#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripSourceComments } from '../quality/source-lexing.mjs';

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const pinnedPolicySources = new Map([
  ['src/lib/config.ts', '3a8b9bdf46401edd7adb96d64de1a6f2b8314a05a732f662468aa30fd3682e2e'],
  ['src-tauri/build.rs', '337855d79bc88136efc4ea576ebd50ac3036f745b9cf77275cb9c33fc3aff620'],
  [
    'src-tauri/src/release_policy.rs',
    '1240b0fb0789ecb4ea59279c86861b825ee4d4de6361d692ee1f37bcd26fd2ee'
  ],
  [
    'src-tauri/src/build_network.rs',
    'ff305684e79a6140db7b533d2fd23bc9288f8edf361793356ed99bee5064a534'
  ],
  ['src-tauri/src/wallet.rs', 'a25bca9026ff52f4ae78639d86a55381e0cbfa90446e5416b35d0e8e25d68cf9'],
  [
    'src-tauri/src/wallet/error_translation.rs',
    'cc9fa6af863d74d5f05555cfd3de9db1dd2f583dd73571f856eb01bd6ab004ae'
  ],
  [
    'src-tauri/src/wallet/explorer_commands.rs',
    'b986185f3097f69fc6f35d6b68a1edf0165dfd9cd5f7d1c6e3159393028c677d'
  ],
  [
    'src-tauri/src/wallet/export_commands.rs',
    '12a6ccc9ded20a2b86ea5518a65c107b8b9036524213abd5fe17f90ee50acc9a'
  ],
  [
    'src-tauri/src/wallet/hardware_commands.rs',
    '785da86d2d8efa2a6235c6cd33f3ad057ea5f6aef57c29773c9909ca7fc406ae'
  ],
  [
    'src-tauri/src/wallet/label_interchange.rs',
    '6a986cdc1efb02ca810450bc78aa6fbdcd7d4aaee10d971042e6e4919e16e360'
  ],
  [
    'src-tauri/src/wallet/multisig_setup_commands.rs',
    'f53f2fc7aab9fd713b52a0a00681e222799fb894395c336fcec799c016b0ad3b'
  ],
  [
    'src-tauri/src/wallet/multisig_proposal_commands.rs',
    'e725172eb05469bd0231b4bc6c2ee2e7dca9d63eedd8c4c874f058c7379dfc86'
  ],
  [
    'src-tauri/src/wallet/profile_commands.rs',
    '72eb8ae3d7ee9e07ffb1f7ef3c6e75e729cbb8799914751e9b179665ec9c5062'
  ],
  [
    'src-tauri/src/wallet/payment_draft_commands.rs',
    '8e6bd4e3436d45c45e19ee505920e5b22f105694738b212a8ee4c1e975074af1'
  ],
  [
    'src-tauri/src/wallet/proposal_review.rs',
    '7e64749dd5285a2f5197bba84f326303f15428a5887c80dcdb8608b8aa6752b6'
  ],
  [
    'src-tauri/src/wallet/recovery_scan.rs',
    '07157225f51b532610513c07eba251798d5c95bdc902095ea1d03d24b00c2ec6'
  ],
  [
    'src-tauri/src/wallet/transaction_commands.rs',
    '43c66f2e27b0dc5180aa855bb724f85aca450d352448294f45a997b70c2cd940'
  ],
  [
    'src-tauri/src/wallet/verification_evidence.rs',
    '174dcb84686f4e4c7ae8707f9c79b659177ddc18851e4797fed5d1ca9b640b7c'
  ]
]);

export function validatePinnedPolicySources(read) {
  for (const [path, expected] of pinnedPolicySources) {
    const actual = createHash('sha256').update(read(path)).digest('hex');
    if (actual !== expected) {
      throw new Error(`${path} changed after the mainnet-disabled policy snapshot was reviewed`);
    }
  }
}

export function validateBrowserNetworkSource(source) {
  source = stripSourceComments(source);
  const code = stripSourceComments(source, { maskStrings: true });
  const declarations = [
    ...code.matchAll(/export\s+const\s+SUPPORTED_NETWORKS\s*=\s*\[[\s\S]*?\]\s*as\s+const/g)
  ];
  if (declarations.length !== 1)
    throw new Error('browser network allowlist is not uniquely recognizable');
  const declaration = source.slice(
    declarations[0].index,
    declarations[0].index + declarations[0][0].length
  );
  const match = declaration.match(/SUPPORTED_NETWORKS\s*=\s*\[([\s\S]*?)\]\s*as\s+const/);
  const networks = [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((entry) => entry[1]);
  const nonLiteralElements = match[1].replace(/['"][^'"]+['"]/g, '').replace(/[\s,]/g, '');
  if (
    networks.length !== 3 ||
    nonLiteralElements.length > 0 ||
    !['signet', 'testnet4', 'regtest'].every((network) => networks.includes(network))
  ) {
    throw new Error(`browser network allowlist is unsafe: ${networks.join(', ')}`);
  }
  if (/['"]mainnet['"]/i.test(source)) {
    throw new Error('browser source contains a live mainnet network literal');
  }
}

export function validateBuildScriptSource(source) {
  source = stripSourceComments(source, { rust: true });
  const code = stripSourceComments(source, { rust: true, maskStrings: true });
  rejectGeneratedPolicyCode(code, 'native build');
  if (
    [...code.matchAll(/\blet\s+network\s*=/g)].length !== 1 ||
    !/let\s+network\s*=\s*std\s*::\s*env\s*::\s*var\s*\(\s*"GROOT_BUILD_NETWORK"\s*\)\s*\.\s*unwrap_or_else\s*\(\s*\|\s*_\s*\|\s*"regtest"\.to_owned\s*\(\s*\)\s*\)\s*;/s.test(
      source
    )
  ) {
    throw new Error('native compile-time network input is not the exact reviewed binding');
  }
  const matches = [...code.matchAll(/match\s+network\.as_str\s*\(\s*\)\s*\{/g)];
  if (matches.length !== 1)
    throw new Error('native compile-time network match is not uniquely recognizable');
  const bodyStart = matches[0].index + matches[0][0].lastIndexOf('{');
  const bodyEnd = matchingBrace(code, bodyStart, 'native compile-time network match');
  const body = source
    .slice(bodyStart + 1, bodyEnd)
    .replace(/\s+/g, ' ')
    .trim();
  if (
    !/^"regtest" \| "signet" \| "testnet4" => \{\} _ => panic!\( "GROOT_BUILD_NETWORK must be exactly regtest, signet, or testnet4; mainnet is not compiled into this release" \),?$/.test(
      body
    )
  ) {
    throw new Error('native compile-time network allowlist is not the exact reviewed match');
  }
  const mainnetLiterals = [...source.matchAll(/"mainnet"/g)];
  if (mainnetLiterals.length !== 0) {
    throw new Error('native build contains a live mainnet network literal');
  }
  const cfgEmissions = [...source.matchAll(/cargo:rustc-cfg=groot_network/g)];
  if (
    cfgEmissions.length !== 1 ||
    !/println!\s*\(\s*"cargo:rustc-cfg=groot_network=\\"\{network\}\\""\s*\)\s*;/.test(source)
  ) {
    throw new Error('native compile-time network output is not bound to the reviewed value');
  }
}

export function validateReleasePolicySource(source) {
  source = stripSourceComments(source, { rust: true });
  const code = stripSourceComments(source, { rust: true, maskStrings: true });
  rejectGeneratedPolicyCode(code, 'trusted release policy');
  const matches = [...code.matchAll(/const\s+MAINNET_ENABLED\s*:\s*bool\s*=\s*(true|false)\s*;/g)];
  if (matches.length !== 1 || matches[0][1] !== 'false') {
    throw new Error('trusted-boundary mainnet gate is not explicitly false');
  }
  const guard = rustFunction(source, 'ensure_runtime_network_enabled')
    .body.replace(/\s+/g, '')
    .replace(/,$/, '');
  const expected =
    'ifnetwork==Network::Bitcoin&&!MAINNET_ENABLED{returnErr(ReleasePolicyError::MainnetDisabled);}Ok(())';
  if (guard !== expected) {
    throw new Error('trusted-boundary mainnet guard is not the exact fail-closed implementation');
  }
}

export function validateCompiledNetworkSource(source) {
  source = stripSourceComments(source, { rust: true });
  const code = stripSourceComments(source, { rust: true, maskStrings: true });
  rejectGeneratedPolicyCode(code, 'compiled network source');
  const declarations = [
    ...source.matchAll(
      /#\s*\[\s*cfg\s*\(\s*groot_network\s*=\s*"([^"]+)"\s*\)\s*\]\s*pub\s+const\s+NETWORK\s*:\s*Network\s*=\s*Network::(Signet|Testnet4|Regtest|Bitcoin)\s*;/g
    )
  ];
  const assignments = [
    ...code.matchAll(/\b(?:pub\s+)?(?:const|static)\s+NETWORK\s*:\s*Network\s*=/g)
  ];
  const expected = ['Signet', 'Testnet4', 'Regtest'];
  if (declarations.length !== 3 || assignments.length !== 3) {
    throw new Error('compiled wallet network declarations are not the exact reviewed set');
  }
  for (const declaration of declarations) {
    const cfg = declaration[1];
    const selected = declaration[2];
    if (cfg !== selected.toLowerCase() || !expected.includes(selected)) {
      throw new Error(`compiled wallet network declaration is unsafe: ${cfg ?? 'missing'}`);
    }
  }
  if (/\b(?:pub\s+)?use\b[^;]*\bas\s+NETWORK\b/.test(code)) {
    throw new Error('compiled network source aliases another value as NETWORK');
  }
  if (/groot_network\s*=\s*"mainnet"/i.test(source)) {
    throw new Error('compiled network source contains a mainnet cfg branch');
  }
}

function rejectGeneratedPolicyCode(code, label) {
  if (/\bmacro_rules!|\binclude(?:_str|_bytes)?!/.test(code)) {
    throw new Error(`${label} may not generate or include policy code`);
  }
}

function matchingBrace(code, bodyStart, label) {
  let depth = 0;
  for (let index = bodyStart; index < code.length; index += 1) {
    if (code[index] === '{') depth += 1;
    if (code[index] === '}' && --depth === 0) return index;
  }
  throw new Error(`${label} has an unterminated body`);
}

function rustFunction(source, name) {
  const code = stripSourceComments(source, { rust: true, maskStrings: true });
  const matches = [...code.matchAll(new RegExp(`\\bfn\\s+${name}\\s*\\(`, 'g'))];
  if (matches.length !== 1)
    throw new Error(`required Rust function ${name} must exist exactly once`);
  const start = matches[0].index;
  const prefix = code.slice(Math.max(0, start - 160), start);
  if (/#\s*\[\s*cfg[^\]]*\]\s*(?:pub\s+)?$/.test(prefix)) {
    throw new Error(`required Rust function ${name} may not be conditionally compiled`);
  }
  const bodyStart = code.indexOf('{', start);
  if (bodyStart < 0) throw new Error(`required Rust function ${name} has no body`);
  const bodyEnd = matchingBrace(code, bodyStart, `required Rust function ${name}`);
  return {
    body: source.slice(bodyStart + 1, bodyEnd),
    signature: source.slice(start, bodyStart),
    start,
    end: bodyEnd + 1
  };
}

export function validateWalletOpenGuardSource(source) {
  source = stripSourceComments(source, { rust: true });
  const code = stripSourceComments(source, { rust: true, maskStrings: true });
  rejectGeneratedPolicyCode(code, 'wallet database source');
  if (/\btype\s+\w+\s*=\s*(?:\w+::)*Connection\b|\buse\b[^;]*\bConnection\s+as\s+\w+/.test(code)) {
    throw new Error('wallet database source may not alias Connection');
  }
  const functions = ['open_wallet_database', 'open_existing_wallet_database_read_only'].map(
    (name) => rustFunction(source, name)
  );
  for (const { body, signature } of functions) {
    if (!/permit\s*:\s*&\s*DatabaseOpenPermit/.test(signature)) {
      throw new Error('wallet database opener does not require a typed admission permit');
    }
    const guard = body.search(/validate_database_open_permit\s*\(\s*permit\s*\)/);
    const opens = [
      ...body.matchAll(/(?:\bConnection\s*|<\s*Connection\s*>)\s*::\s*open(?:_with_flags)?\b/g)
    ];
    const open = opens[0]?.index ?? -1;
    if (guard < 0 || opens.length !== 1 || open < 0 || guard > open) {
      throw new Error('wallet databases are no longer admission-guarded before opening');
    }
  }
  let remainder = source;
  for (const section of [...functions].sort((a, b) => b.start - a.start)) {
    remainder = `${remainder.slice(0, section.start)}${remainder.slice(section.end)}`;
  }
  if (/(?:\bConnection\s*|<\s*Connection\s*>)\s*::\s*open(?:_with_flags)?\b/.test(remainder)) {
    throw new Error('wallet source opens a database outside the guarded helpers');
  }
}

function stripCfgTestItems(source) {
  let result = source;
  while (true) {
    const code = stripSourceComments(result, { rust: true, maskStrings: true });
    const match = /#\s*\[\s*cfg\s*\(\s*test\s*\)\s*\]/g.exec(code);
    if (!match) return result;
    const bodyStart = code.indexOf('{', match.index + match[0].length);
    const itemEnd = code.indexOf(';', match.index + match[0].length);
    const end =
      itemEnd >= 0 && (bodyStart < 0 || itemEnd < bodyStart)
        ? itemEnd + 1
        : matchingBrace(code, bodyStart, 'cfg(test) item') + 1;
    result = `${result.slice(0, match.index)}${' '.repeat(end - match.index)}${result.slice(end)}`;
  }
}

export function validateCrateDatabaseOpenSources(sources) {
  const approved = 'src-tauri/src/wallet.rs';
  const openPattern =
    /(?:\b(?:\w+::)*Connection\s*|<\s*(?:\w+::)*Connection\s*>)\s*::\s*open(?:_with_flags)?\b/;
  for (const [path, original] of sources) {
    if (path === approved) continue;
    const source = stripCfgTestItems(original);
    const code = stripSourceComments(source, { rust: true, maskStrings: true });
    if (openPattern.test(code)) {
      throw new Error(`${path} opens a production database outside the guarded wallet helpers`);
    }
    if (
      /\btype\s+\w+\s*=\s*(?:\w+::)*Connection\b|\buse\b[^;]*\bConnection\s+as\s+\w+/.test(code)
    ) {
      throw new Error(`${path} may not alias a database Connection`);
    }
  }
}

function crateRustSources() {
  const root = resolve(repoRoot, 'src-tauri/src');
  const excluded = new Set([
    'src-tauri/src/wallet/tests.rs',
    'src-tauri/src/wallet/funded_acceleration_tests.rs',
    'src-tauri/src/wallet/performance_tests.rs'
  ]);
  const sources = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      if (!entry.isFile() || !entry.name.endsWith('.rs')) continue;
      const path = `src-tauri/src/${absolute.slice(root.length + 1)}`;
      if (!excluded.has(path)) sources.push([path, readFileSync(absolute, 'utf8')]);
    }
  };
  visit(root);
  return sources;
}

export function validateMainnetSourcePolicy(read) {
  validatePinnedPolicySources(read);
  validateBrowserNetworkSource(read('src/lib/config.ts'));
  validateBuildScriptSource(read('src-tauri/build.rs'));
  validateReleasePolicySource(read('src-tauri/src/release_policy.rs'));
  validateCompiledNetworkSource(read('src-tauri/src/build_network.rs'));
  validateWalletOpenGuardSource(read('src-tauri/src/wallet.rs'));
  validateCrateDatabaseOpenSources(crateRustSources());
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    validateMainnetSourcePolicy((path) => readFileSync(resolve(repoRoot, path), 'utf8'));
    console.log('Mainnet source policy: compile-time and trusted-boundary gates remain disabled.');
  } catch (error) {
    console.error(
      `Mainnet source policy failed: ${error instanceof Error ? error.message : error}`
    );
    process.exit(1);
  }
}
