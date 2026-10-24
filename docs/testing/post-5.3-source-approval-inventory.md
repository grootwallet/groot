# Post-5.3 source-approval inventory

This is the pre-approval inventory for the final maintenance candidate. It does not update any approved hash or authorize release. Released baseline: `6a39bf50b2a6a042354b43369765a9af2174d061`. Assessed application/test source: `6a95822aae4d7f11960ccb7bfef3af5806b8d9e8`. Reporting tip before this record: `522ad3048b8505ce8f78b0e865c5370756a08a1c`.

## Nine currently divergent pinned sources

The verifier is fail-fast and reports `package.json` first. That message is the first of nine mismatches, not the complete approval scope.

| Pinned source                              | Reason for the reviewed change                                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                             | Adds the real build-source watcher regression to the release-gate test command; runtime dependencies are unchanged.                    |
| `src-tauri/build.rs`                       | Runs tracked-file enumeration from the repository root so release-source watch paths are correct.                                      |
| `src-tauri/src/lib.rs`                     | Registers recovery commands at their extracted owner; public command names and arguments are unchanged.                                |
| `src-tauri/src/registry.rs`                | Makes directory synchronization injectable for deterministic post-rename durability/recovery tests while retaining production fsync.   |
| `src-tauri/src/proposal.rs`                | Declares the extracted full-prevout authentication owner.                                                                              |
| `src-tauri/src/wallet.rs`                  | Removes responsibilities moved to focused profile/notification/recovery owners and retains the command boundary.                       |
| `src-tauri/src/wallet/profile_commands.rs` | Removes extracted recovery/profile responsibilities and preserves command-side authorization and transaction ordering.                 |
| `src/routes/settings/+page.svelte`         | Adds current-wallet/action lifetime guards, retryable loading and focused helpers; rejected wallet switches retain confirmed identity. |
| `src/routes/multisig/new/+page.svelte`     | Updates the user-visible compatibility statement; it does not enable signer support.                                                   |

## Changed/new sources outside the current pin map

The final approval review must cover every changed path, not only current pins. The following recommendations apply to production or release-governance sources introduced or changed by this work.

### Recommend adding to the approval map

- Native transaction/transport owners: `src-tauri/src/proposal/prevouts.rs`, `src-tauri/src/ur_transport.rs`, `src-tauri/src/ur_transport/fountain.rs`, `src-tauri/src/coordination_transport.rs`.
- Native profile/pairing owners: `src-tauri/src/wallet/profiles.rs`, `src-tauri/src/wallet/recovery_commands.rs`, `src-tauri/src/wallet/notification_delivery.rs`, `src-tauri/src/wallet/coordination_commands.rs`, `src-tauri/src/wallet/coordination_commands/pairing_storage.rs`.
- Native query behavior: `src-tauri/src/label_provenance.rs`.
- Functional route boundaries: `src/routes/mobile/sign/+page.svelte`, `src/routes/send/+page.svelte`, `src/routes/multisig/send/+page.svelte`.
- Imported frontend owners used by pinned routes: `src/lib/wallet/acceleration-quotes.ts`, `src/lib/wallet/node-form.ts`, `src/lib/wallet/settings-data.ts`.

These files directly influence transaction review, signing inputs, persistence, recovery, current-wallet presentation or release-critical route behavior. Pinning only their importers would leave the extracted implementation outside the reviewed-byte boundary.

### Review but keep outside the production approval map

- Tests and browser fixtures under `e2e/`, `src-tauri/tests/`, Rust `tests.rs` modules and `*.test.ts`. They remain required evidence but are not shipped runtime owners.
- The isolated `fuzz/` workspace, `.github/workflows/fuzz.yml`, `scripts/quality/fuzz-parsers.sh`, the fuzz Cargo wrapper test and the synthetic corpus generator. They are separately locked/supply-chain reviewed and do not ship in the wallet. Their exact versions and results remain part of the review evidence.
- Measurement-only scripts/configuration and `src-tauri/src/wallet/performance_tests.rs`. They must not alter production behavior or packaging.
- Documentation, locale copy and the unsigned development-only iOS preparation helper. Review their claims and boundary tests separately; do not treat them as transaction authority.

The approval reviewer must confirm this classification against the final changed-path list. Any new runtime import or release-policy source added after this record requires a new decision. Previously pinned sources that remain byte-identical should be recorded as unchanged rather than silently omitted.

## Durable recovery evidence

Reverified on 2026-10-24 at the private owner-only backup location:

- Bundle SHA-256: `81c2b8d3db2abef9e8f6f9909bc5a69c4721fac9ead97e5efdf8bccfdce24106`.
- Cleanup record SHA-256: `745e72b7ff97d1c36447015c6a083b87c85813a478aa928d3e495392c33862cc`.
- `shasum -a 256 -c SHA256SUMS`: both entries passed.
- `git bundle verify`: passed; 51 refs and complete history recorded.

Retain this recovery material until the owner explicitly approves deletion. It preserves committed Git history, not uncommitted worktree files.
