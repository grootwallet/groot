# ADR 0062: Show saved network setup while locked

- Status: accepted for the isolated certification candidate; distribution remains blocked
- Date: 2026-09-09
- Supersedes: ADR 0061 only where it hides saved non-secret node configuration while locked
- Extends: ADR 0020, ADR 0025, ADR 0056, and ADR 0061

## Context

The locked network popover used generic architecture labels even though the selected
wallet's saved node backend and activity-sync choice are not signing secrets. This
made a configured remote full node look indistinguishable from a local node and made
it unnecessarily difficult to confirm the intended network setup before unlocking.

The RPC password is different: it is protected by the wallet credential and must not
be decrypted or sent to the webview while the wallet is locked. Consequently a fresh
fee estimate, reachability check, and Core chain tip cannot be authenticated while
locked without weakening the lock boundary.

## Decision

The locked network popover reads and displays the selected wallet's saved public node
configuration and activity-sync method. It may identify a local or trusted remote
Core backend, direct or Tor-configured transport, and Bitcoin Core or compact-filter
activity sync. The existing node-configuration DTO contains no RPC password.

Credentialed live operations remain locked. Priority-fee and Core-tip rows say that
unlock is required to check them, and the popover states that node credentials remain
sealed. Unlock, lock, and wallet switch continue to clear the native RPC-auth session.

## Compatibility and consequences

This changes no wallet, registry, node-configuration, secret-envelope, proposal, or
backup format. Existing profiles remain compatible. Rollback restores generic locked
labels without migrating or discarding data.

The saved endpoint and username exist in the configuration DTO but are not rendered
by this compact status surface. The RPC password never enters the DTO or webview.
Public distribution still requires the remaining mainnet release evidence and review.
