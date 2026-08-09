# ADR 0020: Remove the vulnerable legacy Rustls backend

- Status: Accepted
- Date: 2026-08-09
- Supersedes: the TLS-backend portions of ADR 0015 and ADR 0016

## Context

Satchel pins `minreq` 2.14.1 because `jsonrpc` 0.18 and `bitcoincore-rpc` 0.19 use that transport for direct Bitcoin Core RPC. Its `https-rustls` feature fixes the transport to Rustls 0.21 and `rustls-webpki` 0.101.7. RustSec now reports that WebPKI release as vulnerable to incorrectly accepted URI name constraints (RUSTSEC-2026-0098), incorrectly accepted wildcard name constraints (RUSTSEC-2026-0099), and a reachable panic while parsing certificate revocation lists (RUSTSEC-2026-0104). The patched WebPKI releases are not semver-compatible with this legacy Minreq feature.

Ignoring these advisories would leave a wallet network trust boundary on a known-vulnerable certificate verifier. Upgrading the complete Bitcoin Core RPC stack is a broader interoperability migration and must not be rushed into a CI repair.

## Decision

Keep the exact Minreq 2.14.1 HTTP transport but enable its `https-native` feature instead of `https-rustls`. Direct remote Core endpoints still require HTTPS, certificate and hostname verification remains mandatory, and TLS failures remain fail-closed. The vulnerable Rustls 0.21 and `rustls-webpki` 0.101.7 dependency branch must be absent from the lockfile.

The native backend delegates certificate validation and trust anchors to the platform TLS implementation. This is a temporary compatibility boundary until Satchel can migrate the Bitcoin Core RPC stack to a transport backed by a maintained Rustls/WebPKI release. That migration requires its own dependency review and remote-node certification evidence.

## Consequences

- RustSec can fail CI on future verifier vulnerabilities rather than carrying an exception for wallet network code.
- Desktop and mobile builds use their platform TLS implementation and trust store; behavior can differ across operating systems and must be covered by the existing remote TLS release checklist.
- Mainnet remains disabled. Certificate rejection, hostname mismatch, timeout, and chain-identity tests against real remote Core endpoints remain release gates.
- Historical security reviews that describe the former Rustls backend remain historical evidence; this ADR records why that backend was replaced.
