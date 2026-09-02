# Independent security review plan

Status: planned; reviewer not yet engaged; no mainnet approval

## Objective

Obtain an independent assessment of the frozen Groot candidate and the later,
minimal mainnet-enablement change. The review must determine whether the exact
final candidate is suitable for a limited macOS mainnet trial under the release
constraints below. It does not replace physical testing, reproducible-build
evidence, release-owner approval, or any other open item in
[`mainnet-release-checklist.md`](mainnet-release-checklist.md).

No live mainnet wallet or funds are used during the review. Dynamic work uses
Regtest, Signet, Testnet4, disposable hardware-wallet accounts, and synthetic
fixtures until the final release checklist is independently closed.

## Exact review inputs

The review packet must identify every input by full digest. At the time this
plan was written, the inputs are:

- frozen v0.4.91 application source: commit
  `0849375d1c458cbcaf9bd003a23293510f02e6bf`;
- sanitized evidence-ledger state: commit
  `bb94e468d0c83d42ea600dd5ed5ea1b411f00a31`;
- the Developer ID signed and Apple-notarized v0.4.91 macOS arm64 Testnet4
  package and its 539-component SBOM, both bound to source commit `0849375d`;
- unsigned independent-machine Build A: executable SHA-256
  `d4736d53c9f9dde8535242b03e021f1609d8a623ceeef0f9e682160c539b9bf6`
  and SBOM SHA-256
  `f137a0a7527499749f9cdc433adccd036938298c0661ae1e9280f1a7f69fa2ca`;
- Build B and the strict complete-evidence comparison, which remain pending;
- this threat model, security model, accepted ADRs, dependency locks, release
  checklist, sanitized hardware summaries, backend evidence, recovery evidence,
  and release/update procedures.

The v0.4.91 source review is necessary but cannot approve a future mainnet
binary. The final mainnet-enablement commit, its complete diff from `0849375d`,
both matching independent unsigned builds, and its signed/notarized artifact
must be reviewed before closure.

## Limited-mainnet design under review

The proposed first release is deliberately narrower than the complete product:

- macOS desktop on Apple silicon only;
- an explicit, separately built mainnet application identity with isolated
  storage and no runtime network selector;
- a user-controlled Bitcoin Core node on a validated loopback endpoint only;
- exact Bitcoin mainnet genesis verification before any wallet database opens;
- software BIP84 single-key wallets, hardware BIP84 single-key wallets, and
  standard BIP48 hardware multisig under
  [ADR 0052](adr/0052-first-mainnet-software-and-hardware-scope.md), with
  hardware support limited to exact models and firmware named in the approved
  release matrix;
- exactly one external recipient per transaction;
- a hard trusted-boundary maximum of 1,000,000 satoshis per transaction, which
  is a loss limiter rather than a recommended test amount;
- no public Esplora, remote Core, Tor/onion Core, compact-filter sync, mobile,
  Windows, Payjoin, or batch-spend claim in the first release;
- no automatic backend, fee, explorer, or transport fallback;
- signed update metadata, rollback instructions, incident response, and an
  immediate release-disable path.

The release owner explicitly selected both software and hardware wallet support.
Guided delayed/recovery Miniscript policies remain outside this first scope
unless a later ADR adds them. The mainnet-enablement ADR, UI, Rust gate, tests,
release notes, and reviewer scope must all preserve this exact boundary.

## Reviewer independence

The lead reviewer must:

- be independent of the implementation and release approval decisions;
- have practical Bitcoin wallet, PSBT/descriptor, Rust, desktop application,
  and release-supply-chain experience, or name additional specialists covering
  any missing area;
- disclose earlier work on Groot, financial relationships, and any scope or
  tooling limitation;
- receive payment on terms that do not depend on finding no vulnerabilities;
- control their own review environment and reproduce material results from a
  clean checkout;
- deliver findings directly to the private disclosure channel described in
  [`../SECURITY.md`](../SECURITY.md).

