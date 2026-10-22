# Groot 5.3.0 RC18 — prerelease test candidate

This candidate is for the release owner's final macOS Mainnet test. It is **ad-hoc signed and not notarized**. It uses Groot's canonical app identity and existing network-separated wallet profiles. Back up wallets before opening an older version again. It is not the signed 5.3.0 GA installer.

## Changes since 5.2.0

- Faster USB signer discovery, identity, health, address display and transaction signing for Coldcard Mk4, Ledger Nano S Plus, original BitBox02, BitBox02 Nova, Blockstream Jade Classic, Trezor Safe 3 and Trezor Model One. Groot still checks the full live account identity for each operation and verifies the transaction and returned signatures.
- A simpler new start page guides people to add a software, hardware or multisig wallet, or recover a software wallet.
- The 0.01 BTC Mainnet rollout spend ceiling is removed. Transaction, fee, network, policy and signer checks remain.
- Wallet creation shows first-history scan progress as soon as the approved scan starts. Hardware connection errors use consistent spacing and Jade suggests checking its selected Bitcoin network when account-key reading fails.
- Partner and Family Continuity templates are available for **Regtest/Testnet4 experiments only**. They are unavailable on Mainnet and are not certified for direct USB Miniscript signing.
- Testnet4 phone-key pairing and QR signing remain a preview. The iOS binary is not part of this macOS candidate; Mainnet phone signing is unavailable.

## Final owner checks

Confirm that existing Mainnet wallets open in the canonical Groot app, network switching preserves separate wallet lists, and each of the seven signers can complete its supported health, identity, address-display and signing flow. Check wrong-network, locked and disconnected recovery without accepting an unexpected address or transaction. The owner's RC17 error-spacing, Jade network-hint and first-scan progress checks passed before this candidate was built.

The public 5.3.0 release still requires a Developer ID-signed, notarized package with the same fast HWI runtime, reproducible executable evidence and exact release authorization. This prerelease candidate does not satisfy those production-package gates.
