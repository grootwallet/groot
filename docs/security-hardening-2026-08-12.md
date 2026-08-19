# Security hardening record — 2026-08-12

Current-state note (2026-08-19): GROOT-01 and GROOT-07 below record remediation for the former device-bound version-2 envelope. ADR 0037 supersedes those device-key lifecycle requirements. Version 3 authenticates a credential-wrapped data key and payload without a platform keystore; authenticated v2 files migrate atomically after a correct unlock.

## Scope and provenance

This remediation starts from commit `dc16efa5efdfee3391898dc7cc6996fd6a467c46`, the exact clean revision reviewed independently in the `codex/first-mainnet-backend-evidence` worktree. Implementation occurs on `codex/security-review-remediation`; the unrelated modified `main` hardware-testing checkout is not touched.

The supplied review was static and read-only. Each item below was rechecked against the cited current source before modification. This record documents remediation; it is not an independent audit, penetration-test certificate, physical-device certification, or mainnet authorization.

## Finding disposition and remediation

| ID       | Revalidated disposition | Remediation                                                                                                                                                                                                                                                                                                                         | Primary regression evidence                                                                                               |
| -------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| GROOT-01 | Confirmed               | Version-2 software and multisig envelopes load through the current device key first. Only `DeviceKeyNotFound` in Regtest can enter legacy migration.                                                                                                                                                                                | Branch tests run under Regtest, Signet, and Testnet4; three-network native build matrix.                                  |
| GROOT-02 | Confirmed               | External-signer descriptor export now checks and records the persisted per-wallet authentication throttle around credential verification.                                                                                                                                                                                           | Existing throttle persistence/error tests plus command-path source review.                                                |
| GROOT-03 | Confirmed               | `signature_progress` and signed-PSBT merge verify each ECDSA signature against the real PSBT input sighash before counting or mutation. Invalid signatures return `invalid_signature`.                                                                                                                                              | Real SegWit multisig-sighash fixture; valid merge, forged signature, no-count, and no-mutation tests.                     |
| GROOT-04 | Confirmed, Low          | Saved multisig descriptor/xpub metadata is returned only after the selected multisig wallet's session is authorized.                                                                                                                                                                                                                | Locked-state boundary review and existing authenticated multisig route coverage.                                          |
| GROOT-05 | Hardening               | Recurring RPC clients borrow the zeroizing session password directly; avoidable `Auth::UserPass` string clones and non-zeroizing application request buffers are removed.                                                                                                                                                           | Direct/Tor transport tests; static ownership review. Third-party header allocation remains residual.                      |
| GROOT-06 | Hardening               | The persisted cooldown remains restart-safe through wall time and gains a process-monotonic retry floor.                                                                                                                                                                                                                            | Auth throttle persistence/unit tests. Clock control plus repeated restart remains documented residual risk.               |
| GROOT-07 | Confirmed hygiene gap   | One rollback helper deletes the UUID device key and then the partial directory for every wallet creation/recovery variant, including the additional Miniscript recovery path. Secure-store deletion is now fallible; if it fails, cleanup returns an error and retains the profile directory instead of silently orphaning the key. | Static sweep proves no creation path retains raw directory-only rollback; Keychain lifecycle remains platform acceptance. |

## Related correctness and documentation closure

- Address-validation copy uses the compiled network name instead of saying Regtest in Signet/Testnet4 builds.
- Recipient dust failures map to `invalid_amount`; malformed or stale coin identifiers map to stable coin-specific errors instead of `internal_error`.
- The frontend `WalletErrorCode` contract includes the backend's `invalid_coin`, `coin_unavailable`, and `invalid_signature` remediation codes, so renderer-side handling remains type-complete without changing the adapter's stable-code pass-through.
- The Rust registry accepts exactly the documented inactivity timeout choices: 1, 5, 15, 30, and 60 minutes.
- Documentation now distinguishes persisted single-key proposal integrity from current UI resumption: external-signer and multisig routes visibly reload active proposals; generic single-key send does not yet expose a post-restart resume selector.
- ADR 0028 records the new enforcement boundaries and residual risks. `SECURITY.md`, the security model, threat model, architecture, product spec, implementation status, testing guide, and release checklist are updated in the same change.

## Validation contract

The change is complete only after:

1. focused proposal/auth/registry/transport tests pass;
2. the envelope branch test runs under Regtest, Signet, and Testnet4, and the native three-network compile matrix passes;
3. `cargo fmt --check`, strict Clippy, and the full locked Rust suite pass;
4. `pnpm validate` passes without changing dependencies or contacting hardware;
5. the final diff contains no unrelated hardware-session work.

Physical HWI, signed-package Keychain lifecycle, real remote-node TLS, system-clock manipulation across process restarts, and live funded Signet/Testnet4 remain external release evidence, not claims made by this patch.

## Local validation evidence

The isolated remediation worktree passed the following on 2026-08-12 without starting HWI, enumerating USB devices, or using the hardware-test application-data directory:

- `cargo fmt --check`;
- strict locked Clippy for all targets and features;
- the full locked Rust suite: 184 library tests passed, 3 environment-gated tests ignored, 2 adversarial-input integration tests passed, and 4 Bitcoin Core harness tests remained explicitly ignored;
- all 23 proposal tests, including real-sighash valid merge and forged-signature no-mutation coverage;
- the current-key-first envelope test under Regtest and the public-network fail-closed branch under independent Signet and Testnet4 builds;
- `pnpm network:check-builds` for Regtest, Signet, and Testnet4;
- `pnpm validate`, including architecture, secret-surface, supply-chain, brand, mainnet-lock, signed-update/HWI-evidence mutation, unsigned-build-comparison, runtime-launcher, Svelte diagnostics, 84 frontend tests, and the production static build.

The first sandboxed full Rust run denied five loopback socket binds. The identical suite was rerun with permission for disposable local RPC/Tor fixtures and passed; this was an execution-environment restriction, not a code failure. No live Core, Tor service, remote endpoint, hardware wallet, or physical camera was contacted.

## Follow-up re-scan closure

An independent static re-scan of the integrated remediation identified one type-contract omission: Rust emitted `invalid_coin`, `coin_unavailable`, and `invalid_signature`, but the frontend `WalletErrorCode` union did not represent those strings. Runtime behavior was unaffected because the Tauri adapter already preserved backend error codes. The isolated follow-up branch added the three union members and a focused contract regression test. The focused test and full `pnpm validate` gate passed with 107 frontend tests and zero Svelte diagnostics, without starting Groot or contacting hardware.
