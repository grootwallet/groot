# Rust wallet agent guide

This file extends the root `AGENTS.md` for `src-tauri/`.

- Treat every command argument, backend response, HWI response, file, QR fragment, backup, descriptor, and PSBT as hostile.
- Secrets stay in Rust-owned zeroized memory. DTOs contain only public wallet data and stable error codes; never expose BDK internals.
- Parse and validate network, descriptor identity, key origins, xpub versions, address network, PSBT identity, sighash, finalization state, and signer fingerprints before mutation.
- Persist intent before presentation. Use atomic files/transactions, bounded reads, owner-only permissions, and explicit corruption behavior.
- Hardware operations use `HardwareTransport`: fixed argument arrays, no shell, null stdin, bounded concurrent output, timeout/kill, discarded stderr, explicit HWI chain, and exact device identity.
- Production code must not `unwrap`, panic on untrusted state, log payloads, or silently fall back. Tests may use `unwrap` for fixtures.
- New policy logic should be pure and exhaustively unit-tested before command/integration/E2E coverage.
- After changes run `cargo fmt --check`, strict Clippy, `cargo test --all-features`, and the relevant real regtest integration.
- Mainnet remains locked by ADR 0012 and `pnpm test:release-gate`.