Prior bounded review work may be supplied as context, but its authors cannot
self-attest the final candidate. Automated or AI-assisted analysis is supporting
evidence, not the independent conclusion.

## Work packages

### 1. Architecture and threat-model consistency

Trace assets, trust boundaries, attacker capabilities, residual risks, and
recovery controls from [`mainnet-threat-model.md`](mainnet-threat-model.md) into
the implementation. Identify undocumented flows, stale assumptions, and any
control that lacks a named failure test.

### 2. Secrets and authentication

Review entropy acquisition, native mnemonic presentation/recovery, BIP39
passphrase semantics, Argon2id parameters and offline-guessing exposure,
AES-GCM envelope handling, v2-to-v3 migration, zeroization, credential
throttling, session expiry, clipboard/accessibility/crash surfaces, and profile
relocation/deletion. Exercise the complete included software-wallet mainnet
lifecycle and confirm no mnemonic, seed, private descriptor, signing material,
or credential crosses into the webview or logs.

### 3. Wallet and transaction correctness

Review BIP84/BIP48 origins, extended-key networks, descriptor canonicalization,
address ownership, integer-satoshi accounting, coin selection, labels, PSBT
construction and review binding, signature validation/merge, finalization,
broadcast identity, RBF/CPFP, reorg handling, recovery scans, proposal restart,
and wrong-network or changed-transaction rejection.

### 4. Mainnet and Bitcoin Core boundary

Verify that mainnet cannot be selected accidentally and that the enabling diff
requires the exact mainnet genesis, a validated loopback-only Core endpoint,
one recipient, a positive amount, and the cap. Exercise wrong chain, initial
block download, stale tip, pruning/history loss, authentication failure, fee
unavailability, timeout, malformed response, restart, and no-fallback behavior.

### 5. Hardware signer boundary

Review bundled HWI provenance, helper entitlements, process isolation, bounded
I/O, secret-free arguments and errors, device identity, xpub/origin matching,
trusted address display, policy registration, wrong-device rejection,
interruption, hostile or foreign PSBTs, and signer-specific limitations. Confirm
the product claims exactly match the approved model/firmware matrix.

### 6. Persistence and local platform security

Review registry/profile isolation, symlink and non-regular-file rejection,
owner-only permissions, atomic/fsynced writes, SQLite defensive configuration,
concurrent-process exclusion, crash recovery, corruption behavior, migration,
and rollback residuals. Inspect the signed package's macOS lifecycle and crash
artifacts for sensitive data.

### 7. Renderer and native IPC

Review every Tauri command and capability, serialization and size bounds,
credential teardown, file/QR/clipboard/camera surfaces, CSP, external URL
opening, accessibility output, error translation, and protection against a
renderer supplying inconsistent public state.

### 8. Build, dependencies, signing, and updates

Reproduce locked clean-checkout validation, review dependency/advisory/license
evidence, compare Build A and Build B, inspect the SBOM and HWI inputs, verify
Developer ID signing/notarization/entitlements, and exercise signed update plus
rollback rejection. Confirm the reviewed source, unsigned executable, signed
package, SBOM, and release metadata are cryptographically bound.

### 9. Mainnet-enablement diff

Review the entire diff from `0849375d` to the proposed enabling commit. Require
an approved ADR superseding ADR 0012, test every new reachable branch, and reject
unrelated features or dependency updates. Any remediation produces a new exact
candidate and invalidates prior final-candidate hashes until rebuilt and
rechecked.

## Required methods and evidence

The reviewer chooses tools, but the review must include:

- manual source and architecture review rather than scanner output alone;
- clean-checkout execution of the repository's validation, strict Rust checks,
  adversarial tests, and real-Core Regtest integration suite;
- focused negative tests for every limited-mainnet invariant;
- inspection of dependency locks, generated SBOM, HWI artifact, macOS code
  signatures, entitlements, notarization ticket, and update signatures;
