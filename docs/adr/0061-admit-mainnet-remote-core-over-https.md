# ADR 0061: Admit user-controlled remote Mainnet Core over HTTPS

- Status: accepted and released in v0.4.96
- Date: 2026-09-09
- Supersedes: ADR 0052, ADR 0053, and ADR 0055 where they exclude direct remote Core; ADR 0055's source-merge prohibition only as described below
- Extends: ADR 0020, ADR 0025, ADR 0055, and ADR 0056

## Context

The first candidate admitted only a loopback Bitcoin Core service. That is a sound
default, but it prevents a user whose desktop can retain only a pruned node from
using a separately operated full-verifying node for recovery and historical
verification. Groot already implements a direct remote Core transport with bounded
requests and responses, disabled redirects, explicit credentials, system-native
TLS certificate validation, exact-network and exact-genesis checks, and no fallback.
The mainnet release policy and setup UI were the remaining exclusions.

## Decision

The isolated Mainnet candidate may admit either:

- `LocalCore` over HTTP on a validated loopback address; or
- `RemoteCore` over direct HTTPS with a system-trusted certificate.

Both routes require explicit username/password authentication, a fully synchronized
Core service, the exact Bitcoin genesis block, and the existing purpose-, wallet-,
configuration-, and time-bound pre-database admission. Credentials in URLs,
plaintext remote RPC, redirects, Esplora, Tor/onion Core, compact-filter fallback,
and any automatic backend substitution remain rejected.

The locked network popover may describe the compile-time network and permitted
service architecture, but it does not decrypt or reveal the saved endpoint,
username, credentials, private topology, reachability, fee, or tip information.
Those values remain available only after unlock.

This locked-summary restriction is superseded by ADR 0062 only for saved non-secret
node configuration and the activity-sync method. Credentialed reachability, fee, and
tip checks remain unavailable while locked.

The implementation originally merged under a certification-only authorization.
ADR 0053 subsequently authorized public v0.4.96 after the completed transport
and release evidence was owner-certified.

## Release evidence and consequences

Public v0.4.96 certification proved the
real, owner-controlled remote Core connection with valid-certificate success,
hostname mismatch, expired or untrusted certificate, redirect, wrong-authentication,
timeout, oversized-response, wrong-chain, restart, recovery scan, fee estimation,
broadcast, and no-fallback cases. Network-level observation must confirm the
intended hostname and route, and the frozen diff and evidence require independent
security review.

No wallet, registry, node-configuration, proposal, or backup format changes. Saved
test-network remote configurations already use the same tagged `RemoteCore` shape.
Rollback therefore disables new remote admission without migrating wallet data;
users of a remote-backed profile must reconnect to an admitted local Core before a
rollback build can open wallet data.
