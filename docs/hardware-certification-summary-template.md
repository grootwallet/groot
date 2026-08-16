# Sanitized hardware certification summary

This public/reviewable summary is derived from a completed local record. It is evidence metadata, not the sensitive test record itself. Never copy a seed, credential, address, xpub, PSBT, device path, RPC secret, or complete fingerprint into this file.

- Device family/model:
- Firmware:
- Host OS/version:
- Groot candidate commit:
- HWI version:
- Network: regtest / signet / testnet4
- Test date:
- Local reviewer:
- Independent reviewer:

| Release criterion                                                     | Pass / fail / limited / not applicable | Sanitized evidence note |
| --------------------------------------------------------------------- | -------------------------------------- | ----------------------- |
| Initialized/ready and companion-owned states are accurate             |                                        |                         |
| Public account origin and shortened identity confirmed                |                                        |                         |
| Public descriptor/BSMS round trip reconstructs the same first address |                                        |                         |
| Disconnect/reconnect and saved-identity health check                  |                                        |                         |
| Receive address trusted-display verification, where supported         |                                        |                         |
| User rejection leaves the exact proposal retryable and unchanged      |                                        |                         |
| Exact unchanged PSBT signs for only the expected signer               |                                        |                         |
| Wrong device and every required PSBT mutation fail closed             |                                        |                         |
| File or `crypto-psbt` UR interchange                                  |                                        |                         |
| RBF replacement and CPFP package                                      |                                        |                         |
| Restart persistence and clean-profile recovery test                   |                                        |                         |
| Real 2-of-3 Testnet4 participation                                    |                                        |                         |

Known limitations and release-note wording:

Local sensitive record reviewed without copying identifiers: yes / no

Certification decision: PASS / FAIL / LIMITED

Reviewer sign-off and date:
