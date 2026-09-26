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
  ['src-tauri/src/lib.rs', 'c10997e4a806be08742fde042200d57ae479a2a458a234bc7b8344b408c34c2a'],
  [
    'src-tauri/src/managed_gateway.rs',
    '7e5bf0ab7c25346448e4423bab2e748de96684612230c38b797a075fef5866d0'
  ],
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
  ['src-tauri/src/hardware.rs', '484f422d62596bc0cf523eea6c6d12d20aa30710d60d8714f1bad94db64cf85d'],
  ['src-tauri/src/multisig.rs', '2db90d61e79e09c5848e6d206c0a30c381437bffc4704cbbecd9c3d8abcf710d'],
  [
    'src-tauri/src/payjoin_support.rs',
    '4cdb2bc304ec2d77f9793f26de0ffdd4f7fd0cd0b2a5ea38264b97b3cab55220'
  ],
  ['src-tauri/src/recovery.rs', '96eba2aaea0461d8ed067513c044f85f8845837dbf584eb3f93e6969ec5670dc'],
  ['src-tauri/src/network.rs', 'dcf011fb789a0b690b1832a9245df5fc0199318f03a820d10f9a3b1c90f5d76b'],
  ['src-tauri/src/registry.rs', '343aea20f5d09df6abd5c9fdba3b093efc6729c9ece8f180b27a150061753a18'],
  ['src-tauri/src/wallet.rs', 'f7f1af185e397fdd32d307ff9451ecbf25227879f9162852b3b8433809d4546f'],
  [
    'src-tauri/src/wallet/diagnostics.rs',
    '0378b4dadf9698b2a6e04361950d51c65390e175c0c7fc50d88ac6deb2de8b5f'
  ],
  [
    'src-tauri/src/wallet/error_translation.rs',
    '90fe8ccafb3fdb9af3ec72b16d4394d40a34d025484c56252f7b4378cd4d6bdb'
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
    '379d20e68c7227a2fe7177fb3a566769b2b0761a93e8364643d5ef8184476e40'
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
    '3938f5c79e746732f99bda9809768809ae78015c180698d4b3c1d7fb8a87ed7e'
  ],
  [
    'src-tauri/src/wallet/profile_commands.rs',
    'ddb069b53fe7c7b0df8690dd20dd551d81ffbf63d09259a4ed80b6c8358e34b1'
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
    '71e80492e276b775b48767e0b35a38aa2d3b924de79ed3dd8e6dd6edcb831cdb'
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
    'd35e0895c5a0dcb18b6c2df28ec3a58725018781dee270bbfea903f45d5d82db'
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
    '1e74172354c92c9415d08ff9f7d80a756d27ec934be5f68d94b7e1eb17322f59'
  ],
  [
    'src/lib/wallet/live-sync.ts',
    'a5c477820a08a6fda433fbf8c7ac9b0a2d36ede2e16593f0f0c3aebd6538a33c'
  ],
  ['src/lib/wallet/tauri.ts', 'e2ed2554e760c3be602ea9254503249c9e7295b327bcc91ed8c88cd8dce3baaf'],
  [
    'src/lib/wallet/contracts/errors.ts',
    'c24fbc5876dc7aaaf32f4f801506540707eb903882a4dadbadb93559f20fd9ac'
  ],
  [
    'src/lib/wallet/contracts/port.ts',
    'ac06b6d3c03f3fac2b6b7011dc0c98fd463f612cef46a28cf27f482992994c86'
  ],
  [
    'src/lib/wallet/contracts/runtime.ts',
    '491fbeab7417b02cd0f3725327a3c7c64f39e6d05a901359f96d43226fedd203'
  ],
  [
    'src/routes/diagnostics/+page.svelte',
    '94204b88d49144a7d42c21e0e3c686d98c74b46e7626d22ea3fcea1dfb9775c5'
  ],
  [
    'src/routes/welcome/+page.svelte',
    'f18ce862318916b8124192f7b3e869efec44fa7cbb4e84391aba150c7ae4e26b'
  ],
  [
    'src/routes/unlock/+page.svelte',
    'b4758e27251a4d493bca8c12a35962b8ea910398293c4f35c8da103baf13e519'
  ],
  ['src/routes/+page.svelte', '54f51228e6f50f71bbc1a8bd655200f776c544087cde1033aa0e191ff8726b9f'],
  [
    'src/routes/activity/+page.svelte',
    'e9139fabf8456f5c7bb692cf91a612c49dcb875a715acafcd5ec9420e5e692f6'
  ],
  [
    'src/routes/receive/+page.svelte',
    'eb57200cdf1df99fca60d5208e71526d64f367f7497570289cf711e90fb17ae6'
  ],
  [
    'src/routes/multisig/receive/+page.svelte',
    'ced6e9532940158ea31a26c1d51923d13fa7cf955811620aa974e94179cc59be'
  ],
  [
    'src/routes/settings/+page.svelte',
    '056bd0f53252c8b6412299a02f394ede368d8115eda0efe91db98e7c84078e30'
  ],
  [
    'services/core-gateway/gateway.py',
    '2ee659f71725cc15d1d12df28fe366c8374f288c30a15569eadf648e4daca118'
  ],
  [
    'services/core-gateway/provision_client.py',
    '558882823d43889c3e4fc161bcbebdf11fdd410364bc2ca0489c92dc6ebf559a'
  ],
  [
    'services/core-gateway/deploy/groot-core-gateway.service',
    '44e821ba98de16e5ff7012fef1c5bf931d4c977a24e58800dd4c13d1c9a7aa0e'
  ],
  [
    'services/core-gateway/deploy/nginx-location.conf',
    'b40671954640759ff978d0e1e179a8bbb3b0a19dd0e4d2870be4096c23c16359'
  ],
  [
    'services/core-gateway/deploy/nginx-rate-limit.conf',
    'f5c7487c81fd341a2e5d239124a1241330c6ec51e9a5c298d377a6c1500044e2'
  ],
  [
    'services/core-gateway/deploy/nginx-site.conf',
    'a3c9727be8119714f08ec03c3a6c13d0d13aa5221121a903d11fd52af6ec8a2e'
  ],
  [
    'src/routes/hardware/new/+page.svelte',
    '4b7e1edb8ca803ecdb4baeda576e4b2bcfb9e3c8c1d3d63919dca618ed77f579'
  ],
  [
    'src/routes/multisig/new/+page.svelte',
    '1f2407cd89e73e590797f623dda16711b132176818797b1a4c080fec4f488061'
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
    'b72c626a47e97e4f3c7a25135cdc79acef53a91d5122d2d84a7b1646a0d59401'
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
