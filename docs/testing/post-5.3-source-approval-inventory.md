# Post-5.3 source-approval inventory

This document is a historical record and a pre-GA review handoff. It does not
approve source, update a public hash, authorize a package, or replace the
external exact-commit acceptance required by ADR 0109. The released baseline is
`6a39bf50b2a6a042354b43369765a9af2174d061` (`v5.3.0`).

## Historical campaign

The October campaign froze application and reporting source at
`ec940d22b06c5efe71c848801e8cefac1f4341d7`. At that commit, nine of the 115
publicly approved source pins differed and the release-to-candidate diff had 91
paths. Its execution totals and independent reviews remain evidence for that
exact source only.

The nine historical mismatches were `package.json`, `src-tauri/build.rs`,
`src-tauri/src/lib.rs`, `src-tauri/src/registry.rs`,
`src-tauri/src/proposal.rs`, `src-tauri/src/wallet.rs`,
`src-tauri/src/wallet/profile_commands.rs`,
`src/routes/settings/+page.svelte` and
`src/routes/multisig/new/+page.svelte`.

ADR 0109 later superseded treating this selective pin map as complete internal
candidate authorization. The map remains useful regression evidence; external
acceptance binds the complete candidate commit, including build hooks,
workflows, package configuration and generators.

## Pre-GA snapshot — 2026-11-11

Snapshot commit:
`3bdba2fb14c8724101edea8672047ed2db249da8`.

- Public map: 115 entries: 114 text files and one binary file.
- Candidate divergence: 40 text files; the binary pin is unchanged.
- Publicly approved bytes retained: 75 of 115 entries.
- Release-to-candidate scope: 272 changed paths across 111 commits.
- The public verifier remains fail-fast. At this snapshot its first mismatch is
  `src-tauri/src/wallet/activity.rs`.
- The internal snapshot contains the same 40 candidate digests and passes its
  focused semantic checks. Those digests are regression evidence, not public
  approval.

The 40 divergent pinned paths are grouped below for review. Reviewers must use
the generator in the next section as the authoritative check rather than copy
this list into an approval commit.

### Native wallet and platform boundary

- `src-tauri/Cargo.toml`
- `src-tauri/build.rs`
- `src-tauri/tauri.conf.json`
- `src-tauri/src/build_network.rs`
- `src-tauri/src/hardware.rs`
- `src-tauri/src/hardware/runtime.rs`
- `src-tauri/src/hardware/session.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/process_lock.rs`
- `src-tauri/src/proposal.rs`
- `src-tauri/src/registry.rs`
- `src-tauri/src/secure_store.rs`
- `src-tauri/src/updates.rs`
- `src-tauri/src/wallet.rs`
- `src-tauri/src/wallet/activity.rs`
- `src-tauri/src/wallet/export_commands.rs`
- `src-tauri/src/wallet/hardware_commands.rs`
- `src-tauri/src/wallet/multisig_proposal_commands.rs`
- `src-tauri/src/wallet/multisig_setup_commands.rs`
- `src-tauri/src/wallet/profile_commands.rs`
- `src-tauri/src/wallet/transaction_commands.rs`

### Packaging and hardware runtime

- `package.json`
- `scripts/hardware/session-bootstrap.py`
- `scripts/hardware/session-worker.py`
- `scripts/release/build-mainnet-internal-rc.mjs`
- `scripts/release/check-mainnet-gate.sh`
- `scripts/release/create-macos-dmg.mjs`
- `scripts/release/package-macos-ga.mjs`
- `scripts/release/prepare-hwi-runtime.mjs`
- `scripts/release/release-version.mjs`
- `scripts/release/verify-packaged-hwi.mjs`
- `src/lib/config.ts`

### Frontend runtime and user-visible policy

- `src/lib/components/AppShell.svelte`
- `src/lib/release-notes.ts`
- `src/lib/wallet/live-sync.ts`
- `src/routes/+page.svelte`
- `src/routes/multisig/backup/+page.svelte`
- `src/routes/multisig/new/+page.svelte`
- `src/routes/multisig/recover/+page.svelte`
- `src/routes/settings/+page.svelte`

## Reproduce for any exact commit

Run this from the repository root with a full candidate commit. It reads the
approved map from the released baseline and candidate bytes directly from Git,
so a dirty checkout cannot affect the result. It also rejects an unexpected
change to the public map before printing the complete mismatch inventory.

