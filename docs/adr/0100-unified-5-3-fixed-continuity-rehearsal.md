# ADR 0100: Unified 5.3 fixed-continuity rehearsal

- Status: accepted by the release owner for internal implementation; independent review and physical acceptance pending
- Date: 2026-10-20
- Tracking: #17, #6, #25, #116
- Supplements: ADRs 0042, 0044, 0050, 0096, 0098 and 0099

## Decision

Combine the mobile, fixed Miniscript, Coldcard startup and amount-cap corrections in one 5.3 release-candidate branch. Do not merge main, refresh reviewed-source pins or publish. This supersedes the earlier branch-separation recommendation for internal integration only. ADR 0050's fixed descriptors and delays remain unchanged; arbitrary policies, decaying/expanding coordination and editable delays are excluded.

Test-network setup exposes Partner and Family templates. Every delayed proposal chooses a named path and binds it to the PSBT's identical block-based CSV sequence on every input, transaction version 2 or later, and verified descriptor metadata. Recompile and compare descriptors before authorizing roles. Reject ambiguous, time-based, disabled and mismatched sequences. Family assistance requires a parent and a child-assistance role, rather than any two signatures. Primary renewal is an owned-output self-transfer with no relative lock and is available before delayed maturity. Current chain age, frozen status and role quorum are checked again at import/finalization.

## Compatibility

No wallet, registry, backup, credential, draft, notification or proposal schema changes. Existing proposal storage keeps its primary/delayed marker; the actual persisted PSBT identifies the delayed stage. Existing templates and public descriptors are unchanged. Legacy Recovery/Inheritance remain readable. New named stages do not fit older coordinator behavior; downgrade must fail closed, never reinterpret a stage. Descriptor backups remain the independent recovery artifact. Existing maturity notifications remain limited to their legacy supported policy types; continuity status is inline.

## Boundaries and evidence

Use existing UI components and WalletPort; no new dependency. No hardware-state cache. Mainnet Continuity creation, direct USB Miniscript and phone enrollment into these templates remain blocked. Mobile key signing retains the existing internal Testnet4/standard-multisig boundary. The pre-extracted Coldcard HWI runtime retains ADR 0098's complete verification and rehearsal-only activation.

Unit, browser and isolated real-Core evidence must cover every role/path, before/at/after maturity, reorg/reconfirmation, persisted partial signatures, wrong-role quorum, clean descriptor recovery and renewal. They do not certify a physical model or firmware. Public GA still requires independent review, reviewed-source authorization and exact-candidate physical acceptance. See the RC10 record for actual results and remaining steps.
