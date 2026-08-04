# Implementation status

This ledger prevents prototype UI from being mistaken for production wallet behavior. “Implemented” means wired through the real Tauri adapter; “browser fixture” means deterministic UI behavior only.

| Capability | Browser fixture | Rust/Tauri | Automated evidence | Release status |
| --- | --- | --- | --- | --- |
| 24-word create/recover/unlock | Yes | Yes, native generated-word display | Rust credential/envelope tests; frontend E2E | Regtest functional; platform certification pending |
| Single-key balance/activity/UTXOs | Yes | Yes, BDK + Core RPC | Unit and UI E2E | Regtest functional |
| Coin select/freeze/unfreeze | Yes | Yes, persisted exact-input BDK builder | Policy/UI E2E; corruption persistence unit | Regtest functional |
| Labeled receive/discard/QR/copy/details | Yes | Yes | Policy and UI E2E | Regtest functional |
| Single-key prepare/sign/broadcast | Yes, including Receive-address round trip | Yes, persisted restart-safe PSBT, auto or exact inputs | Network-prefix and wrong-PIN E2E; restart/corruption Rust tests | Regtest functional |
| Single-key delete | Yes | Yes, symlink-safe tombstone removal | Filesystem unit + UI E2E | Regtest functional; no flash-erasure claim |
| Multisig policy validation | Yes | Yes | TypeScript and Rust unit tests | Implemented |
| BIP48 `wsh(sortedmulti)` descriptors | Yes preview | Yes, checksummed and BDK-parsed | Rust canonicalization/address tests | Implemented |
| Coordinator PIN + watch-only persistence | Yes | Yes | Rust build/test/Clippy; setup E2E | Implemented |
| Manual public-key import | Yes | Yes validation at preview/create | Duplicate and setup E2E | Implemented |
| Desktop HWI enumerate/xpub/sign/address verify | Virtual devices plus session health details | Yes when `hwi` is installed; `hardware_check_cosigner` re-enumerates and matches the saved fingerprint | Process-boundary units + virtual signer integration + device-modal E2E | Certification-ready, not certified; offline records never claim physical verification |
| File PSBT/backup exchange | Yes | Bounded Rust validation | Unit + desktop/mobile E2E | Functional |
| UR/animated QR/camera exchange | Hidden | Bounded multipart foundation only | Hostile-frame units | Roadmap; not represented as UR |
| Multisig receive/sync/balance | Yes | Yes, separate BDK database + labels | Descriptor address unit test; desktop/mobile route E2E | Regtest functional |
| Multisig PSBT collect/merge/finalize/broadcast | Yes, pre-funded 2-of-3 demo vault | Yes, persisted PSBT + HWI/import merge | Ready-made-vault E2E, adversarial Rust PSBT suite, real 2-of-3 Core broadcast, desktop/mobile E2E | Regtest functional; physical devices pending |
| Multisig export/recovery/delete | Yes | Yes, checksummed JSON backup + first-address drill | Rust tamper/round-trip tests and desktop/mobile lifecycle E2E | Regtest functional |
| Recovery/inheritance Miniscript | Yes, guided creation | Rust compiler, sanity analysis, descriptor persistence, maturity selector | Boundary/reorg units and desktop/mobile creation E2E | Immediate path regtest-capable; funded delayed-path spends pending |
| Decaying/expanding multisig | Yes, guided simulator | Rust compiler and timeline analysis | Rust edge cases; decaying UI E2E | V2 preview; funded/reorg gates pending |
| Multiple-wallet registry | Yes | UUID-isolated creation, selection, deletion, and legacy migration | Schema/corruption/rollback/restart tests; desktop/mobile E2E | Regtest functional |
| Network backends | Local Core shown | Validated Core/Esplora policy types | URL/credential/preset units | Local regtest wired; remote adapters pending |
| Mainnet release | Never available | Compile-time disabled | CI release-gate script + ADR/checklist assertions | Blocked pending external review, physical certification, and release evidence |

Update this table in the same change whenever a capability crosses a boundary.
