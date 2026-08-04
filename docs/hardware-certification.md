# Physical hardware certification

Virtual devices prove coordinator behavior, not vendor compatibility. Run this only with disposable Regtest, Signet, or Testnet4 wallets until the mainnet checklist is approved.

## Local preflight

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm hardware:preflight
```

The command prints HWI enumeration locally. Do not paste or commit its output because it may contain a device path and fingerprint.

Start Bitcoin Core regtest and Satchel in separate terminals:

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm regtest:start
```

```sh
cd /Users/thibm/Documents/Codex/2026-07-17/let
pnpm tauri dev
```

## Per-device acceptance story

Record only vendor/model, firmware, host OS, HWI version, date, and pass/fail/limitation. Keep the report under `hardware-certification.local/`, which is gitignored.

1. Connect and unlock one device; keep it ready over USB (and open its Bitcoin app when that vendor requires one).
2. Create a 2-of-3 vault and import its BIP48 public account key through HWI.
3. Confirm the on-device fingerprint matches the locally saved record.
4. Disconnect/reconnect and run the health check.
5. Generate a labeled vault address and verify it on-device where supported.
6. Fund it on regtest and prepare a PSBT.
7. Reject signing once; confirm Satchel remains retryable and records no signature.
8. Sign the unchanged PSBT; confirm exactly that signer advances.
9. Connect a different device and confirm identity mismatch fails closed.
10. Import a PSBT with changed recipient, amount, input, sighash, origin, or final scripts; every mutation must fail.
11. Complete the threshold with an independent signer, broadcast, mine, restart, and verify proposal/history state.
12. Export the descriptor backup and reconstruct the same first receive address independently.

Repeat for Coldcard, Trezor, Ledger, and BitBox02. Vendor-specific policy-registration/address-display limitations must be visible in the UI and release notes; they must never be represented as successful verification.
