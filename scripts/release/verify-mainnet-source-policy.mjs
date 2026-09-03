#!/usr/bin/env node

import { readFileSync } from 'node:fs';
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
    'f227e2669ac091dbac0fdce0a811c4d533dac97d126bf28f048d8994f55d8c87'
  ],
  [
    'src-tauri/src/build_network.rs',
    'ff305684e79a6140db7b533d2fd23bc9288f8edf361793356ed99bee5064a534'
  ],
  ['src-tauri/src/wallet.rs', '8e65b74bd9ab6d18e2e68088e34a3464ff56e21c53028de9de97d61e03edecb9'],
  [
    'src-tauri/src/wallet/hardware_commands.rs',
    '63b97d62c1e7ac6f9bb7b4b0fcf2d60f93559ae3a06e7cb6844bea263e458358'
  ],
  [
    'src-tauri/src/wallet/multisig_setup_commands.rs',
    '4450b9349b295f8edede2b5c08139b1d9cd0ffb23b077cf8fb9c887b5cf15506'
  ],
  [
    'src-tauri/src/wallet/proposal_review.rs',
    '7e64749dd5285a2f5197bba84f326303f15428a5887c80dcdb8608b8aa6752b6'
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
  return { body: source.slice(bodyStart + 1, bodyEnd), start, end: bodyEnd + 1 };
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
  for (const { body } of functions) {
    const guard = body.search(/ensure_runtime_network_enabled\s*\(\s*NETWORK\s*\)/);
    const opens = [
      ...body.matchAll(/(?:\bConnection\s*|<\s*Connection\s*>)\s*::\s*open(?:_with_flags)?\b/g)
    ];
    const open = opens[0]?.index ?? -1;
    if (guard < 0 || opens.length !== 1 || open < 0 || guard > open) {
      throw new Error('wallet databases are no longer guarded before opening');
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

export function validateMainnetSourcePolicy(read) {
  validatePinnedPolicySources(read);
  validateBrowserNetworkSource(read('src/lib/config.ts'));
  validateBuildScriptSource(read('src-tauri/build.rs'));
  validateReleasePolicySource(read('src-tauri/src/release_policy.rs'));
  validateCompiledNetworkSource(read('src-tauri/src/build_network.rs'));
  validateWalletOpenGuardSource(read('src-tauri/src/wallet.rs'));
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