- strict comparison of complete independent Build A and Build B evidence;
- dynamic testing of hostile IPC, files, descriptors, PSBTs, backend responses,
  hardware responses, persistence failures, and process interruption;
- explicit review of all ignored, skipped, flaky, environment-dependent, or
  unperformed tests;
- a coverage and limitation statement that distinguishes source analysis,
  physical testing, package testing, and penetration testing.

## Review packet

Prepare one immutable, encrypted transfer containing:

1. the clean source archive and full commit identifier;
2. a manifest of every included file and SHA-256 digest;
3. security and architecture documents plus all ADRs;
4. dependency locks, SBOM/license/advisory evidence, and CI output;
5. Build A, Build B, and strict comparison output;
6. signed/notarized package verification and update/rollback evidence;
7. sanitized Testnet4, recovery, lifecycle, and hardware summaries;
8. an explicit list of open checklist rows and unsupported features;
9. private reporting contact, severity policy, and expected closure format.

Never include seeds, words, PINs, credentials, xpubs, descriptors tied to real
wallets, addresses, transaction identifiers, complete fingerprints, device
paths, PSBTs, wallet databases, node endpoints, RPC configuration, Apple
credentials, or unredacted logs. Use disposable fixtures and sanitize evidence
before transfer.

## Deliverables

The reviewer must provide:

- an executive conclusion naming the exact commit and artifact digests;
- scope, methods, dates, reviewer identities/roles, independence declaration,
  environment, and limitations;
- one record per finding with severity, affected invariant, attacker
  prerequisites, impact, affected code, minimal disposable-test reproduction,
  and recommended remediation;
- a residual-risk and unsupported-configuration register;
- a release-checklist mapping showing reviewed, unreviewed, passed, failed, and
  not-applicable rows without inferring evidence;
- a closure addendum that names every remediation commit and regression test;
- a final statement clearly distinguishing source review, dynamic assessment,
  physical-device evidence, build/release review, and work not performed.

The repository stores only a sanitized summary and closure record. Sensitive
working notes remain in the agreed private channel.

## Finding and remediation policy

- Critical and high findings block release and must be fixed and independently
  rechecked.
- Medium findings must be fixed or explicitly accepted with rationale in an ADR
  approved by the release owner and reviewer.
- Low and informational findings require a tracked disposition before release.
- A fix must include a regression test at the enforcing boundary. UI-only
  validation is insufficient for a trusted Rust invariant.
- Any fix that changes runtime code, dependencies, build inputs, entitlements,
  or release configuration creates a new candidate. Re-run affected physical
  evidence, both independent builds, package signing/notarization, and final
  review as required by the change.

## Execution sequence

1. Freeze and hash the review packet; do not enable mainnet.
2. Confirm reviewer independence, competence, scope, schedule, and private
   reporting channel.
3. Complete Build B and the strict Build A/Build B comparison.
4. Review the frozen v0.4.91 source, threat model, package, and evidence.
5. Resolve baseline findings while mainnet remains unreachable.
6. Approve a proposed limited-mainnet ADR and implement only that reviewed
   boundary on a dedicated branch.
7. Run the complete clean-checkout, integration, physical, reproducibility,
   signing/notarization, and update evidence on the resulting exact candidate.
8. Review the full enabling diff and final artifacts; remediate and repeat when
   necessary.
9. Publish the sanitized review summary and closure record.
10. The release owner independently reconciles every checklist row. Only then
    may ADR 0012 be superseded and a deliberately tiny mainnet trial be
    considered.

## Exit rule

The independent-review checkbox remains open until the reviewer confirms the
exact final commit and artifacts, all critical/high findings are closed, every
medium is closed or formally accepted, every other finding has a disposition,
and the closure addendum is complete. The maintainer reviews but cannot replace
the independent conclusion.

Passing this review alone does not enable mainnet. Every other blocking item in
[`mainnet-release-checklist.md`](mainnet-release-checklist.md) must have linked
evidence, and an approved ADR must supersede ADR 0012 before the trusted mainnet
gate changes.
