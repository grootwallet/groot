# ADR 0072: Automatically scan new hardware wallets from genesis

- Status: accepted
- Date: 2026-09-20
- Supersedes: ADR 0016 and ADR 0071 only for the initial scan of a newly created external-hardware profile
- Extends: ADR 0040, ADR 0064, ADR 0070, and ADR 0071

## Context

A hardware signer exposes public account data but no trustworthy seed-creation or
first-use height. Treating import time as its birthday can hide older transactions
and present a false zero balance. Requiring a user to find Settings and choose a
birthday before any work begins leaves the new wallet at **Never synced**, even when
its managed or copied Bitcoin Core connection is already ready.

## Decision

Before publishing a newly created external-hardware profile, Groot saves block `0`
and the standard gap limit in the existing recovery-settings table. Leaving hardware
onboarding immediately wakes the global sync scheduler. The scheduler therefore
starts the existing resumable full-history scan without waiting for its 35-second
steady-state cadence or for Overview to request it.

Overview opens in automatic full-history mode, attaches to native progress, and does
not flash the manual history-choice warning before the scan starts. **Scan settings**
remains available after creation, so a user who knows an authoritative birthday can
cancel and deliberately choose it. Groot never invents a recent lookback window.

Generated software wallets retain their creation-tip birthday. Native recovery and
other imported profiles retain their explicit birthday choice. Existing hardware
profiles are not rewritten or migrated; this rule applies only while creating a new
profile.

## Consequences

The safe automatic path may take longer than a user-selected birthday scan, but it
cannot silently omit prior wallet history. The change adds one row already supported
by the existing schema and changes no wallet, descriptor, key, credential, node,
proposal, or backup format. No migration or discard is required.
