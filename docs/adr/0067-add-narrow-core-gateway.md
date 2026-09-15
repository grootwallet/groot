# ADR 0067: Add a narrow Groot Core gateway

- Status: accepted; internal-alpha gateway deployed; public production remains gated
- Date: 2026-09-15
- Extends: ADR 0009, ADR 0031, and ADR 0061

## Context

ADR 0061 admits direct authenticated HTTPS access to a user-controlled Bitcoin
Core node. That is appropriate for an owner-operated endpoint, but exposing
Core's JSON-RPC HTTP parser and credentials directly is not an acceptable
multi-client service architecture. A temporary internal-alpha bridge may put
NGINX in front of a loopback-only Core after enabling Core's deny-by-default
`rpcwhitelist`, strong `rpcauth`, POST-only handling, TLS, request bounds, and
rate limiting. It is a test bridge, not the hosted design.

Esplora would change confirmed-activity discovery to address/script queries and
therefore changes Groot's privacy and synchronization model. A narrower
gateway can preserve the existing client-side block and mempool scan, exact
genesis checks, wallet accounting, and direct transport bounds while removing
arbitrary public Core access.

## Decision

Add the repository-owned `services/core-gateway` service as the only supported
front door for a future Groot-operated shared Core backend:

- TLS terminates at a dedicated NGINX hostname. NGINX accepts POST only, caps
  bodies, rate limits by source, disables access logging, and proxies only to a
  loopback gateway listener.
- The gateway accepts the bounded JSON-RPC request shape already used by Groot,
  so no wallet, registry, node-settings, credential-envelope, proposal, or
  backup format changes are required.
- Each client installation receives a revocable principal with a unique strong
  password. The gateway persists only salted scrypt verifiers and rate limits
  both source addresses and authenticated principals. Shared application-wide
  credentials are not an admitted production configuration.
- The gateway validates the entire batch before doing any upstream work. It
  accepts at most 32 requests and only Groot's exact chain, block, mempool, fee,
  transaction lookup, index-health, and broadcast methods with method-specific
  parameter bounds. Notifications, wallet RPC, administration, mining,
  arbitrary methods, extra fields, and caller-selected upstreams fail closed.
- Valid requests are reconstructed with gateway-owned identifiers and a
  server-owned loopback Core cookie. Client credentials are never forwarded to
  Core, and the Core cookie is never returned. Core responses and errors are
  structurally checked, bounded, stripped of error data, and mapped back to the
  original request identifiers.
- The gateway and NGINX do not log request bodies, methods, transaction ids,
  block hashes, credentials, or Core responses. Operators still observe client
  IP/timing and can infer requested blocks or transactions from node behavior;
  Groot must continue to describe this as a trusted service.
- Core remains loopback-only with its own least-privilege whitelist as defense
  in depth. There is no automatic fallback to direct public Core or Esplora.

The service has no hosted wallet state or tenant-owned records beyond client
authentication verifiers and rate-limit state. It never receives descriptors,
addresses, labels, PSBTs, seeds, or signing material. Client principals provide
revocation and abuse isolation, not wallet data tenancy.

## Consequences and cutover gate

The existing `RemoteCore` client route is wire-compatible with the gateway,
which keeps rollback simple and avoids a persisted-data migration. A user-owned
direct Core endpoint remains permitted by ADR 0061; a Groot-operated multi-client
hostname must use the gateway.

The internal-alpha hostname was cut over to the gateway on 2026-09-15. The
direct NGINX-to-Core route was removed after external checks confirmed exact
Mainnet genesis, current height, archival history, required indexes, fee and
mempool responses, authentication isolation, method denial, malformed and
oversized-batch rejection, explicit overload responses, and recovery after a
request burst. NGINX, the gateway, and Core remain separate services with only
NGINX publicly listening on the RPC hostname.

Public production still requires a separately provisioned principal per client,
successful live Groot full-rescan/restart/broadcast checks, timeout and
oversized-Core-response tests, operator review of NGINX/systemd/Core bindings,
and an independent security review. Public distribution remains governed by
ADR 0012.

Esplora remains unwired. Enabling it would require its own ADR and address-query
privacy, consistency, reorg, malicious-response, availability, and no-fallback
test campaign.
