#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  isSourceApprovalRequired,
  validateMainnetSourceSemantics,
  validatePinnedPolicySources,
  validatePinnedPolicySourceSnapshot
} from './verify-mainnet-source-policy.mjs';

// Exact reviewed 0.5.4 internal-candidate bytes that intentionally differ from
// the frozen public-release snapshot. Public/Mainnet pins remain unchanged.
// Mobile review: docs/testing/0.5.4-mobile-source-review-2026-11-17.md
const internalTextOverrides = new Map([
  [
    'src/routes/receive/+page.svelte',
    'a3078315d471efd1b7362dcf9016b833cefcf75dac2d5ce34594463d7db9e2a8'
  ],
  [
    'src/routes/multisig/receive/+page.svelte',
    '383daa84ea10c0d3043ebf5409eefcf8eca07286bdabb3bfa09df183b1145c94'
  ],
  [
    'src/routes/welcome/+page.svelte',
    '90c67fe622c75069646710693c14129af2a3489dbf90d6790b55e86cc087214c'
  ],
  [
    'src/routes/unlock/+page.svelte',
    '17acadba38396a2a01b8551ef9e07a8f6529c7126ab7d7fd804e04a4aea6dcb8'
  ],
  [
    'src-tauri/src/wallet/activity.rs',
    '86a9b616c973fe9542d81ba8de8ca34c0c6e2dc5c20f7249a1bb574bf2b88d13'
  ],
  ['package.json', '4c46cc7021c78a0995a8e4859653a045ecdc862cf62c8c28261ccbdbc0827b06'],
  ['src-tauri/Cargo.toml', '32416156d450506b10dbc29382d4723d226ec001ce38f62cc47c41994a449a2a'],
  ['src-tauri/tauri.conf.json', 'dcfc61fef779c1a0df714a95c843b9dc42276381bbe066ef9a1c72266c38c56f'],
  ['src-tauri/src/lib.rs', '685e0df112f35055faf33fa13093ff0ef29449606016642223a3aa992d91f72d'],
  ['src-tauri/src/updates.rs', '8aae1d632077bd2bc92a0ee36be238e4a1dad563c36864ef670fca4d7034f0b8'],
  ['src/lib/config.ts', '1ebffa3adca16010cf2868ca1fbd2d3e5385b9e67927293e6683326d049f5f69'],
  ['src-tauri/build.rs', 'a3fa09ed87523dffb865ec380e86c09be73a8c482d16273ced9facc5dd6e7985'],
  [
    'src-tauri/src/build_network.rs',
    '76c5b511fe4b07a39489c1a59cb2951f84def0987563ed3604430c5aa42739c4'
  ],
  [
    'src-tauri/src/process_lock.rs',
    'ad8e61d95bcabf072a66a44fe5efec66864d423419610fdd94ad5978e6c74676'
  ],
  ['src-tauri/src/hardware.rs', '6e2e76679ff522ec5237cdb1c12fa64a4529856bf8fd66a9bf2a88468bf86e65'],
  [
    'scripts/release/assert-public-release-authorized.mjs',
    '02c24afe01df8c03e3475f750cc4db96719b46237ec06c7b5469d7c71121cc9e'
  ],
  ['src-tauri/src/registry.rs', 'c94f4c70ea2f72fa74ef8350bb4f7751b24569d41eb6db7edee02af1dda84aa6'],
  [
    'src-tauri/src/secure_store.rs',
    '2b6be467444dc413cb72f593fd2d87ffe3f649bc475ab934d56a32e05e0df915'
  ],
  ['src-tauri/src/proposal.rs', '20a1b4b60af932819948b48c5405c38289b2c2693f73fd4fb94f1b1da601e0a0'],
  ['src-tauri/src/wallet.rs', '9bc581b2b93785fe26d75dcd2ea93fdb8047e6469ccf534b70cd123365d90993'],
  [
    'src-tauri/src/wallet/export_commands.rs',
    '81221e759733bf6f905f8386c420b0b587a9c815fbda2dec87a5a9402f3a5998'
  ],
  [
    'src-tauri/src/wallet/multisig_setup_commands.rs',
    '65a62066114cec993bb31768ac99a3e411636b5b1113f3e78578fbb233730a06'
  ],
  [
    'src-tauri/src/wallet/hardware_commands.rs',
    '1394eadb81e9ac8781bf62ace9ec06a8fc14252b703f9b12f09feb648c6e46df'
  ],
  [
    'src-tauri/src/wallet/multisig_proposal_commands.rs',
    'c4d4c79e11213e7720f22726f7e5652e71ecdf8ce001644a853ed9c8151b011a'
  ],
  [
    'src-tauri/src/wallet/transaction_commands.rs',
    '0326ed737ca825b5c7d8a80636386d7a359533166049e777ea33e46f4adcae70'
  ],
  [
    'src-tauri/src/wallet/profile_commands.rs',
    '26d5b6fbc0ed13b2eeb2630a60688ff5953ad77a4cbd510741e63abaf0dd0a08'
  ],
  [
    'scripts/release/package-macos-ga.mjs',
    '3d6e3f05bb6e7f8aaaf405283ff4a189de5385be9abf36542892b820269c801f'
  ],
  [
    'scripts/release/check-mainnet-gate.sh',
    'ce6bfb1eb6d8ae5fae5109a835d92454fcffc6144f7e83220c86fa5c2ba5a4cd'
  ],
  [
    'scripts/release/release-version.mjs',
    '1919bbfde8b9700508c1c2986b72b077791842d8481953e5f254ab870baab317'
  ],
  [
    'scripts/release/create-macos-dmg.mjs',
    'd123326538470c2f82845d866b0d761faf026825b769b1e0d57aa96a30d335a3'
  ],
  [
    'scripts/release/verify-packaged-hwi.mjs',
    '676ca759ce10e614c4545d05c740863bece6833c3f9839cec337360952114a92'
  ],
  ['src/lib/release-notes.ts', '619a9397c1012603575d56e1055546c17415695488149c4456e4f08ef36a8260'],
  [
    'src/lib/components/AppShell.svelte',
    '59a9b8a3ae2026d9ae9b572d3c6ff7a0d6fed1e135e7ed17a3ffa59c5d177ff6'
  ],
  [
    'src/lib/wallet/live-sync.ts',
    '6dfb771e83c4a6db7dedfef3667ebe026f99ca41a4db1f0b650c14a9d003be15'
  ],
  ['src/routes/+page.svelte', 'bd8e982f0aa11aa2d0666f98ca4465b4cfc8bf76ebf1e28d40e19bd3e52786bc'],
  [
    'src/routes/settings/+page.svelte',
    '188eb46a8980ca831b629bb7a4149de8a4d90eaca140f27e75e3172105ea79d5'
  ],
  [
    'src/routes/multisig/new/+page.svelte',
    '843dbddaa8932af266e3ee97180ddb2b8a7aeb63937ef6a6ce2b3b70f177d02d'
  ],
  [
    'src/routes/multisig/recover/+page.svelte',
    '4b57c2b6bf4fc7efd2b486a6eb07354abf708e5f9d38a170a5e702a6e992ee8d'
  ],
  [
    'src/routes/multisig/backup/+page.svelte',
    '7004aa1efc147e4f855a304fb64c4aae1f830338e19dd67c907fb65b56daf0b5'
  ],
  [
    'scripts/release/build-mainnet-internal-rc.mjs',
    '4129e7e8324706b8722efec714dedc8fbb2615a07c37a54dc3217c7674d5da48'
  ],
  [
    'src-tauri/src/hardware/session.rs',
    'b7976ca6531a1aed04af1860c6165bb9019cf919ad512dbb34de3c46490dbd26'
  ],
  [
    'src-tauri/src/hardware/runtime.rs',
    '46ab6d08d0ecbf3b1c9f00f66f300e54ddaf463fc9eb40f02d3ac2ee05791fa8'
  ],
  [
    'scripts/hardware/session-bootstrap.py',
    '5970011a35a225c9282616fe24f8dba2d6eda1167ae6d3051f43626e5c230865'
  ],
  [
    'scripts/hardware/session-worker.py',
    '1fb216da411a977d7d9d35139f6052f586c951261b390b8b328413ef18e9bebd'
  ],
  [
    'scripts/release/prepare-hwi-runtime.mjs',
    '2beeecd21784c7450a9e2addc43608e1b569ce56f37d43e0819012f31309a0c9'
  ]
]);

export function verifyInternalSourcePolicy(read, readBytes) {
  validatePinnedPolicySourceSnapshot(read, readBytes, internalTextOverrides);
  let pending = false;
  try {
    validatePinnedPolicySources(read, readBytes);
  } catch (error) {
    if (!isSourceApprovalRequired(error)) throw error;
    pending = true;
  }
  if (!pending)
    throw new Error('Internal candidate must retain the expected frozen source-approval stop');
  validateMainnetSourceSemantics(read);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    verifyInternalSourcePolicy(
      (path) => readFileSync(resolve(root, path), 'utf8'),
      (path) => readFileSync(resolve(root, path))
    );
    console.log(
      'Focused internal policy snapshot and semantics passed; exact-commit acceptance is external and frozen public source approval remains pending.'
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
