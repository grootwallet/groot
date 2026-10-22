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
  ['src-tauri/src/session.rs', '61cf28ce44dd7262c0c3567d1d9bc456f1861520effaf00cbda501657ad1193e'],
  ['.env.mainnet', '1623f3f97de588daea2bbeae1f9c56ebc896b6bc2c22ac238563b46b688ced85'],
  ['.env.multi', '33fc3d5022968d9eaa25bfe749c0b01691c0570611a65255100718d2c50df723'],
  ['package.json', '8e083a40e312704fd633f32aff473ec2d20aad84d28af3f694f250c4c3b19a20'],
  ['src-tauri/Cargo.toml', '8d583ce7ba54ef7fdb85ee8a31402a89a021a66f20af71b702eaaacfaf67d480'],
  ['src-tauri/tauri.conf.json', '54b2994bdf81d8432aec6bacd61f8c674440d30dacba569d4d764196cd3b0070'],
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
  ['src-tauri/src/lib.rs', '64651858bf91aa46ef1fd3a6ccc13c567cfc6b602ec5ac4e113ffb63d1880f73'],
  ['src-tauri/src/updates.rs', 'e2ae9ae54951fc7ca0e573a58ec706a1310cb269f5f31b2519085bd13930e15b'],
  ['src-tauri/src/bsms.rs', '8e40d3bcbeb03fa07b05893882b00426d95ca979cd869f9713c05442f5a2301f'],
  [
    'src-tauri/src/managed_gateway.rs',
    '7e5bf0ab7c25346448e4423bab2e748de96684612230c38b797a075fef5866d0'
  ],
  [
    'scripts/network/check-native-builds.sh',
    '3a984ab7ef5f0d7c29d689d2ab39e114d61f1db0efd29a632cea980d7284bef4'
  ],
  ['src/lib/config.ts', '85ac672da6d548c26f58f7ac518de195032211132aa66dc347ad732e44b61906'],
  ['src-tauri/build.rs', '972650724376f7c5ac32325cf09425cd887e41f6c155b5199626dffccac37215'],
  [
    'src-tauri/src/release_policy.rs',
    '4875793e572f074b6fa9785ea4438a0ca868603b975dba5073c2c50604114eac'
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
  ['src-tauri/src/hardware.rs', 'b63bdc4bbe90f7417d4205cd9b5f1f4de5d83bcd13c572c1ab580a52c6c78cbc'],
  ['src-tauri/src/multisig.rs', '202d20d12b7df47a3c797045b4b73865813cfe547240d0bb104e9b29ebfc115e'],
  [
    'src-tauri/src/payjoin_support.rs',
    '7bbd7fcca836ed2cee535c5cafe7281344ce66174346f88cac1d325a104789dc'
  ],
  ['src-tauri/src/recovery.rs', '4e90f0dee7359a276d6f5f5ded3e8246869396b598dc889d63a2beeb0471265a'],
  ['src-tauri/src/network.rs', 'dcf011fb789a0b690b1832a9245df5fc0199318f03a820d10f9a3b1c90f5d76b'],
  ['src-tauri/src/registry.rs', '343aea20f5d09df6abd5c9fdba3b093efc6729c9ece8f180b27a150061753a18'],
  [
    'src-tauri/src/secure_store.rs',
    '39702dd68653b84416a7dbc9f8c1c1319f06d7cfa7cb302d75f482f3538a529f'
  ],
  [
    'src-tauri/src/native_backup/macos.rs',
    'd0a0c0ce732036495a27d7c74bdab66138ee35037aab4648b5555e13ef38aac5'
  ],
  ['src-tauri/src/proposal.rs', 'b450b07613edad8922bb54756d0152f551d714937a66065611124bcd80ecdc86'],
  ['src-tauri/src/wallet.rs', '1e2bef980746605dfc57277cf19bc7107dc0932215b26d0e4fbe9747223ee401'],
  [
    'src-tauri/src/wallet/diagnostics.rs',
    'e531480fd53ffa5db664d7a80c1bdf806351e648c0f09727cdde32fc0d24158a'
  ],
  [
    'src-tauri/src/wallet/error_translation.rs',
    '49ad32776ef5c84c83a7cbf17770f32ec7f41b213f7d7b6838aeeadab2be1119'
  ],
  [
    'src-tauri/src/wallet/explorer_commands.rs',
    '9baf9b2b5976c2199af4fec27c73c5d40e0e5233e219eeac114dfdb03aa20cd0'
  ],
  [
    'src-tauri/src/wallet/export_commands.rs',
    '652e52ada23b234c2a06a455fad15ac3d9129906be845e246a7da51416bdfffd'
  ],
  [
    'src-tauri/src/wallet/hardware_commands.rs',
    '8ff39628ab7c71fa04122fd369ff757401a2cc021f29da8252894cc77274763b'
  ],
  [
    'src-tauri/src/wallet/label_interchange.rs',
    '2860bad8c740c384594643a617a9cde2e5c3bd5499efa951d9f78f6a30576bf3'
  ],
  [
    'src-tauri/src/wallet/pin_change.rs',
    'f65c5f044051c589b34306d51b3bb7f3dd219889078e63f0b2a61c75e1d8640e'
  ],
  [
    'src-tauri/src/wallet/multisig_setup_commands.rs',
    '3ae6f97650bdf571e2535de681806a2ff4c968f36ea7e8e2df2a887805af9325'
  ],
  [
    'src-tauri/src/wallet/multisig_proposal_commands.rs',
    'e719f3902142a47cd29b8e40df7efe122b79eb8b89e93f5a2c3d3a4c25cd6dd3'
  ],
  [
    'src-tauri/src/wallet/profile_commands.rs',
    '70410262b1ff6080144ea4a4d1abad8e19c9dbb62aa3085f265ec5639a34b50f'
  ],
  [
    'src-tauri/src/wallet/payment_draft_commands.rs',
    'a4784bb865410eb90ddce8ab5f439f7e68ac7456657f1ffb588eae0245b1490e'
  ],
  [
    'src-tauri/src/wallet/proposal_review.rs',
    '97e19e3150145efbc542088f12bbbde56ec742d5cc15e9e149e1a846abf76be7'
  ],
  [
    'src-tauri/src/wallet/recovery_scan.rs',
    '44792cf2450854ccf6efc226ca258388abb4626b79cf2522e9b9043baa00aa4e'
  ],
  [
    'src-tauri/src/wallet/transaction_commands.rs',
    '81bd1d720e84f2eece2e170dd5f296c7219e76d28a7fef198ebde94f4ed86599'
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
    'befb799f37a66900cc59cbf2bbf9cfaf075ed47176341bb6cc3bb0f53e12ffff'
  ],
  [
    'scripts/release/build-unsigned-multi.sh',
    '45ea9a423449298d8bcd6fc32349ccfa6b5605a5f18d09ceabdb00d98802c8eb'
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
    'c30b786d9fae73d4942465aa313682e2334da303580c3c75be9d2e58ceabe5bf'
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
    'dd9ceea81f4380e9cacd134e1600eb9f0f895b92fb279453490527e610868c38'
  ],
  [
    'scripts/release/create-macos-dmg.mjs',
    '61809f5bba347d93b5a42c02765daef1a161d624b9055f5f01a9cd2b1803edff'
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
    '404df4d19ebc6901cdb07d23cb42cad2545826ced71086b7e7463104e53d5e03'
  ],
  [
    'scripts/release/normalize-macho-uuid.mjs',
    '6a0c4442e911dc5ed93ccafcd0006f9cbedf24ebf1565d689f3475119800494b'
  ],
  [
    'src/lib/components/AppShell.svelte',
    '350ca2a20898c7f1e94ac9c5cd6dea7980665ea376e029c5fbb1c2a9c447c9b9'
  ],
  ['src/lib/app-updates.ts', 'f274f7614fb278b403acbc61f849912fea20437c0614b999898b2f85e0500c70'],
  ['src/lib/release-notes.ts', 'c88e87b7da978739ffe70a9f3f5075d87f009e9d85ebedade6b68fb29559315d'],
  [
    'src/lib/wallet/live-sync.ts',
    '978773bb0b99dcdb15ebbd1146ea0852cacb761ae756ebf00734ac4d85e22814'
  ],
  ['src/lib/wallet/tauri.ts', '863f82ccdc14abddebee5e9ed24baf460a34b6a4befe1b4742daedcefacfd68e'],
  [
    'src/lib/wallet/contracts/errors.ts',
    'd45ed3da39173f0238cdf1da60057cd1b1e056edf3d02eb67e48a233199bc700'
  ],
  [
    'src/lib/wallet/contracts/port.ts',
    '45d0f8882a91ef078a72bf7d1db0d61cbbf07ac622e15a58c36065b3cd6cfe38'
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
    '96be627b065e7d8182a6f34de047c4a9a88942a2ab56a2a15576fb89b6d85cca'
  ],
  [
    'src/routes/welcome/+page.svelte',
    'bf62b44682a7ed7bd86a7f5a46f600e05ce4cb15c2e158999a0f9e991b611b32'
  ],
  [
    'src/routes/unlock/+page.svelte',
    'e66cccaab2e968ba0cd53b8a9922e633aed0798e404aebb4ecde162f54266ee4'
  ],
  ['src/routes/+page.svelte', '0c3ec38396821ad568bac1f8704dd072875f084a829c858241add831563e639d'],
  [
    'src/routes/activity/+page.svelte',
    '799ae3af27673e22b6903663eec3478984150b82b7fabbc3a26fd272febad754'
  ],
  [
    'src/routes/receive/+page.svelte',
    '0d808375e65788e6a8255a29c15d6d00d534f81329cfaee6251e77ddad667ecb'
  ],
  [
    'src/routes/multisig/receive/+page.svelte',
    'dc47625ae5cbee43296f674e16c4a1b25d541d1bd623242c14a540ebd0f25c64'
  ],
  [
    'src/routes/settings/+page.svelte',
    'eef71a25651c426331de5bb880e9b2e6df3871f391b4612362a0c008b9fede15'
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
    '7dde54d704fe38212a862b82e1141c62b5f507380ece52c1561e63974bfb4d44'
  ],
  [
    'src/routes/multisig/new/+page.svelte',
    '98739d18e0ca267cf6edf30799a995f6909284962413d3a02e5f1cccce78ce44'
  ],
  [
    'src/routes/multisig/recover/+page.svelte',
    '3266bf9d1a3df5f54d237532b62ad56908575f92a43729c588eb7427c35a72ab'
  ],
  [
    'src/routes/multisig/delete/+page.svelte',
    '7032d9c12081b9d97fca553bf86735d0109db175d812c808b0f1ecf4847ecf95'
  ],
  [
    'src/routes/multisig/backup/+page.svelte',
    'accc858f5d1c59251b99c42a303abeb9115039f0cc25e84ca63bdcd9501c8b2a'
  ],
  [
    'src/lib/multisig/policy.ts',
    '83f08e7a7f71c32c510bde8b3c215dcc79453ad46c48c938e319c2cc6d83cae0'
  ],
  [
    'src/lib/multisig/cosigner-import.ts',
    '95715d978345e0de6714640419702f96d15ca38013b4d2fee53cdb67857cad1e'
  ],
  [
    'src/lib/locales/onboarding.ts',
    'a2ea05fd90ac05158255b908ca0ae9b4b3a5cadd43c56a0cb68bf019da740208'
  ],
  [
    'scripts/release/build-mainnet-internal-rc.mjs',
    '0b6f951c53c9af08a1e4ec2225a7f0744cd8f2923e2902d22b07b749f1709c52'
  ],
  [
    'docs/adr/0068-restart-bound-multi-network-settings.md',
    '0165f21d27f60dfaa56bcf7567a85289a90b478c0964fd3e34344bdd5d84ed1f'
  ],
  [
    'src-tauri/src/hardware/session.rs',
    '34877a67d536becbec404a47ad3db1eee8d22de5d5e8735ab09c250f7332e535'
  ],
  [
    'src-tauri/src/hardware/runtime.rs',
    '49c54d49f64d05d285215fd4b6443ff7bbc920cd641d3c40f98c040a62bfff8b'
  ],
  [
    'scripts/hardware/session-launcher.c',
    'b03496e21a0ea4a3ea9ff4aee163832e2dae45d586c65862c299e7702784acea'
  ],
  [
    'scripts/hardware/session-bootstrap.py',
    '19d5f4974c6e78253d3f0d1f5b866992d501ef7e170118047f785631dcaeecb9'
  ],
  [
    'scripts/hardware/session-worker.py',
    'ecd52074e8e6005b11d7162ea47a20b7e0f43e2956984c60102f9056278eb6ce'
  ],
  [
    'scripts/release/prepare-hwi-runtime.mjs',
    '69a70e38f490c9476172fc277cefc07e3fec18c70dafe0627a8b691db7e1eff0'
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
