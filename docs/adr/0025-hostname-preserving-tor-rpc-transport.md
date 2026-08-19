# ADR 0025: Hostname-preserving Tor RPC transport

- Status: Accepted for test networks; supersedes the Tor transport portion of ADR 0016; mainnet remains blocked
- Date: 2026-08-11

## Context

ADR 0016 enabled `jsonrpc`'s legacy SOCKS transport for explicit onion RPC. A pre-mainnet audit found that transport parsed the destination through `ToSocketAddrs` before opening SOCKS. An onion hostname could therefore be sent to the host resolver, fail before reaching Tor, or violate Groot's no-direct-DNS claim. Policy validation alone could not repair behavior inside that transport.

## Decision

Groot removes the `jsonrpc/proxy` feature and uses a narrow local SOCKS5 transport for HTTP v3 onion Bitcoin Core RPC. It accepts only a numeric loopback proxy and a 56-character lowercase base32 v3 onion hostname. The hostname is encoded directly in the SOCKS5 domain-address request and is never passed to `ToSocketAddrs`. Proxy connection, handshake, writes, and reads are bounded by the production RPC timeout. HTTP headers are bounded to 64 KiB, JSON-RPC request and response bodies to 16 MiB, transfer-encoded or ambiguous responses fail closed, and a new connection is used per call. Credentials are sent only inside the SOCKS tunnel and are not included in transport diagnostics. Proxy failure or rejection never falls back to a direct connection.

Direct HTTPS remains on the platform-native certificate verifier recorded by ADR 0020 and uses the same explicit 15-second RPC timeout. Groot wraps that direct transport narrowly to disable HTTP redirects before credentials can cross origins and to enforce the same 64 KiB header and 16 MiB JSON-RPC bounds. Plain HTTP is restricted again inside the transport to numeric loopback addresses or `localhost`; it uses a directly bounded TCP stream with no redirect handling, DNS route substitution, or helper thread per request. This matters during an initial Core history scan, which can make hundreds of thousands of sequential RPC calls: the native-TLS client's timeout implementation creates a temporary operating-system thread for every request even when TLS is not used, eventually starving the desktop process and making independent connection checks appear intermittently offline. The direct stream sends the complete bounded request without first half-closing the client write side; a client FIN before the response causes Core to treat the request as aborted. It reads the bounded header and exactly the declared `Content-Length` body, returning without waiting for Core to close an otherwise complete connection. HTTPS continues to use the native verifier, while local HTTP avoids that per-call thread. This change adds no new dependency; it removes the legacy proxy feature and its transitive SOCKS implementation.

## Consequences

- Deterministic loopback tests inspect the SOCKS request and prove the exact onion hostname reaches the proxy, plus rejection, timeout, malformed HTTP, bounded response, and no-fallback behavior.
- A local failure matrix proves explicit wrong-authentication, direct-transport timeout, TLS-handshake, and wrong-chain errors. A repeated-request stress test exercises the bounded loopback path, a response-framing regression proves a complete declared body returns while the server deliberately keeps the socket open, plaintext non-loopback endpoints fail closed inside the transport, and an opt-in ignored test exercises the exact socket client against an explicitly supplied disposable local Core cookie. Real certificate hostname/expiry/revocation behavior and network-level DNS observation still require the release endpoint rehearsal.
- HTTP over onion remains acceptable because Tor authenticates the onion service and protects the tunnel. Clearnet remote Core remains HTTPS-only.
- Mainnet remains disabled under ADR 0012 and the release checklist.
