#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripSourceComments } from '../quality/source-lexing.mjs';

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const pinnedPolicySources = new Map([
  ['.env.mainnet', '1623f3f97de588daea2bbeae1f9c56ebc896b6bc2c22ac238563b46b688ced85'],
  ['package.json', '41daa643f2c41c283aefe3045d53892be6abf7f423b211266655982700d21fa9'],
  ['src-tauri/src/lib.rs', 'c1dbf9763cf0cb4f2e8b70e0d37437e6cc596e0b01d9406ffb34cd52df38e130'],
  [
    'scripts/network/check-native-builds.sh',
    '82b8b5de52c786b2c6d18fb8da90fd32f32a8c4714a3ed02866e923c9e81db36'
  ],
  ['src/lib/config.ts', 'f5878ed621a14e06f490bdc200baf9aea46aae958ba76d8c2c43a40b93991414'],
  ['src-tauri/build.rs', '1432516ef85a004cee6e9ee945dc30b7e48477c0b78429267a4fbe513cebdbce'],
  [
    'src-tauri/src/release_policy.rs',
    'b9f8a7f5f1fbf21b4546808e595419b7ec076cd388884e8cf2578644d89e3de1'
  ],
  [
    'src-tauri/src/build_network.rs',
    'e24f8ae8ceb7dda0f1094abbc1b4600b933e88b8bf830af2ff954bd6188364e5'
  ],
  ['src-tauri/src/network.rs', 'dcf011fb789a0b690b1832a9245df5fc0199318f03a820d10f9a3b1c90f5d76b'],
  ['src-tauri/src/registry.rs', '343aea20f5d09df6abd5c9fdba3b093efc6729c9ece8f180b27a150061753a18'],
  ['src-tauri/src/wallet.rs', '022b40674f1897af6493d52cde4cea8d3b737c218c84086075690dd06d6d9582'],
  [
    'src-tauri/src/wallet/diagnostics.rs',
    'ee71b116c3431a4476504199fcad6fa854fbfe214b08640a7d4e6d9a67d17f52'
  ],
  [
    'src-tauri/src/wallet/error_translation.rs',
    'fb7189be7f8756eab6d5c83bae48732337f1a03efa679f06d89a6568a6a957ca'
  ],
  [
    'src-tauri/src/wallet/explorer_commands.rs',
    'bade6574ef1c2ec1acfacf89a9fb5c11a368b6f289030e8b371ed26064b035d3'
  ],
  [
    'src-tauri/src/wallet/export_commands.rs',
    '89af70ad5cf3f5c21ce0a7c1a24a9645a915550e19804664f96e89a399c6dc01'
  ],
  [
    'src-tauri/src/wallet/hardware_commands.rs',
    '973861f13664ed3aa4e7b9b27dd15a90a95a8cc20470a499ee65d5cd7273169c'
  ],
  [
    'src-tauri/src/wallet/label_interchange.rs',
    '6a986cdc1efb02ca810450bc78aa6fbdcd7d4aaee10d971042e6e4919e16e360'
  ],
  [
    'src-tauri/src/wallet/multisig_setup_commands.rs',
    'f41ecd39745512f1a800515d6628c5f4fb26154e7a741c03deeb8d8254a5f57d'
  ],
  [
    'src-tauri/src/wallet/multisig_proposal_commands.rs',
    'c83ef1cef7672ac91c7799559feaeab405082819f822d9bc3505492e525983ee'
  ],
  [
    'src-tauri/src/wallet/profile_commands.rs',
    '20d1fe749932e085919e2f1d3179714c42e2a97562f0647a41660bae70168d80'
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
    'd1b7347fa21990cdfcc61e6b42d4672b3d328d83bf2530a2c8d69f1f1d45f7d7'
  ],
  [
    'src-tauri/src/wallet/verification_evidence.rs',
    '174dcb84686f4e4c7ae8707f9c79b659177ddc18851e4797fed5d1ca9b640b7c'
  ],
  [
    'src-tauri/tauri.mainnet.conf.json',
    '4f77b92faa441dbb75e5401b9dc7644ab28a5b98fb3ddb3e2b44e51e91caa58e'
  ],
  [
    'scripts/release/build-unsigned-mainnet.sh',
    '35b13554ff2de5ff9e7fa5a43d28338502fadbda23a9f0e4a41b688a830ed160'
  ],
  [
    'scripts/release/reproducible-rust-env.sh',
    '8f309ced5719b7e57ef314df6574c875b1495b491be591d62a59bd2fc58e13ae'
  ],
  [
    'scripts/release/normalize-macho-uuid.mjs',
    '6a0c4442e911dc5ed93ccafcd0006f9cbedf24ebf1565d689f3475119800494b'
  ],
  [
    'src/lib/components/AppShell.svelte',
    '5000f1e339495f3eea7fa80ea0bb866010490be7ba531efab54079cd482f88b7'
  ],
  [
    'src/routes/diagnostics/+page.svelte',
    '5ad26d1330f57f6600aee07d5d8053ec13ea45a094f6962661eb5e75996fd822'
  ],
  [
    'src/routes/welcome/+page.svelte',
    'c09dfb653683c98ab6bb626b9f83ead724906f2853c447c651973439b15e9b1a'
  ],
  [
    'src/routes/unlock/+page.svelte',
    '32953a75c52de1df3c557ab6b6edb3a7aef88676e93fad5aa82204c742ca7b3b'
  ],
  ['src/routes/+page.svelte', 'b35e28ff0ad786e299ecc4bb77d6b8424a1f2affb1e4bf1fe8a48890d0fa78e3'],
  [
    'src/routes/settings/+page.svelte',
    'f8e66901ad7b94a7cc5cbeb53222e32cab176e769c468599d0de8139d13beeb9'
  ],
  [
    'src/routes/hardware/new/+page.svelte',
    '305784ec5260941145f793fbf6c8a1dba2c929007f0b180fec945673a16f4c56'
  ],
  [
    'src/routes/multisig/new/+page.svelte',
    '7c013d530b40fc19210a76e0487651b8970338f35988e1ab387a9372cbcd5134'
  ],
  [
    'src/lib/multisig/policy.ts',
    'a06d5d465b3b9bb98f29b93310e4f988f0c5e39686483372733f720eb3ce65aa'
  ],
  [
    'src/lib/multisig/cosigner-import.ts',
    '95715d978345e0de6714640419702f96d15ca38013b4d2fee53cdb67857cad1e'
  ],
  [
    'src/lib/locales/onboarding.ts',
    '16855dee74c1786545cbbfe1ed1cff158d36cd61e26452de00dc34928b7f7a27'
  ],
  [
    'scripts/release/build-mainnet-internal-rc.mjs',
    'f1ce7f4e1ba6798f8fb56e63fc2df05042025a80ab0faa18c19c4ea95d4c4055'
  ]
]);

