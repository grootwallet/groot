# ADR 0016: Pre-mainnet interoperability and recovery controls

- Status: Accepted for test networks; the TLS portion is superseded by ADR 0020, the Tor transport portion by ADR 0025, and the explicit first-scan choice for newly created external-hardware profiles by ADR 0072; mainnet remains blocked
- Date: 2026-08-05

## Context

Satchel needs portable descriptor backups, air-gapped PSBT exchange, explicit transaction acceleration, deterministic recovery scans, and private remote-node connectivity before physical hardware certification can be meaningful. These capabilities cross security boundaries and must not be implemented as presentation-only conveniences.

## Decision

1. Satchel supports the public four-line BIP129/BSMS 1.0 descriptor record with the standard `/0/*,/1/*` branch pair. Imports are bounded, public-only, canonical, network checked, descriptor parsed, and verified by deriving the recorded first address. BIP129 encrypted coordinator/signer transport is not implemented.
2. Satchel JSON remains available for Satchel-specific labels and custom Miniscript recovery metadata that a public BSMS descriptor record cannot preserve.
3. Air-gapped PSBT exchange uses Blockchain Commons UR v2 with the `crypto-psbt` type and a canonical CBOR byte-string body. The trusted Rust boundary enforces payload, frame-count, frame-size, and fragment-size limits. The webview handles only already-public PSBT frames and never mnemonic or private-key UR types.
4. Newly created transactions signal BIP125 replacement. RBF reconstructs a replacement from the persisted BDK transaction and CPFP spends a wallet-controlled unconfirmed output while targeting the combined parent/child package fee. Both produce a normal persisted proposal that must pass the existing review and signing flow.
5. Wallet birthday height and descriptor lookahead are persisted in the wallet database. A credential-authenticated full rescan reconstructs chain state from the configured birthday and validates a bounded gap limit. A fresh Core wallet must explicitly choose current tip, a birthday block, or full history before normal synchronization. The first scan uses the same per-block persisted recovery path; after interruption it resumes only from a checkpoint that still agrees with Core and otherwise restarts from the configured birthday. Inactivity may lock presentation without revoking the already-created read-only node client or discarding scan progress.
6. Remote Bitcoin Core connections are either direct HTTPS or HTTP `.onion` endpoints through an explicit loopback SOCKS5 proxy. Plain remote clearnet HTTP, non-loopback proxies, embedded credentials, and onion endpoints without Tor are rejected.
7. Reproducibility is assessed on unsigned binaries built from the same clean commit and locked dependency graph. Signing and notarization happen only after unsigned hashes are compared and therefore are not expected to be byte-identical.

## Supply-chain decision

The exact `ur` 0.4.1 source was reviewed before pinning; it forbids unsafe code and has no build script. The exact `jsonrpc` 0.18.0 proxy feature and `socks` 0.3.4 source were reviewed before pinning. Enabling that proxy feature changes `jsonrpc`'s legacy simple transport globally, so Satchel never uses that transport for direct RPC: direct HTTP/HTTPS is constructed explicitly with the rustls-backed minreq transport and only an explicit onion configuration constructs the SOCKS transport. The SOCKS crate contains OS socket-level unsafe code, so it remains a narrow optional transport boundary and receives no wallet key material. Lockfile changes are mandatory and CI continues to run dependency advisories and policy gates.

## Consequences

- A BSMS record is interoperable but is not a complete backup of Satchel-only labels or custom recovery metadata.
- Camera scanning is permission-gated and must be physically certified per desktop/mobile platform; text/file fallback remains available.
- Acceleration can fail safely when the original transaction is confirmed, does not signal RBF, has no wallet-controlled child output, or cannot meet the requested package rate.
- A birthday set too late can omit old history; the UI must explain this, require an explicit first-scan choice, keep height `0` as the safest option, and never present a numeric balance as verified before completion.
- Tor privacy depends on a functioning local proxy and does not imply P2P compact-filter privacy.
- None of these changes enables mainnet. ADR 0012 and the mainnet release checklist remain the controlling gate.
