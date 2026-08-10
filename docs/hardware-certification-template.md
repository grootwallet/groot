# Groot physical hardware certification record

Store completed copies only in `hardware-certification.local/`. Never record a seed, address, xpub, PSBT, device path, RPC credential, or complete fingerprint.

- Device family/model:
- Firmware:
- Host OS/version:
- Groot commit:
- HWI version:
- Network: regtest / signet / testnet4
- Date/reviewer:

| Check | Pass/fail | Sanitized note |
| --- | --- | --- |
| Device detected only when initialized and ready |  |  |
| Locked/rejected/companion-owned states are actionable |  |  |
| Account origin and shortened fingerprint confirmed on device |  |  |
| Standard public descriptor import/export round-trip |  |  |
| BSMS first-address verification |  |  |
| Receive address verified on device when supported |  |  |
| Unsigned PSBT review matches recipient, amount and fee |  |  |
| Reject leaves proposal retryable and unchanged |  |  |
| Cable signature accepted for exact signer only |  |  |
| File or crypto-psbt UR exchange accepted |  |  |
| Wrong device and mutated PSBT rejected |  |  |
| RBF replacement signed and broadcast |  |  |
| CPFP child signed and package confirmed |  |  |
| Restart preserves wallet, labels and proposals |  |  |
| Recovery on a clean profile finds the same first address and balance |  |  |

Known limitations:

Certification decision: PASS / FAIL / LIMITED
