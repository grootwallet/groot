# Mainnet certification-candidate closing review — 2026-09-03

## Scope and verdict

The supplied closing security review inspected exact range
`373c305e25d79b3a5d5d52ebed79e367c194c937..76016a54a777506f564aafcca9c2ed6eae2df4c7`
on `codex/mainnet-final-enablement`. It returned **PASS** for the limited ADR 0055
certification-candidate scope, with no blocking finding. This is source-diff evidence;
it does not replace independent human sign-off, reproducible Build A/B evidence,
signed-package verification, physical-device certification, or the capped
minimal-value mainnet rehearsal. The separate unsigned Build A/B evidence later
passed for frozen commit `2110eaf` and is recorded in
[`reproducible-mainnet-builds-2026-09-04.md`](reproducible-mainnet-builds-2026-09-04.md);
the other listed gates remain open.

The review verified the dedicated compile-time identity and isolated storage,
distribution block, pre-database local-Core admission, exact genesis and
synchronization checks, scope/configuration/expiry binding, excluded backend and
wallet-policy surfaces, mainnet derivation parameters, hardware admission, trusted
transaction limits, secret handling, source pins, and unsigned-build evidence
boundary.

## Non-blocking observations

- The full legacy Rust suite under the mainnet compile identity reported 59
  failures. The reviewer traced them to Regtest/testnet key/address fixtures,
  fake-HWI programs correctly rejected by public-network executable policy, and
  features explicitly excluded from ADR 0055. No production-path exposure was
  identified.
- Two high-value shared tests were unintentionally stopped by a hard-coded
  `Network::Regtest` wallet before reaching their assertions. The final cleanup
  makes only those wallet constructors use the compiled `NETWORK`, preserving the
  exact proposal non-recipient ownership and change recovery-gap checks under both
  Regtest and mainnet identities.
- The optional renderer preservation flag on onboarding/hardware cancellation does
  not weaken the Rust-owned purpose, wallet, exact-configuration, or monotonic-expiry
  checks.
- Fake-HWI process fixtures remain test-network evidence. Mainnet package evidence
  uses the reviewed bundled-HWI provenance and signature verification boundary.

## Compatibility and BIP assessment

The cleanup changes tests and documentation only. It changes no runtime behavior,
persisted format, DTO, descriptor, protocol implementation, supported BIP, or
migration requirement. Distribution and merge to `main` remain blocked.
