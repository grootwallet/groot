# Groot Core gateway

This service is the narrow replacement for exposing Bitcoin Core JSON-RPC to
remote Groot clients. TLS terminates at NGINX. The gateway listens only on
loopback, authenticates a revocable client principal, validates the complete
JSON-RPC batch and each method's parameters, reconstructs the request with a
server-owned id and Bitcoin Core cookie, and returns a bounded response.
NGINX limits connections and request rate per source; the process separately
limits request rate per source/principal and caps handler and Core concurrency.
Validated JSON-RPC batches are capped at 256 items; request and response byte
limits still apply to the complete batch.

It accepts only bounded raw public output scripts for Core's read-only
`scanblocks` and mempool-only `getdescriptoractivity` methods. It does not accept address or key descriptors, wallet
names, wallet RPC methods, notifications, arbitrary Core methods, redirects,
or URL-selected upstreams.
Request logging is disabled in both the service and supplied NGINX location.
The node operator can still correlate a client's IP and timing with requested
blocks or transaction identifiers, and sees transactions submitted for
broadcast. Groot must continue to describe the service as trusted.

## Provision and run

Create a dedicated unprivileged `groot-gateway` user, grant its group read-only
access to Bitcoin Core's cookie, install `gateway.py` under
`/opt/groot-core-gateway`, and install the systemd and NGINX files from
`deploy/`. The service refuses a non-loopback listener.

Provision a unique credential per client installation. This command prompts
without echo and stores only a salted scrypt verifier:

```sh
python3 /opt/groot-core-gateway/provision_client.py \
  --clients /etc/groot-core-gateway/clients.json \
  --username client-name
```

Run provisioning as root. The tool atomically writes mode `0640` and assigns
the `groot-gateway` group by default; use `--group` only if the systemd unit's
service group has a different name. The gateway rejects symlinks, non-regular
files, group-writable files, and any file accessible to other users.

Alternatively, `--generate` prints a one-time random password. Save it directly
in Groot, then clear the terminal. Do not put it in a URL, shell argument,
service unit, log, or support message. Restart or send SIGHUP after replacing
credentials; the service also reloads the verifier file when its timestamp or
size changes.

Keep Core RPC bound to `127.0.0.1`. Once the gateway is verified, remove the
NGINX route to port 8332. Core's own `rpcwhitelistdefault=1`, strong `rpcauth`,
and exact Groot method whitelist remain defense in depth during rollback. The
whitelist includes read-only `scanblocks`, `getdescriptoractivity`, and
`getblockfilter` only for the
`basic` filter type. Remote sync sends bounded `raw(script)` scan objects so
Core performs the indexed match server-side; the service operator can associate
those public scripts and matching activity with the authenticated principal.
`getdescriptoractivity` returns only matching mempool transaction identifiers,
which Groot retrieves and verifies individually instead of downloading the
public mempool. Private keys, labels, wallet names, and signing material remain
prohibited. The remote node must run Bitcoin Core 29 or newer.

Run the dependency-free tests directly with:

```sh
python3 -m unittest discover -s services/core-gateway/tests -v
```

They are also mandatory through `pnpm test:boundaries` and `pnpm validate`.