```sh
BASELINE=6a39bf50b2a6a042354b43369765a9af2174d061 \
CANDIDATE=3bdba2fb14c8724101edea8672047ed2db249da8 \
node --input-type=module <<'NODE'
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const baseline = process.env.BASELINE;
const candidate = process.env.CANDIDATE;
const fullCommit = /^[0-9a-f]{40}$/;
if (!fullCommit.test(baseline ?? '') || !fullCommit.test(candidate ?? '')) {
  throw new Error('BASELINE and CANDIDATE must be full lowercase commits');
}

const text = (args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const bytes = (args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
text(['cat-file', '-e', `${baseline}^{commit}`]);
text(['cat-file', '-e', `${candidate}^{commit}`]);

const verifierPath = 'scripts/release/verify-mainnet-source-policy.mjs';
const sourceAt = (commit) => text(['show', `${commit}:${verifierPath}`]);
const mapEntries = (source, name, kind) => {
  const start = source.indexOf(`const ${name} = new Map([`);
  const end = source.indexOf('\n]);', start);
  if (start < 0 || end < 0) throw new Error(`Cannot find ${name}`);
  return [
    ...source
      .slice(start, end + 4)
      .matchAll(/\[\s*'([^']+)'\s*,\s*'([0-9a-f]{64})'\s*\]/g)
  ].map((match) => ({ path: match[1], approved: match[2], kind }));
};
const mapsAt = (commit) => {
  const source = sourceAt(commit);
  return [
    ...mapEntries(source, 'pinnedPolicySources', 'text'),
    ...mapEntries(source, 'pinnedBinaryPolicySources', 'binary')
  ];
};

const approved = mapsAt(baseline);
const candidateMap = mapsAt(candidate);
if (JSON.stringify(candidateMap) !== JSON.stringify(approved)) {
  throw new Error('The candidate changed the frozen public pin map');
}
const mismatches = approved.flatMap((entry) => {
  const actual = createHash('sha256')
    .update(bytes(['show', `${candidate}:${entry.path}`]))
    .digest('hex');
  return actual === entry.approved ? [] : [{ ...entry, candidate: actual }];
});
const changedOutput = text(['diff', '--name-only', baseline, candidate]).trim();
const changedPaths = changedOutput ? changedOutput.split('\n').length : 0;
const commits = Number(text(['rev-list', '--count', `${baseline}..${candidate}`]).trim());

console.log(
  JSON.stringify(
    {
      baseline,
      candidate,
      pins: approved.length,
      unchangedPins: approved.length - mismatches.length,
      divergentPins: mismatches.length,
      changedPaths,
      commits,
      mismatches
    },
    null,
    2
  )
);
NODE
```

For the named snapshot the output must report 115 pins, 75 unchanged pins, 40
divergent pins, 272 changed paths and 111 commits. Preserve the generated JSON
with the review evidence; do not paste its candidate hashes into the public map
before independent review and explicit approval.

## Post-snapshot finalization delta

The commit containing this handoff also includes the following bounded changes
relative to the named `3bdba2fb` snapshot:

- `src-tauri/src/hardware.rs` increases one test fixture timeout while retaining
  the same expected failure; the production implementation is unchanged.
- `.github/workflows/ci.yml` generates SvelteKit TypeScript configuration before
  browser tests and installs Linux `libudev` for native CI.
- `scripts/quality/ci-workflows.test.mjs` asserts the new browser-step ordering.
- `scripts/release/verify-internal-source-policy.mjs` records the matching
  candidate-only digest for the changed `hardware.rs`. It does not change a
  public source hash or grant approval.

The `3bdba2fb` figures remain a dated, reproducible snapshot. Freeze the full
commit containing this handoff and rerun the generator with that commit before
review or packaging. The `hardware.rs` candidate digest changes even though its
edit is inside `cfg(test)`, and ADR 0109 requires renewed exact-commit acceptance
for every tracked change.

## Independent review packages

One coordinated independent review may carry forward earlier findings for
byte-identical code, but it must reconcile the complete released-baseline diff
with the final candidate. Reviewing only the 40 pin mismatches is insufficient.

1. **Wallet and security authority.** Review authorization, credentials,
   transaction/PSBT and prevout authority, persistence and SQLite, pairing/UR,
   HWI execution, updates, wallet locking and frontend request lifetimes.
2. **Build and release integrity.** Review workflows, package-manager and Tauri
   configuration, build hooks, release builders, version transition, signing,
   source gates and attestation. Protected Environment approval is exact-commit
   acceptance; it is not source or security review.
3. **Supply chain.** Review both lockfiles and the complete vendored
   `src-tauri/vendor/bdk-chain/` tree. Verify its upstream 0.23.3 provenance and
   that the intended dependency delta is limited to the ADR 0110 bundled-SQLite
   remediation. Vendored source is executable source, not generated evidence.
4. **Presentation and interoperability claims.** Review transaction/current-
   wallet UI, signer compatibility copy, phone Standard-multisig limits and the
   Regtest/Testnet4-only delayed-policy claims against product policy.
5. **Evidence-only paths.** Tests, fuzzing, measurement scripts, locale files
   and documentation still require accuracy and boundary review, but they do
   not gain transaction authority or hardware certification from a green run.

After the review, update public pins only in a separate approval-only commit,
independently verify that mechanical mapping, and rerun the complete aggregate
from a clean checkout. Version/tag authorization, production signing, physical
acceptance and publication remain separate gates.

## Durable recovery evidence

Reverified on 2026-10-24 at the private owner-only backup location:

- Bundle SHA-256: `81c2b8d3db2abef9e8f6f9909bc5a69c4721fac9ead97e5efdf8bccfdce24106`.
- Cleanup record SHA-256: `745e72b7ff97d1c36447015c6a083b87c85813a478aa928d3e495392c33862cc`.
- `shasum -a 256 -c SHA256SUMS`: both entries passed.
- `git bundle verify`: passed; 51 refs and complete history recorded.

Retain this recovery material until the owner explicitly approves deletion. It
preserves committed Git history, not uncommitted worktree files.
