# ADR 0056: Restore PIN-only unlock and remove the global mainnet banner

- Status: accepted
- Date: 2026-09-05
- Supersedes: ADR 0055 only for existing-wallet Core admission presentation and the persistent global mainnet banner

## Context

The first internal mainnet candidates made an existing wallet repeat its RPC URL,
username, and password on every unlock. That duplicated the wallet's already
persisted credential-encrypted Core setup, exposed node fields on a screen whose
documented purpose is wallet authentication, and regressed the established
PIN-only hardware-wallet unlock flow. An internal ad-hoc RC was also compiled
with a production Developer ID runtime requirement, so its otherwise valid
bundled HWI was rejected after the containing app was ad-hoc signed.

The persistent top-of-window mainnet banner displaced every route even though the
existing network status already identifies Mainnet and payment review repeats the
recipient, amount, fee, and signer at the decision point.

## Decision

Existing wallets unlock with only their wallet passphrase or app PIN. Rust uses
that credential to decrypt the wallet's saved Core route and RPC password. On
Overview, before the first mainnet database read in a new unlocked session, Groot
authenticates that exact saved loopback Core configuration and verifies the
compiled network and Bitcoin genesis. Only a successful check marks the in-memory
node session as eligible for a database-open permit. Failure remains on Overview
with the normal retry and Settings paths; RPC credentials never cross back into
the webview or appear on the lock screen.

New-wallet creation retains ADR 0055's explicit, one-shot, purpose-bound Core
admission before any wallet files are created. Existing-wallet sessions retain
the same permit-before-SQLite invariant, but the preflight is sourced from the
encrypted per-wallet setup after PIN-only authentication rather than repeated
renderer input.

The persistent global mainnet banner is removed. The normal Mainnet network
identity remains visible, and payment review continues to require the actual
recipient, amount, fee, and signing-device comparison.

Internal ad-hoc mainnet RCs compile the macOS code-signing requirement as
`REHEARSAL_ONLY`, bundle the pinned HWI, ad-hoc sign the package, and verify both
the package and compiled marker. Production builds retain the exact reviewed
Developer ID team requirement and remain separately signed, notarized, stapled,
and release-gated.

## Compatibility and consequences

Wallet databases, registry records, portable secret envelopes, saved node files,
descriptors, proposals, backups, and BIP behavior are unchanged. Existing
profiles require no migration and must not be recreated. A newly unlocked mainnet
wallet cannot read its database until its saved node passes the native check; an
outage therefore appears on Overview rather than requesting RPC credentials on
the lock screen.

This decision does not authorize distribution, signing, notarization, publishing,
funding, broadcast, or a merge to `main`.
