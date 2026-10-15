#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { createHash, createPublicKey } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripSourceComments } from '../quality/source-lexing.mjs';

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const pinnedPolicySources = new Map([
  [
    'src-tauri/src/wallet/activity.rs',
    '03508eec340547946202d186aa38257e44084c65680f8ac84a9095815fc58705'
  ],
  ['src-tauri/src/session.rs', '82da6d3a2643710aaa0974f69f0fb7c932172a401ecf33c186e440c8170f35e0'],
  ['.env.mainnet', '1623f3f97de588daea2bbeae1f9c56ebc896b6bc2c22ac238563b46b688ced85'],
  ['.env.multi', '33fc3d5022968d9eaa25bfe749c0b01691c0570611a65255100718d2c50df723'],
  ['package.json', '531eadbe75143f477350e4978d1dd1482d63424a09d307af8503e52938648b61'],
  ['src-tauri/Cargo.toml', '974c507bc95a266203cf82dea36da2a3e4ef1058dac11d44b966fb0793c68499'],
  ['src-tauri/tauri.conf.json', '9a3cad2ed29c56ecc5884372ebfaf7ef3409b2106f0844d23c964051cb19c13c'],
  ['LICENSE', 'c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4'],
  ['NOTICE', '4689769c203e1aa8bbc76f0864388cb5f406e4b05b26888df20576c57fa9c3ab'],
  ['THIRD_PARTY_NOTICES.md', 'a181753f36eb3e475cddf31a69d2e75f01a86a79c70de252abb1e73a059407db'],
  [
    'docs/mainnet-release-authorization.json',
    'ba0fe28278fe99401c06324c977d0a5bf79785272c0720ed190da7839ef07d40'
  ],
  [
    'docs/release-update-key.hex',
    '1a5ac5019d65fee6bf904ac5a302400acd1224b518c6030a7be96a95cfa15f42'
  ],
  [
    'docs/release-update-key.pem',
    '4f0307df2320a341e6aefc95ff58f202db001436dcdf14878d517f06148f4c97'
  ],
  [
    'docs/release-git-tag-signing-5.2.0.asc',
    '6cb2edbd1f62d60db2f3646486a4f67ff2e82a7fd29b41742599055d8122f5b6'
  ],
  ['src-tauri/src/lib.rs', '24028069084118c610e824e9a8c2695a10c89cc84a1f4de5c91178d19e19135c'],
  ['src-tauri/src/updates.rs', '23a82cd00f9860f802de3dcc644ed52a4e13b9f64c7c6621de14ff5580d9bbb1'],
  ['src-tauri/src/bsms.rs', '1cf6eef5de13b4124ceac9bdb24064e109658632e90cddb5c5ec84eb30a479f3'],
  [
    'src-tauri/src/managed_gateway.rs',
    '7e5bf0ab7c25346448e4423bab2e748de96684612230c38b797a075fef5866d0'
  ],
  [
    'scripts/network/check-native-builds.sh',
    '3a984ab7ef5f0d7c29d689d2ab39e114d61f1db0efd29a632cea980d7284bef4'
  ],
  ['src/lib/config.ts', '62d858fbd346888ad9f407ed0caeab96c2fd201a5e6e1d6d465c2b293595c82c'],
  ['src-tauri/build.rs', 'ed1866cf57502e61199d75df9ff407b5ed0be54043ad94525ef6579ad98dfcb7'],
  [
    'src-tauri/src/release_policy.rs',
    '704afcc72ef43f3d51baafd12993c2f3f912c2ca7b45eceadc648474aa1f9c1c'
  ],
  [
    'src-tauri/src/build_network.rs',
    'caa8b1d04204424207d41c2d67c6baaf35fadc4b42b4c7440e1aee61e264cfcc'
  ],
  [
    'src-tauri/src/process_lock.rs',
    '9343fd11d26d51ccdc0fb1aece9d23bc96f8bfc3f533b2016be8f2ed1e9c8b0a'
  ],
  [
    'src-tauri/src/external_signer.rs',
    '5d280e028554b943f1d3c9e9addd0fe552ef30a80aaf1693f3728d0c8619a369'
  ],
  ['src-tauri/src/hardware.rs', '9557af47b7a5cbb0571b34e3721983bd5a4dd94d38c1866f9597cfd9435eab9a'],
  ['src-tauri/src/multisig.rs', 'f28d3422dff868c3afc458259ffd5a6e36f56b67b2924ce11e84098c0cba9e8d'],
  [
    'src-tauri/src/payjoin_support.rs',
    '7bbd7fcca836ed2cee535c5cafe7281344ce66174346f88cac1d325a104789dc'
  ],
  ['src-tauri/src/recovery.rs', '96eba2aaea0461d8ed067513c044f85f8845837dbf584eb3f93e6969ec5670dc'],
  ['src-tauri/src/network.rs', 'dcf011fb789a0b690b1832a9245df5fc0199318f03a820d10f9a3b1c90f5d76b'],
  ['src-tauri/src/registry.rs', '343aea20f5d09df6abd5c9fdba3b093efc6729c9ece8f180b27a150061753a18'],
  [
    'src-tauri/src/secure_store.rs',
    'b53f36c03bbc5cb6e3d993f8ebd7a00b4f6e5711b7dec6e1c235297262877ddf'
  ],
  [
    'src-tauri/src/native_backup/macos.rs',
    'bd019caa540dcf49428c3665c3ceb1e6c6699b2d53e33f4a6a51899194bb69ed'
  ],
  ['src-tauri/src/proposal.rs', 'b450b07613edad8922bb54756d0152f551d714937a66065611124bcd80ecdc86'],
  ['src-tauri/src/wallet.rs', '6ad3d6ced7278505001c41c3d992833cea1ebab730a261fb140ab10ab7d2b60e'],
  [
    'src-tauri/src/wallet/diagnostics.rs',
    'e531480fd53ffa5db664d7a80c1bdf806351e648c0f09727cdde32fc0d24158a'
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
    'aad873868714129b1f4703b7f120270d47584cba35cb012ad13e40e1e4554001'
  ],
  [
    'src-tauri/src/wallet/label_interchange.rs',
    '2860bad8c740c384594643a617a9cde2e5c3bd5499efa951d9f78f6a30576bf3'
  ],
  [
    'src-tauri/src/wallet/pin_change.rs',
    '13391f95716019e886b207ad576e0cf669a1ee4354e606cecef36959958ec5e8'
  ],
  [
    'src-tauri/src/wallet/multisig_setup_commands.rs',
    '48b70a7eb79064d22465494349b3f3a0016bafc57f82989b2d62792ad118d994'
  ],
  [
    'src-tauri/src/wallet/multisig_proposal_commands.rs',
    '95170e65fbfab6492b59a73b0e7b1c502e6a0fc2f726d9b35a29ce6ea7d6417e'
  ],
  [
    'src-tauri/src/wallet/profile_commands.rs',
    'dc27d36c9653e8ff6092b1a3d952ed3e4895e959c963192a39fdba8f50a32e91'
  ],
  [
    'src-tauri/src/wallet/payment_draft_commands.rs',
    'a4784bb865410eb90ddce8ab5f439f7e68ac7456657f1ffb588eae0245b1490e'
  ],
  [
    'src-tauri/src/wallet/proposal_review.rs',
    '53b3065c9478d6c78f88891d73afee6533bd3d45db1e86c36d90ff94573bd5bb'
  ],
  [
    'src-tauri/src/wallet/recovery_scan.rs',
    '44792cf2450854ccf6efc226ca258388abb4626b79cf2522e9b9043baa00aa4e'
  ],
  [
    'src-tauri/src/wallet/transaction_commands.rs',
    'b390ce6d1f76e12a4ed96236a8245fcb5ca5e879e5e0ae080f810217db508bb0'
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
    '3fd43a61e515ace8eaf29b292187f52cd0fdfaa40c3ac013e8f0a671bfca238d'
  ],
  [
    'scripts/release/assert-public-release-authorized.mjs',
    '4394809d263a540f2d13dbfa56f7e7c48738531153e80e0217a29f46db720c11'
  ],
  [
    'scripts/release/check-mainnet-gate.sh',
    '257eda7362ccb8b9550a498cc4f9826840191c631e03c90dd07c0d6ca326b5dc'
  ],
  [
    'scripts/release/generate-sbom.mjs',
    '6f3928ae89c26c4408c4406eb615d5270daa5abae25c367bc7493bc6e8c82fbb'
  ],
  [
    'scripts/release/generate-release-notes.mjs',
    '2b5d0f764d1b9c9a810a17b101e65a014d9b6b33fccbd4b3c4295242aba8a465'
  ],
  [
    'scripts/release/verify-update-bundle.mjs',
    'c79a73d116f9ce087c77023fd0b3ca6bdca1d9b2d3f5281daf88831c52b0d185'
  ],
  [
    'docs/release-notes-5.2.0.md',
    '2730c57cbb527e5037d1bcd55bd05da5ed33679b0a85ed4fe7705430f51c27f1'
  ],
  [
    'scripts/release/release-version.mjs',
    '236470c381436d43b51736e8aa7106560289206907ae9216d260880538852a48'
  ],
  [
    'scripts/release/create-macos-dmg.mjs',
    'e67d4a578a5862453d9870443f1256b0853bcbba359197bed95c78f45e975d9b'
  ],
  [
    'scripts/release/assets/groot-dmg-background.svg',
    '6dd2ade8c4028b33122020efaf41d1fb1399dd0f7f8f7c69af4ac7f6afeebadd'
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
    '420528be7a6eedc697b88b4b9f8c1ebb1bc9046481697ac981bdf44068cb51dc'
  ],
  ['src/lib/app-updates.ts', 'f274f7614fb278b403acbc61f849912fea20437c0614b999898b2f85e0500c70'],
  ['src/lib/release-notes.ts', 'd65ea90c0442d61b7bb74d3110ec0a9462a24395ba49db8dd223405f92cd6152'],
  [
    'src/lib/wallet/live-sync.ts',
    '978773bb0b99dcdb15ebbd1146ea0852cacb761ae756ebf00734ac4d85e22814'
  ],
  ['src/lib/wallet/tauri.ts', '30cad2a3c39640d93bff7805a81b533db36840b9a95df0df5b99b8ccb4acd9a9'],
  [
    'src/lib/wallet/contracts/errors.ts',
    'd5f7120ca3ea63a9f7f95c9e14b01b27dbcfb1dc52ac4974d6271963e8eff15f'
  ],
  [
    'src/lib/wallet/contracts/port.ts',
    '5a7cef395cf6a2e984889f369caf14b1d4fabcd2df2e8eec957c3bb19ec4c726'
  ],
  [
    'src/lib/wallet/contracts/updates.ts',
    '33bcbb1173d503a74b411de3bf890bd9f62bc4c7d44457b34c9671fc001903a3'
  ],
  [
    'src/lib/wallet/contracts/runtime.ts',
    '491fbeab7417b02cd0f3725327a3c7c64f39e6d05a901359f96d43226fedd203'
  ],
  [
    'src/routes/diagnostics/+page.svelte',
    'be8fe09c53d785cf5b5bff4ed1da3fd5b305f1cc99158838633550a1e5059c74'
  ],
  [
    'src/routes/welcome/+page.svelte',
    '86c95b644af93749b582cd54944d432a9a7135199904600a3a68dfe224914270'
  ],
  [
    'src/routes/unlock/+page.svelte',
    'c54b2083ad8e8d968e509eb4c17bd4977b81cbd10c6af12c101a72b7caa9b28f'
  ],
  ['src/routes/+page.svelte', '23807865477081103e45e9fc33cba8eb23c7d4701e93a035957c30c287e134e4'],
  [
    'src/routes/activity/+page.svelte',
    'e9139fabf8456f5c7bb692cf91a612c49dcb875a715acafcd5ec9420e5e692f6'
  ],
  [
    'src/routes/receive/+page.svelte',
    '7b4d0c088617c8cf5805bde622ff32e4e2c7b8cec2426a1c17aa06eec688e2c7'
  ],
  [
    'src/routes/multisig/receive/+page.svelte',
    'b7395c5d1a458c1a569b9b5e1869265ee15f94ae93935cad3b33baffcc6b05cb'
  ],
  [
    'src/routes/settings/+page.svelte',
    'b4fdd80399c61ad0184b67c3e179e560724870efdb1072c36ce526780743ec94'
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
    '0f2bd4c50b5960a16b7394a283102c260d449f4cdf787239b2dfb41eb26ac1ac'
  ],
  [
    'src/routes/multisig/new/+page.svelte',
    '27e8a9509ac9dbf064ce066881b9ec467607e0f9fa02ba63eb1aa049e73d3860'
  ],
  [
    'src/routes/multisig/recover/+page.svelte',
    'e0bb095ee7dc9398a7184889a618d844a71726b184f0dd7870accdca4e86edff'
  ],
  [
    'src/routes/multisig/delete/+page.svelte',
    '42b75881b2ec16e6cd3f63905cece1a5205e19a68a085b7ca6e449d952128530'
  ],
  [
    'src/routes/multisig/backup/+page.svelte',
    'e680f74aa4c7b98c4f46d33ae46a1899355377c95c18c66ffcbfa4c7be74ff32'
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
    'f18dea025bff665a3e7c4da895184a843eea54f90cfeb7f810c021744953f8a4'
  ],
  [
    'docs/adr/0068-restart-bound-multi-network-settings.md',
    '0165f21d27f60dfaa56bcf7567a85289a90b478c0964fd3e34344bdd5d84ed1f'
  ]
]);

