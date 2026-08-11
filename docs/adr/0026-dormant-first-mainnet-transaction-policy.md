# ADR 0026: Dormant first-mainnet transaction policy

Status: Accepted as a disabled safety constraint

## Context

ADR 0012 blocks mainnet. A later enabling change must not introduce network, backend, and spend constraints for the first time in the same release candidate. Those constraints can be implemented and tested now while remaining unreachable.

## Decision

The Rust boundary keeps `MAINNET_ENABLED` false. Before opening any wallet SQLite database it rejects a Bitcoin-mainnet runtime. The candidate-only validator requires the exact Bitcoin genesis block and a loopback `LocalCore` backend. The first candidate permits exactly one external recipient and at most 1,000,000 satoshis per transaction. Batch spending remains disabled.

The cap is an additional loss limiter, not a claim that the software is safe for that amount. Changing it, enabling mainnet, or adding another backend requires a superseding ADR and completed release evidence. Test networks retain their existing behavior.

## Consequences

The pure checks add no I/O or dependency and negligible constant-time work. The current regtest build remains behaviorally unchanged. Mainnet cannot become reachable through frontend configuration alone, and the future candidate constraints have regression coverage before release review.
