# ADR 0084: First-history consent, restore UX, and deletion backup gates

- Status: accepted for implementation; replacement-release and physical evidence pending
- Date: 2026-10-10
- Tracking: #116; advanced file reveal remains #115
- Supersedes: ADR 0072 automatic first scan; ADR 0064 creation-tip default only for a first scan approved through the new default flow; ADR 0021 only for deletion of funded unverified software wallets; ADR 0080 current attribution presentation

## Decision

A never-synced wallet asks for explicit approval before sending wallet scripts to its configured node. The normal approval scans from genesis, using Groot managed when that is the existing default Mainnet setup. Existing user-controlled node settings remain intact. Declining opens Settings to choose a privacy-appropriate node and scan configuration. Settings retains explicit birthday and gap controls. Native empty-credential first rescan requires wallet-scoped process-local approval from the explicit scan-settings operation; the approval save and scan both bind the expected wallet ID and reject a concurrent selection change; the scheduler cannot manufacture consent. A restart before completion requires approval again. Routine sync after a completed scan is unchanged. Gateway enrollment and node health checks may precede consent, but wallet-script/history queries may not.

Backup recovery is distinct from timelocked policy creation. Standard multisig backup inspection presents its actual threshold and signer keys. Mainnet recovery offers selected-device account-key identification through the existing HWI/PIN controls, preserving exact native admission requirements. It does not ask users to invent a new threshold or type all public keys manually. Untested timelocked Recovery creation stays visible but disabled; saved unfinished delayed-policy drafts remain intact and cannot finish creation.

BIP329 address ownership is established from native descriptor derivation, not merely from presentation rows absent in a restored wallet. Import restores missing label records and the reveal cursor in the same SQLite transaction as label history. Unused restored records remain retired from presentation to prevent reuse; scanned used records retain payment status. A bounded search covers the first 10,000 receive addresses, supplemented by native indexed ownership for already scanned higher indexes. Foreign addresses, network mismatches, oversized inputs, and unowned transactions/outputs still fail atomically. Matching xpub display-name records are ignored, including differently named recovered signers: import neither renames signers nor blocks compatible address history. Unrelated xpubs remain rejected.

Every deletion requires a key-backup acknowledgement, the current credential, and exact DELETE confirmation. Software wallets also require a separately backed-up passphrase acknowledgement. Rust rejects deletion of a software wallet with a nonzero native wallet balance until its existing backupVerified marker is true. Empty unverified software wallets may be deleted. Multisig retains the existing successful descriptor recovery drill. Authentication and filesystem work run on blocking workers, with operation/session guards intact. File reveal remains a separate proposal.

Current application author/copyright presentation uses Rochal Holdings at the owner's request. Historical contributor records and ADR 0080 remain historical evidence; this UI/manifest update does not invent an assignment document or alter the Apache-2.0 license.

## Compatibility and standards

No wallet, registry, verifier, credential envelope, backup, proposal, database, label, or descriptor format changes. No migration or discard. Public DTOs add policy-address derivation and backup-inspection policy metadata. Internal receive/change descriptor pairs and old backups remain supported; presentation, QR, copy, text and PDF views use one BIP389 multipath descriptor. This changes BIP329 recovery evidence and BIP129 descriptor equality evidence, not Bitcoin script semantics. sortedmulti textual key permutations are compared by complete public origins/xpubs/threshold, not by checksum or a single displayed address.

Automated tests establish native/fixture behavior only. The seven exact hardware models and the replacement macOS package still require physical verification; v0.5.1 c731fa1c is the reported defect baseline.

## Validation and release boundary

Issue #116 records all reported feedback; #115 separately tracks wallet-file reveal. The original source-policy hash inventory remains unchanged pending explicit authorization or independent review of the revised bytes, including the attribution-only manifests. The mandatory validation run therefore fails closed at this gate. Any later approved refresh must preserve the gate and does not authorize a new public release, close a hardware certification item, or replace independent review. The public package version remains v0.5.1 pending release preparation.

Checked in this change: frontend type checking, 722 unit tests, production frontend build, formatting/localization, strict native clippy, all-feature Rust tests (503 unit tests; physical/isolated cases remain classified), isolated real-Core Regtest and focused Chromium/WebKit acceptance at 1180×780 and 390×844. Screenshots cover approval, multi-label entry, deletion, disabled policy creation and descriptor backup in light/dark layouts. Mainnet hardware restore selection still needs exact-device physical certification. `pnpm validate` was attempted and stops at the unchanged source-policy hash snapshot; this is an outstanding review requirement, not a passing validation claim.

## Internal testing identity — 2026-10-10

The owner explicitly requested internal `5.2.0-rcxx` versioning. This branch uses `5.2.0-rc01` consistently in package, Cargo/lockfile, Tauri and frontend identity. This is an internal test candidate, not a v1.0 readiness claim or public release authorization. The published baseline and public authorization remain v0.5.1. The documented multi-network internal builder is used with its existing ad-hoc signing, exact source commit, pinned HWI and package verification. No source-policy hash is refreshed or public gate disabled. Public validation remains held at its existing pre-1.0/version and source-policy review gates; building a private candidate does not establish public release eligibility. Test steps are in `docs/testing/5.2.0-rc01-feedback.md`.