export function validatePinnedPolicySources(read) {
  for (const [path, expected] of pinnedPolicySources) {
    const actual = createHash('sha256').update(read(path)).digest('hex');
    if (actual !== expected) {
      throw new Error(`${path} changed after the mainnet-candidate policy snapshot was reviewed`);
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
    networks.length !== 4 ||
    nonLiteralElements.length > 0 ||
    !['signet', 'testnet4', 'regtest', 'mainnet'].every((network) => networks.includes(network))
  ) {
    throw new Error(`browser network allowlist is unsafe: ${networks.join(', ')}`);
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
    !/^"regtest" \| "signet" \| "testnet4" \| "mainnet" => \{\} _ => panic!\(\s*"GROOT_BUILD_NETWORK must be exactly regtest, signet, testnet4, or mainnet"\s*\),?$/.test(
      body
    )
  ) {
    throw new Error('native compile-time network allowlist is not the exact reviewed match');
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
  if (/\bMAINNET_ENABLED\b/.test(code))
    throw new Error('trusted-boundary mainnet gate may not use a runtime cfg boolean');
  const guard = rustFunction(source, 'ensure_runtime_network_enabled')
    .body.replace(/\s+/g, '')
    .replace(/,$/, '');
  const expected =
    '#[cfg(not(groot_network="mainnet"))]if_network==Network::Bitcoin{returnErr(ReleasePolicyError::MainnetDisabled);}Ok(())';
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
  const expected = ['Signet', 'Testnet4', 'Regtest', 'Bitcoin'];
  if (declarations.length !== 4 || assignments.length !== 4) {
    throw new Error('compiled wallet network declarations are not the exact reviewed set');
  }
  for (const declaration of declarations) {
    const cfg = declaration[1];
    const selected = declaration[2];
    const expectedCfg = selected === 'Bitcoin' ? 'mainnet' : selected.toLowerCase();
    if (cfg !== expectedCfg || !expected.includes(selected)) {
      throw new Error(`compiled wallet network declaration is unsafe: ${cfg ?? 'missing'}`);
    }
  }
  if (/\b(?:pub\s+)?use\b[^;]*\bas\s+NETWORK\b/.test(code)) {
    throw new Error('compiled network source aliases another value as NETWORK');
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
  const functions = [
    {
      name: 'open_wallet_database',
      permit: 'DatabaseOpenPermit',
      guard: 'validate_database_open_permit',
      result: 'Connection'
    },
    {
      name: 'open_existing_wallet_database_read_only',
      permit: 'DatabaseOpenPermit',
      guard: 'validate_database_open_permit',
      result: 'Connection'
    },
    {
      name: 'open_authentication_database',
      permit: 'AuthenticationDatabaseOpenPermit',
      guard: 'validate_authentication_database_open_permit',
      result: 'AuthenticationDatabase'
    }
  ].map((expected) => ({ ...rustFunction(source, expected.name), ...expected }));
  for (const { body, signature, permit, guard: validator, result } of functions) {
    if (!new RegExp(`permit\\s*:\\s*&\\s*${permit}`).test(signature)) {
      throw new Error('wallet database opener does not require a typed admission permit');
    }
    if (!new RegExp(`->\\s*ApiResult\\s*<\\s*${result}\\s*>`).test(signature)) {
      throw new Error('wallet database opener does not preserve its purpose-bound result type');
    }
    const guard = body.search(new RegExp(`${validator}\\s*\\(\\s*permit\\s*\\)`));
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
    console.log(
      'Mainnet source policy: activation is confined to the dedicated compile-time build.'
    );
  } catch (error) {
    console.error(
      `Mainnet source policy failed: ${error instanceof Error ? error.message : error}`
    );
    process.exit(1);
  }
}
