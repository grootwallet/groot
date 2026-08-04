# ADR 0006: guided Miniscript recovery templates

Status: accepted for V2 preview; funding remains gated.

## Context

Arbitrary Miniscript can create policies whose explanation, timelocks, hardware support, or recovery properties are misunderstood. V2 needs recovery, decaying, and expanding multisig without becoming an unaudited script editor.

## Decision

Satchel exposes three typed templates compiled only in Rust:

- operational threshold OR a CSV-delayed recovery threshold;
- fixed signer set with a threshold that falls by exactly one at each boundary;
- fixed threshold with a strict signer superset added at each boundary.

The first release accepts block-based relative locks from 144 through 52,560 blocks, at most eight stages, public BIP48 test-network keys, and WSH descriptors. Compilation must pass Miniscript type compilation and `sanity_check`; exports use canonical checksummed external/change descriptors. Mixed time/height locks and unrestricted policy text are rejected.

The UI may simulate UTXO age, but approximate calendar time is never authoritative. Funding stays disabled until before/at/after-boundary regtest spends, per-UTXO maturity, reorg behavior, recovery drill, and compatible device registration all pass.

## Consequences

The templates are easier to explain and property-test, while some valid Miniscript policies remain unavailable. A compiled preview is not labeled a funded V2 wallet until the remaining chain and hardware gates pass.
