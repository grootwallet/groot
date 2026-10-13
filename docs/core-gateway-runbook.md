# Narrow Core gateway runbook

This runbook applies to a Groot-operated shared backend. An owner who runs a
private remote Core can continue to use ADR 0061's direct authenticated HTTPS
route. Do not represent the temporary direct NGINX-to-Core bridge as the shared
production architecture.

## Required topology

```text
Groot client -- HTTPS/Basic --> NGINX :443
                                  |
                                  +-- HTTP loopback --> gateway :8432
                                                          |
                                                          +-- cookie RPC loopback --> Core :8332
                                                          +-- Electrum TCP loopback --> Fulcrum :50001
```

- Public: NGINX ports 80/443 only. Port 80 redirects to 443.
- Private: gateway `127.0.0.1:8432`, Core `127.0.0.1:8332`, and Fulcrum
  `127.0.0.1:50001` only.
- Bitcoin P2P 8333 is independent of RPC and may remain public.
- Firewall rules must not restrict 443 to one wallet user's changing IP. Abuse
  control belongs at TLS, per-principal authentication, rate limits, and the
  gateway allowlist.

## Install and provision

1. Create an unprivileged `groot-gateway` service account and a group that has
   read-only access to the active Core cookie. Confirm the service account
   cannot modify Core configuration, data, or the credential verifier file.
   Configure Core's cookie for group-read access and keep the gateway in that
   supplementary group; do not make the cookie world-readable.
2. Install `services/core-gateway/gateway.py` and `provision_client.py` in
   `/opt/groot-core-gateway`, owned by root and not writable by the service.
   Keep `clients.json` owned by `root:groot-gateway` at mode `0640`; the
   provisioning tool applies those access bits atomically.
3. Install the supplied systemd unit after adapting only the Core cookie path
   and group to the host. Confirm `systemd-analyze security` and the effective
   unit before enabling it.
4. Provision a unique client principal with the interactive command in the
   service README. Enter the resulting username and password in Groot; never
   put either secret in a URL or support log.
5. Install the NGINX `limit_req_zone` in the global `http {}` scope and the
   supplied exact `/` location in the dedicated TLS server. Keep redirects
   disabled upstream and access logging off for this location. Preserve the
   supplied 125-second `proxy_read_timeout`: it must remain above the gateway's
   120-second indexed-scan bound or NGINX can abandon a scan that Core continues
   running.
6. Keep Core's `rpcbind=127.0.0.1`, `rpcallowip=127.0.0.1`,
   `rpcwhitelistdefault=1`, and a method whitelist matching ADR 0067. A cookie
   is the gateway's preferred upstream authentication; a strong `rpcauth`
   identity remains an operator recovery path, not a client credential.
   Enable `blockfilterindex=1`, wait until the basic index is fully synced, and
   include read-only `scanblocks`, `getdescriptoractivity`, and `help` in the
   gateway's Core whitelist. `help` is accepted by the gateway only for those
   two indexed-sync method names so clients can fail capability checks before
   a wallet scan. The remote node must run Bitcoin Core 29 or newer.
7. For the fixed managed endpoint only, install the pinned Fulcrum release and
   configuration in `services/fulcrum/`. Verify its signed checksum, run it as
   the unprivileged `fulcrum` account, and give only that account a dedicated
   least-privilege Core RPC principal plus read-only block access. Wait for its
   indexed height to equal Core before enabling `groot_getscripthistory`. Do not
   publish TCP 50001, admin 8000, TLS, WebSocket, peer, or stats listeners.

## Pre-cutover verification

Run the repository boundary tests first:

```sh
pnpm test:boundaries
```

Then verify on the host and from a separate network:

1. `ss -lntp` shows Core and the gateway on loopback only, and NGINX on 443.
2. GET, HEAD, PUT, missing authentication, wrong authentication, malformed JSON,
   a batch over 32, and `stop` all fail without a Core request.
3. A valid `getblockchaininfo` succeeds and reports the expected chain and tip.
   A valid one-item JSON-RPC batch remains an array in both the upstream request
   and client response; it must not be collapsed into a single request object.
4. A single-source burst above the NGINX limits returns 429 and the service
   remains responsive. Cross-source handler saturation returns a bounded 503
   `gateway_busy` response, never an upstream-looking 502.
   A second concurrent `scanblocks` request also returns that bounded busy
   response without reaching Core.
5. A bounded history request succeeds only when Fulcrum is at the independently
   observed Core tip. Malformed, duplicate, excessive, and unavailable-history
   responses fail closed. For each returned history entry, verify that Groot
   retrieves the claimed active-chain block from Core and finds the exact txid.
6. Groot connects, verifies exact Mainnet genesis, loads the last committed
   state, completes a birthday-bounded rescan including mempool reconciliation,
   estimates fees, relaunches, and reconnects.
7. A disposable signed transaction is broadcast only after all read-only checks
   pass. Confirm the expected txid independently.
8. Review NGINX, gateway, Fulcrum, systemd, and Core logs: no credentials, request bodies,
   transaction ids, block hashes, descriptors, or addresses may appear.

After the live and independent review gates pass, replace the direct proxy to
8332 with the gateway route. Do not leave both public routes enabled and do not
add an automatic client fallback.

## Failure and rollback

On a gateway or Fulcrum failure, keep Core and wallet data untouched and disable
the managed history route. For a shared service, rollback means an outage until
the reviewed service is restored; it never means exposing Core or Fulcrum
directly or silently starting a long alternate scan. User-owned direct Core
endpoints remain separate ADR 0061 configurations.