const pinnedBinaryPolicySources = new Map([
  [
    'scripts/release/assets/groot-dmg-background.png',
    'a6360c8591eb889ebfbd07cf185db40b8d46e438baa6ae09efc6daf54c941cd0'
  ]
]);

export function validatePinnedPolicySources(read, readBytes) {
  if (typeof readBytes !== 'function') {
    throw new Error('the mainnet source policy requires a binary-safe source reader');
  }
  for (const [path, expected] of pinnedPolicySources) {
    const actual = createHash('sha256').update(read(path)).digest('hex');
    if (actual !== expected) {
      throw new Error(`${path} changed after the mainnet-candidate policy snapshot was reviewed`);
    }
  }
  for (const [path, expected] of pinnedBinaryPolicySources) {
    const actual = createHash('sha256').update(readBytes(path)).digest('hex');
    if (actual !== expected) {
      throw new Error(`${path} changed after the mainnet-candidate policy snapshot was reviewed`);
    }
  }
}

export function validateUpdateKeyPair(rawHexSource, publicPemSource) {
  const rawHex = rawHexSource.trim();
  if (!/^[0-9a-f]{64}$/.test(rawHex)) {
    throw new Error('the updater raw public key must be exactly 32 lowercase hex bytes');
  }
  let publicDer;
  try {
    publicDer = createPublicKey(publicPemSource).export({ format: 'der', type: 'spki' });
  } catch {
    throw new Error('the updater public PEM is not a valid public key');
  }
  const expectedDer = Buffer.from(`302a300506032b6570032100${rawHex}`, 'hex');
  if (!publicDer.equals(expectedDer)) {
    throw new Error(
      'the updater raw public key and public PEM do not identify the same Ed25519 key'
    );
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

export function validateMainnetSourcePolicy(read, readBytes) {
  validatePinnedPolicySources(read, readBytes);
  validateUpdateKeyPair(read('docs/release-update-key.hex'), read('docs/release-update-key.pem'));
  validateBrowserNetworkSource(read('src/lib/config.ts'));
  validateBuildScriptSource(read('src-tauri/build.rs'));
  validateReleasePolicySource(read('src-tauri/src/release_policy.rs'));
  validateCompiledNetworkSource(read('src-tauri/src/build_network.rs'));
  validateWalletOpenGuardSource(read('src-tauri/src/wallet.rs'));
  validateCrateDatabaseOpenSources(crateRustSources());
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    validateMainnetSourcePolicy(
      (path) => readFileSync(resolve(repoRoot, path), 'utf8'),
      (path) => readFileSync(resolve(repoRoot, path))
    );
    console.log(
      'Mainnet source policy: activation is confined to fixed builds and the approved restart-bound multi-network identity.'
    );
  } catch (error) {
    console.error(
      `Mainnet source policy failed: ${error instanceof Error ? error.message : error}`
    );
    process.exit(1);
  }
}
