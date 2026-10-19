# ADR 0094: Retain offline mobile coordination

- Status: accepted implementation direction; release certification pending
- Date: 2026-10-18
- Extends: ADR 0001, ADR 0035 and ADR 0093

Recover the existing coordination implementation from `85e794a28a222a6591cb080b6a23efcbbc1582d2` rather than inventing another protocol. Retain bounded BIP129 encrypted key enrollment, exact account-key proof, expiring single-use invitation, two-display comparison, complete descriptor/signer-manifest validation and atomic staged completion. Retain signature-only `crypto-psbt` interchange and native exact-revision review. QR framing is transport, never authentication. No relay or ongoing message channel is introduced.

Threats and rejection cases include QR replacement, wrong token/MAC/key/origin/network/policy, expiry/replay, duplicate completion, interrupted commits, malformed or oversized UR and hostile PSBT change/input/sighash metadata. A compromised phone OS during signing remains a key-extraction risk. Bitcoin signing occurs in native Rust memory, not inside Secure Enclave. Communication revocation cannot alter the onchain signer set.

Existing registry, descriptor, proposal and backup formats stay unchanged. Retain the branch's public wallet protocol version and sidecar schema; completed old wallets are not rewritten to invent metadata. Unsupported protocol versions fail before mutation. The previous branch's duplicate ADR 0048 is reference history only. Keep Mainnet coordination blocked.

The integrated source must preserve current native worker scheduling, selected-wallet checks, accepted-broadcast recovery and scoped CSS. Branch test results alone do not certify the integrated candidate. Required evidence includes native adversarial/Core tests, both themes and viewport sizes, physical Testnet4 pairing/signing, written-word recovery, lock/background/restart and independent review before release-source pins change.
