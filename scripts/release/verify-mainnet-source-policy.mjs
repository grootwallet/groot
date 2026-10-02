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
  ['src-tauri/src/session.rs', '82da6d3a2643710aaa0974f69f0fb7c932172a401ecf33c186e440c8170f35e0'],
  ['.env.mainnet', '1623f3f97de588daea2bbeae1f9c56ebc896b6bc2c22ac238563b46b688ced85'],
  ['.env.multi', '33fc3d5022968d9eaa25bfe749c0b01691c0570611a65255100718d2c50df723'],
  ['package.json', 'f8c983c809dc146a3978a339b1659b1165a07b307b8049d13a34fb1d62fb2e78'],
  ['src-tauri/src/lib.rs', 'dabdac71e693caf73f267f2bcb935e29b1150fe7a0772b6237915e0aacd1683a'],
  [
    'src-tauri/src/managed_gateway.rs',
    '7e5bf0ab7c25346448e4423bab2e748de96684612230c38b797a075fef5866d0'
  ],
  [
    'scripts/network/check-native-builds.sh',
    '3a984ab7ef5f0d7c29d689d2ab39e114d61f1db0efd29a632cea980d7284bef4'
  ],
  ['src/lib/config.ts', '8b6d65ce63fc89423564072ceebf3509dc0ec2c48dac03ee14cb1172ad2045f7'],
  ['src-tauri/build.rs', 'ed1866cf57502e61199d75df9ff407b5ed0be54043ad94525ef6579ad98dfcb7'],
  [
    'src-tauri/src/release_policy.rs',
    '704afcc72ef43f3d51baafd12993c2f3f912c2ca7b45eceadc648474aa1f9c1c'
  ],
  [
    'src-tauri/src/build_network.rs',
    '2cef2d88cda022c23fda1dac4c448b4cae6ee497b6cf39397775a279a96afbb9'
  ],
  [
    'src-tauri/src/process_lock.rs',
    '1efd78e068a904156422ffcb80c8fdc4ffe9bbe33eba510205e247065af26c60'
  ],
  [
    'src-tauri/src/external_signer.rs',
    '8d78a5f3c59acd619f8e8099899e1e902a71429257b8cb7136cabc516a2deabc'
  ],
  ['src-tauri/src/hardware.rs', '9557af47b7a5cbb0571b34e3721983bd5a4dd94d38c1866f9597cfd9435eab9a'],
  ['src-tauri/src/multisig.rs', '2db90d61e79e09c5848e6d206c0a30c381437bffc4704cbbecd9c3d8abcf710d'],
  [
    'src-tauri/src/payjoin_support.rs',
    '4cdb2bc304ec2d77f9793f26de0ffdd4f7fd0cd0b2a5ea38264b97b3cab55220'
  ],
  ['src-tauri/src/recovery.rs', '96eba2aaea0461d8ed067513c044f85f8845837dbf584eb3f93e6969ec5670dc'],
  ['src-tauri/src/network.rs', 'dcf011fb789a0b690b1832a9245df5fc0199318f03a820d10f9a3b1c90f5d76b'],
  ['src-tauri/src/registry.rs', '343aea20f5d09df6abd5c9fdba3b093efc6729c9ece8f180b27a150061753a18'],
  [
    'src-tauri/src/secure_store.rs',
    'aa0acfd33b41716f1d010fba1c7a83e5f50eab2be9def3b9a2d211360c16ebfe'
  ],
  [
    'src-tauri/src/native_backup/macos.rs',
    'bd019caa540dcf49428c3665c3ceb1e6c6699b2d53e33f4a6a51899194bb69ed'
  ],
  ['src-tauri/src/proposal.rs', '9d90a4910b2c0cf91320c59e49f9a8e97e59fca4e4612edcc7dbee6fbaef63ba'],
  ['src-tauri/src/wallet.rs', '5f5ac9b78eb826bcc78fab4f4e4c5ddb75b980546aed3fb34e2ce254c850adf2'],
  [
    'src-tauri/src/wallet/diagnostics.rs',
    '0378b4dadf9698b2a6e04361950d51c65390e175c0c7fc50d88ac6deb2de8b5f'
  ],
  [
    'src-tauri/src/wallet/error_translation.rs',
    '99427e7b78f6fe43ed2148f56c5fef70652406dd90e874288d53c230e9ef1d7d'
  ],
  [
    'src-tauri/src/wallet/explorer_commands.rs',
    '9baf9b2b5976c2199af4fec27c73c5d40e0e5233e219eeac114dfdb03aa20cd0'
  ],
  [
    'src-tauri/src/wallet/export_commands.rs',
    'df58ff8095a3db9b51fa7d857aaea4d4317f1d5432783247a0074070afdebd21'
  ],
  [
    'src-tauri/src/wallet/hardware_commands.rs',
    '70026bcc60d626bb0fb939881f85a94eaaa688090ee9290f01b6990cfa08b125'
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
    'e3715f1c88352f49b0e0649c8a99dc343265d4f11aeb9f9df98eb25dac893f04'
  ],
  [
    'src-tauri/src/wallet/profile_commands.rs',
    '5d6e5a34d3d43995fe5d8dc097a94d7354face4003ccf643b79347baaa1a2500'
  ],
  [
    'src-tauri/src/wallet/payment_draft_commands.rs',
    '0c440716eafad8f94a3e1472cc85e085dfc0305135f0a3fbe7b30af7590a8ad5'
  ],
  [
    'src-tauri/src/wallet/proposal_review.rs',
    '4ad22b36a572493f24ec1022bc9c5f9eedb322357f35c7436e782f3cbcc0fbab'
  ],
  [
    'src-tauri/src/wallet/recovery_scan.rs',
    '71e80492e276b775b48767e0b35a38aa2d3b924de79ed3dd8e6dd6edcb831cdb'
  ],
  [
    'src-tauri/src/wallet/transaction_commands.rs',
    'c144e23f962f07fdb7cb23382ea370538af1b560f95a0385ce251b3cb2be60ea'
  ],
  [
    'src-tauri/src/wallet/verification_evidence.rs',
    '4ef0f98bc226851269cbdb5c41afed5031c6da150dff872b2a870d685e8670b6'
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
    'scripts/release/build-unsigned-multi.sh',
    '2b41651abb9e67ce8239a915a897f0d2513f5280c47e890b450417b788cf031f'
  ],
  [
    'scripts/release/verify-native-frontend-output.mjs',
    '955510f1a602d0fd8d64c4930e3ee0487827d641bac506f9c3e451a1dfb40eec'
  ],
  [
    'scripts/release/prepare-signed-hwi.mjs',
    '2a2d9d33c49f6bdb057a17910548aa53f3b6066fdef5b477290fb0b1cfaecfe2'
  ],
  [
    'scripts/release/verify-signed-hwi.mjs',
    '9502a15c634fc6d2254e562158b4f9fa9ef6f8b415ef3b598ad293394653be95'
  ],
  [
    'scripts/release/package-macos-ga.mjs',
    'a2ff35133c2fc5a106fe266b974b5144de41127af487f17032d7cba5b2c52de7'
  ],
  [
    'scripts/release/create-macos-dmg.mjs',
    '08f51060ec80b00b8810b621ce1529a6f99b5d3c5d3b422bbdfdeeb787aa50bd'
  ],
  [
    'scripts/release/assets/groot-dmg-background.svg',
    'e0372faed535958a61e54eeb1a0bf05bded24e144bef91065c5d9f3a7b027dc2'
  ],
  [
    'scripts/release/build-packaged-macos-app.sh',
    'cd8e3d2b1c26e5caec7dedaffc3b044c629e3fdc369f234120623649f29ecd3b'
  ],
  [
    'scripts/release/verify-packaged-hwi.mjs',
    'e0e571de9307ebba1e1a070d329eb94eb4f70af577b97470a70b3b0dc24e6061'
  ],
  [
    'scripts/release/hwi-entitlements.plist',
    '7dfc81db3e5e4a8337b49aa59b01820abcaef80bd74bada5b489e32473e17a54'
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
  ['src/lib/wallet/tauri.ts', '8652a1e472c459ef63fbb4020df7ecd8cb783ca492c48702c99e8aa15af5ded2'],
  [
    'src/lib/wallet/contracts/errors.ts',
    '6e63267785c41e26e7d41815df26e462d0763800166d7a1c0cf01b3c109e7a10'
  ],
  [
    'src/lib/wallet/contracts/port.ts',
    'e2053587e298312fee55b6f7695042326ad8c3ad75cbe472303a2437e00b41e0'
  ],
  [
    'src/lib/wallet/contracts/runtime.ts',
    '491fbeab7417b02cd0f3725327a3c7c64f39e6d05a901359f96d43226fedd203'
  ],
  [
    'src/routes/diagnostics/+page.svelte',
    '3cdacdc85378c8b7f5ae07a50974cfe275cf26ec36a492081dc1d9c801d1de43'
  ],
  [
    'src/routes/welcome/+page.svelte',
    '032001a48d335a533746861e874f34df9518b5097596e9cc502af01b1e60bce0'
  ],
  [
    'src/routes/unlock/+page.svelte',
    'e9bdedb70faa920c236209f95e58a9d8cd5e51e2ad12c912876b3720cec90924'
  ],
  ['src/routes/+page.svelte', '46f1a0064d27e93b8646952d379dfdef217db213b69ccbf00ac70de76f5ee54d'],
  [
    'src/routes/activity/+page.svelte',
    'e9139fabf8456f5c7bb692cf91a612c49dcb875a715acafcd5ec9420e5e692f6'
  ],
  [
    'src/routes/receive/+page.svelte',
    '502338a683123f8703eaa1ec8706d57ce37533053c51f160f54a923688dfaaef'
  ],
  [
    'src/routes/multisig/receive/+page.svelte',
    '88bd2edf8a551efdfa0b637c538fa04d6e95c64398e9ec6ba911497c66d82b53'
  ],
  [
    'src/routes/settings/+page.svelte',
    '727745cd95830b691511cc3e8bf89a97ccab373aeae6610c4d7e7d7de97f6b3f'
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
    'fdc998607fdd6abf2a3fc297f3dfa9f84ffaa59b11e851e4f13f93753bbf3cbf'
  ],
  [
    'src/routes/multisig/new/+page.svelte',
    '7f64640a98b12a86b84187e65bc4abd98e963921c6c169f6fcf7f61038cf4200'
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
    'da4f6c82f50fc839718e56dbe6ad608e305c256c52c13b0ae7b2b7d9edd255fa'
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
