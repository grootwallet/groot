# ADR 0063: Cache public network observations for locked display

- Status: accepted for the isolated certification candidate; distribution remains blocked
- Date: 2026-09-09
- Supersedes: ADR 0062 where locked fee and tip rows require unlock to contain values
- Extends: ADR 0020, ADR 0025, ADR 0056, ADR 0061, and ADR 0062

## Context

The locked network popover can read saved non-secret configuration, but a fresh fee
estimate or Bitcoin Core tip query requires the RPC password protected by the wallet
credential. Keeping or decrypting that password after lock would weaken the wallet
lock boundary. Showing empty metric rows also prevents the user from checking the
last network state that Groot successfully verified.

## Decision

After a successful authenticated fee estimate, Groot atomically stores the selected
wallet's public priority-fee observation. After a successful node check or wallet
sync, it atomically stores the public network-tip observation. The locked popover may
read and display those last verified values. It does not perform authenticated RPC
while locked and it never stores or returns the RPC password in this cache.

The compact label is **Network tip**, because the value describes the verified chain
height rather than the availability of a particular Core service. A missing or
invalid cache produces an honest unavailable state; no value is invented.

## Compatibility and consequences

This adds an optional owner-only `network-status.json` file to each wallet directory.
Existing wallets require no migration: the file is created only after the next
successful observation, and absence remains valid. Wallet, registry, node,
secret-envelope, proposal, database, and backup formats are unchanged. Rollback may
leave the additive cache unused and does not strand or mutate wallet data.
