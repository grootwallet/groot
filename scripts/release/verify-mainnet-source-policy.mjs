#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripSourceComments } from '../quality/source-lexing.mjs';

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const pinnedPolicySources = new Map([
  [
    'src-tauri/src/wallet/activity.rs',
    '55f0b995153a10d44c58205895ccde3d53205079cdcf58bda28ca95b7d641669'
  ],
  ['src-tauri/src/session.rs', '38b9faf9091ec5d379d2444418f7260d650a4cc151252571bb476a9426ddb19c'],
  ['.env.mainnet', '1623f3f97de588daea2bbeae1f9c56ebc896b6bc2c22ac238563b46b688ced85'],
  ['.env.multi', '33fc3d5022968d9eaa25bfe749c0b01691c0570611a65255100718d2c50df723'],
  ['package.json', '11cd0626ef8f795919abaa142ab307bced9a589e81645f09617e2db26e192970'],
  ['src-tauri/src/lib.rs', 'a5938703c3e0cf141e2360ac0f2b7ba9b01594354bcc7b2ef93f809043db1d25'],
  [
    'scripts/network/check-native-builds.sh',
    '3a984ab7ef5f0d7c29d689d2ab39e114d61f1db0efd29a632cea980d7284bef4'
  ],
  ['src/lib/config.ts', 'b3db968449ada8cb1ee021ea44ad4cfbf97f04e1a1f24344e82c0cf8d7e5ece9'],
  ['src-tauri/build.rs', 'ed1866cf57502e61199d75df9ff407b5ed0be54043ad94525ef6579ad98dfcb7'],
  [
    'src-tauri/src/release_policy.rs',
    '98a4294d987279273e44b3be71d10aec5507394d7eb2aa7e94a8eab71f3ad12b'
  ],
  [
    'src-tauri/src/build_network.rs',
    'f4e06c2259ac862a5552071b6c3c378b3467144f1604d5d7f001baeef9f8cff2'
  ],
  [
    'src-tauri/src/process_lock.rs',
    '1efd78e068a904156422ffcb80c8fdc4ffe9bbe33eba510205e247065af26c60'
  ],
  [
    'src-tauri/src/external_signer.rs',
    '8d78a5f3c59acd619f8e8099899e1e902a71429257b8cb7136cabc516a2deabc'
  ],
  ['src-tauri/src/hardware.rs', '249d827919c71ee59db7544c5bc72f2927b17924fbc8923e570ed3da10ef893c'],
  ['src-tauri/src/multisig.rs', '2db90d61e79e09c5848e6d206c0a30c381437bffc4704cbbecd9c3d8abcf710d'],
  [
    'src-tauri/src/payjoin_support.rs',
    '4cdb2bc304ec2d77f9793f26de0ffdd4f7fd0cd0b2a5ea38264b97b3cab55220'
  ],
  ['src-tauri/src/recovery.rs', '96eba2aaea0461d8ed067513c044f85f8845837dbf584eb3f93e6969ec5670dc'],
  ['src-tauri/src/network.rs', 'dcf011fb789a0b690b1832a9245df5fc0199318f03a820d10f9a3b1c90f5d76b'],
  ['src-tauri/src/registry.rs', '343aea20f5d09df6abd5c9fdba3b093efc6729c9ece8f180b27a150061753a18'],
  ['src-tauri/src/wallet.rs', 'b23f17d659ab8e77f4faa04c0af790bed30d5c554dd79fc4fc259a2190363ce7'],
  [
    'src-tauri/src/wallet/diagnostics.rs',
    '9a2c252808c39d68f9aa25c128b28aaed64d44a4bda3566080c6cc009f116003'
  ],
  [
    'src-tauri/src/wallet/error_translation.rs',
    '88cf9572e5ec97fd99785b2d6440612ea04010e37ddca1e7399f8a573e7752bc'
  ],
  [
    'src-tauri/src/wallet/explorer_commands.rs',
    '9baf9b2b5976c2199af4fec27c73c5d40e0e5233e219eeac114dfdb03aa20cd0'
  ],
  [
    'src-tauri/src/wallet/export_commands.rs',
    '89af70ad5cf3f5c21ce0a7c1a24a9645a915550e19804664f96e89a399c6dc01'
  ],
  [
    'src-tauri/src/wallet/hardware_commands.rs',
    '49d9cccb5d002bf4c3490ec1a2c48ae388c84ed9afd2a880688cd71acd8a068e'
  ],
  [
    'src-tauri/src/wallet/label_interchange.rs',
    '31c3bd2f08911d36c1d3fedfdda8e521fb068be2d41d72a5270d8ea6b2ee10f5'
  ],
  [
    'src-tauri/src/wallet/multisig_setup_commands.rs',
    '3088921f6b3cd460d5a52c3ddd15556eebf461c89b0d387139c62d67dda6baeb'
  ],
  [
    'src-tauri/src/wallet/multisig_proposal_commands.rs',
    '0b09de2a86eafa565140df9e11ccd764c0a059b53ecec0aab71a9f4f98465b9d'
  ],
  [
    'src-tauri/src/wallet/profile_commands.rs',
    'ea44da1f00c88facb10d42688877bc48e416153ee06553ad32597fc8ef71cc59'
  ],
  [
    'src-tauri/src/wallet/payment_draft_commands.rs',
    '0c440716eafad8f94a3e1472cc85e085dfc0305135f0a3fbe7b30af7590a8ad5'
  ],
  [
    'src-tauri/src/wallet/proposal_review.rs',
    '31fc39bf7ce25c99345c2584c186e52ae7e6b036c736d7b2d29d731dd9214b24'
  ],
  [
    'src-tauri/src/wallet/recovery_scan.rs',
    '07157225f51b532610513c07eba251798d5c95bdc902095ea1d03d24b00c2ec6'
  ],
  [
    'src-tauri/src/wallet/transaction_commands.rs',
    '4e6b17435e8fc8591ffd166e612f29ff5934df9647584fb2a53c020a8fe84cb1'
  ],
  [
    'src-tauri/src/wallet/verification_evidence.rs',
    '18e7dabda9b589338794dfa60ffd5081a2174e05d1d4fdcf2518469eda886c28'
  ],
  [
    'src-tauri/tauri.mainnet.conf.json',
    '4f77b92faa441dbb75e5401b9dc7644ab28a5b98fb3ddb3e2b44e51e91caa58e'
  ],
  [
    'src-tauri/tauri.multi.conf.json',
    '1178ebebd4d261927b62e9d9a2d7c9c476daea0b87ae3b2449f0616fec2645ba'
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
    '372801537d0bb1ab08e8cd54908580ae37c1286012fce9d9d2eb6fb63b72caca'
  ],
  ['src/lib/wallet/tauri.ts', 'be2ed274f59464fa0c6f16659765118af29860eeabc793643212a322d0853375'],
  [
    'src/lib/wallet/contracts/errors.ts',
    'd962be99040369e7ec5047919e23f543406bec604fd30a145c158c486838b0a5'
  ],
  [
    'src/lib/wallet/contracts/port.ts',
    '0eb377f6475f4c51dc054175a1f037498890e5d4cf11014d44c9481a5a641d64'
  ],
  [
    'src/lib/wallet/contracts/runtime.ts',
    '150455c59804e5d422ebe6157d1efba64fa461a01d616919b05513383623cc93'
  ],
  [
    'src/routes/diagnostics/+page.svelte',
    '30d72f962c8cd142234f0e6b21d40bf67af380d340384a1ecc9a345608820e90'
  ],
  [
    'src/routes/welcome/+page.svelte',
    '423d7867af4a63f03d8a7947589510668a1ff758ab4b76ddc62d83c8aaf1b487'
  ],
  [
    'src/routes/unlock/+page.svelte',
    '32953a75c52de1df3c557ab6b6edb3a7aef88676e93fad5aa82204c742ca7b3b'
  ],
  ['src/routes/+page.svelte', 'ddebef8c38300f7893e77ec5016aa9daf4493beca77901ac9ae9ea0922f684dd'],
  [
    'src/routes/activity/+page.svelte',
    '5f477d69ac0cf902845def91d3b32d9838dddf9b0aff5e11231d2c1839b9deae'
  ],
  [
    'src/routes/settings/+page.svelte',
    '3c522ab87351df9abed7137b348dd341d9347da287671a5d20b8e862754afd28'
  ],
  [
    'src/routes/hardware/new/+page.svelte',
    'cb0beb5e2faad2fd04557bae312c4f0c6bb6e85fe7adabd6dcf1f14533024e4a'
  ],
  [
    'src/routes/multisig/new/+page.svelte',
    '35bed610371d7e9248fcea7be724af5782fe86d9c12e6261cb04c30d89596d89'
  ],
  [
    'src/lib/multisig/policy.ts',
    '6508181d1d3b460f80f036e51df67691d78ec7155a048cd4e6dafe1566e3f449'
  ],
  [
    'src/lib/multisig/cosigner-import.ts',
    '95715d978345e0de6714640419702f96d15ca38013b4d2fee53cdb67857cad1e'
  ],
  [
    'src/lib/locales/onboarding.ts',
    'f09d3a9be306a96d0605bd0490ad4a897ba436d8e9e01793b35d23731334467b'
  ],
  [
    'scripts/release/build-mainnet-internal-rc.mjs',
    '676a5d84c3bbf44899ca27c9fb43490343f29b2305162f504b98784fa1f6ad37'
  ],
  [
    'docs/adr/0068-restart-bound-multi-network-settings.md',
    '0165f21d27f60dfaa56bcf7567a85289a90b478c0964fd3e34344bdd5d84ed1f'
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
    !/^"regtest" \| "signet" \| "testnet4" \| "mainnet" \| "multi" => \{\} _ => panic!\(\s*"GROOT_BUILD_NETWORK must be exactly regtest, signet, testnet4, mainnet, or multi"\s*\),?$/.test(
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
    '#[cfg(not(any(groot_network="mainnet",groot_network="multi")))]if_network==Network::Bitcoin{returnErr(ReleasePolicyError::MainnetDisabled);}Ok(())';
  if (guard !== expected) {
    throw new Error('trusted-boundary mainnet guard is not the exact fail-closed implementation');
  }
}

export function validateCompiledNetworkSource(source) {
  source = stripSourceComments(source, { rust: true });
  const code = stripSourceComments(source, { rust: true, maskStrings: true });
  rejectGeneratedPolicyCode(code, 'compiled network source');
  const normalized = source.replace(/\s+/g, '');
  const declarations = [
    '#[cfg(groot_network="signet")]constCOMPILED_NETWORK:Network=Network::Signet;',
    '#[cfg(groot_network="testnet4")]constCOMPILED_NETWORK:Network=Network::Testnet4;',
    '#[cfg(any(groot_network="regtest",groot_network="multi"))]constCOMPILED_NETWORK:Network=Network::Regtest;',
    '#[cfg(groot_network="mainnet")]constCOMPILED_NETWORK:Network=Network::Bitcoin;'
  ];
  if (
    declarations.some((declaration) => normalized.split(declaration).length !== 2) ||
    [...code.matchAll(/\bconst\s+COMPILED_NETWORK\s*:\s*Network\s*=/g)].length !== 4
  ) {
    throw new Error('compiled wallet network declarations are not the exact reviewed set');
  }
  const active = 'staticACTIVE_NETWORK:AtomicU8=AtomicU8::new(network_code(COMPILED_NETWORK));';
  if (normalized.split(active).length !== 2) {
    throw new Error('runtime network is not initialized from the reviewed compiled identity');
  }
  const switchBody = rustFunction(source, 'switching_enabled').body.replace(/\s+/g, '');
  if (switchBody !== 'cfg!(groot_network="multi")') {
    throw new Error('runtime switching is not confined to the reviewed multi build');
  }
  const selectionBody = rustFunction(source, 'parse_selectable').body.replace(/\s+/g, '');
  const expectedSelection =
    'matchvalue{"regtest"=>Ok(Network::Regtest),"testnet4"=>Ok(Network::Testnet4),"mainnet"=>Ok(Network::Bitcoin),_=>Err(NetworkSelectionError::Unsupported),}';
  if (selectionBody !== expectedSelection) {
    throw new Error('runtime network selection is not the exact reviewed closed set');
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
      'Mainnet source policy: activation is confined to fixed builds and the restart-bound internal multi-network identity.'
    );
  } catch (error) {
    console.error(
      `Mainnet source policy failed: ${error instanceof Error ? error.message : error}`
    );
    process.exit(1);
  }
}
