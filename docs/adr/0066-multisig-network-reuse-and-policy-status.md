# ADR 0066: Make selected multisig network reuse explicit and keep policy reference independent

- Status: accepted for the isolated certification candidate; distribution remains blocked
- Date: 2026-09-13
- Creation-screen choice superseded by ADR 0074; native explicit-copy and policy-status decisions remain in force.
- Amends: ADR 0064's fallback only when a multisig creator explicitly selects setup reuse

## Context

An existing Core setup was listed only while its source wallet was unlocked. After a restart, the source could be present but not ready, so the creation screen hid the copy choice and passed no source ID. The resulting watch-only Mainnet wallet was published offline. If a previously ready source failed during the native copy, creation also published an offline wallet despite the explicit selection.

The Policy page coupled its public first-address reference to a separate database-gated verification-status read. A missing Core admission rejected the status read and discarded the successful public address, so the modal could say **Saved signer not found** even after HWI found the device. Separate status, health, and snapshot failures also produced three warning toasts. Existing-wallet setup adoption rechecked Core but reset the destination's in-memory verified status while loading its encrypted RPC credential.

## Decision

Multisig creation shows a saved source even when it is locked, with an explicit unlock-or-opt-out explanation. If the user selects reuse, the source must be ready at submission and the native revalidation/encrypted copy must succeed **before** profile publication. A failed selected copy rolls back the candidate and preserves the draft; the user may instead explicitly uncheck reuse to create offline. First-wallet and explicit offline creation remain allowed. Software and single-key hardware fallback behavior is unchanged.

Existing-wallet adoption marks the selected destination's node session verified immediately after its already successful exact-chain preflight and encrypted credential load. The Policy page loads the public address independently of status reads, reports at most one highest-priority automatic failure with a durable Settings action, and never labels a found signer as missing merely because the address reference failed to load. These are display and session-order corrections, not weaker signer matching or a bypass of the Mainnet database permit.

## Compatibility and validation

Wallet, registry, draft, database, node-config, encrypted RPC-secret, descriptor, backup, and proposal formats are unchanged. No migration or data discard is required. Existing offline Mainnet wallets remain offline until their owner explicitly adopts a ready source in Settings. Fake-HWI and browser regressions are not physical device evidence; the exact packaged candidate still needs a restart, adoption, Coldcard acknowledgement, Ledger/Nova policy proof, receive, and sync test before Mainnet release review.
