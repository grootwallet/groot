# Groot 5.3.0

Groot 5.3.0 for macOS Apple silicon brings the faster hardware-signer experience tested with Coldcard Mk4, Ledger Nano S Plus, original BitBox02, BitBox02 Nova, Jade Classic, Trezor Safe 3 and Trezor Model One. Discovery, identification, health checks, address verification and transaction signing use the sealed operation runtime while retaining live signer identity and transaction checks.

- A new start page makes it easier to create, connect or recover a wallet.
- Mainnet payments no longer have the former 0.01 BTC app ceiling. Fee, transaction, policy, network and signer checks still apply.
- New wallets show history-scan progress as soon as the approved scan begins. Activity, errors and payment results have clearer feedback.
- Partner and Family Continuity templates are experimental on Regtest and Testnet4. They are unavailable on Mainnet, and direct USB Miniscript signing is not certified.
- Testnet4 iPhone key pairing and QR multisig signing remain a preview. The iOS binary is separate from this macOS release; Mainnet phone signing is unavailable.

Before approving a hardware signature, compare the address, amount and fee on the device with Groot's transaction review. Existing wallets remain in their network-specific profiles.
