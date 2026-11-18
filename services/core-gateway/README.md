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
`scanblocks` and mempool-only `getdescriptoractivity` methods. For the fixed
managed service it also accepts a versioned `groot_getscripthistory` request
containing at most 256 unique Electrum script hashes, which it resolves through
the private loopback Fulcrum service. It does not accept address or key descriptors, wallet
names, wallet RPC methods, notifications, arbitrary Core methods, redirects,
or URL-selected upstreams.
Request logging is disabled in both the service and supplied NGINX location.
The node operator can still correlate a client's IP and timing with requested
script hashes, blocks, or transaction identifiers, and sees transactions submitted for
broadcast. Groot must continue to describe the service as trusted.

## Provision and run

Create a dedicated unprivileged `groot-gateway` user, grant its group read-only
access to Bitcoin Core's cookie, install `gateway.py` under
`/opt/groot-core-gateway`, and install the systemd and NGINX files from
`deploy/`. `nginx-rate-limit.conf` belongs in NGINX's `http {}` include scope;
`nginx-site.conf` is the complete TLS virtual host, while
`nginx-location.conf` documents the reusable route fragments. The service
refuses a non-loopback listener.

Public enrollment returns the same version-1 username/password response to
native Groot. Future passwords are domain-separated HMAC-SHA256 values under
an owner-only server key; no per-enrollment principal record is written.
Existing version-1 salted-verifier files and credentials remain unchanged and
take precedence. A known legacy username with a wrong password never falls
through to signed authentication. Passwords remain inside Rust and its existing
wallet-credential-encrypted node envelope; no client DTO or wallet format changes.

The gateway service and provisioning tools require POSIX permissions and file
locks. The boundary harness already skips these service tests on Windows;
Windows wallet support is separate. See the candidate decision in
[ADR 0123](../../docs/adr/0123-stateless-managed-gateway-enrollment.md).

### Issuer state initialization and custody

Before enabling future enrollment, initialize its separate state as the actual
unprivileged service user, never root:

```sh
sudo -u groot-gateway -- python3 /opt/groot-core-gateway/provision_client.py \
  --clients /var/lib/groot-core-gateway/clients.json --initialize-enrollment
```

This explicitly creates `clients.json.issuer.json` beside the existing enrolled
credential file. Initialization refuses an existing issuer file; startup never
regenerates a missing or corrupt key. The state and empty `clients.json.issuer.lock`
are owner-only. Root-run revocation preserves the issuer UID/GID and recreates a
missing lock with that identity. Initialize as the service user even for a fresh
installation; the CLI refuses root initialization before creating any file.

Privately back up the complete issuer JSON before accepting new enrollments. It
contains the signing key, revocations and durable admission budgets. Preserve
its daemon UID/GID and mode `0600` on restore. The empty lock need not be backed
up. Do not restore an older revocation snapshot without first replaying every
later revocation: that would restore revoked authority. Existing v1 principal
files also remain part of the normal backup. No credential file is migrated,
cleared or recreated during this rollout.

Missing or invalid issuer state blocks future enrollment and signed credentials
with a bounded unavailable result; legacy KDF authentication remains independent.
Normally idle clients keep the same saved credentials indefinitely, including
after restart. Losing or rotating the signing key instead invalidates signed
credentials; restore the exact backed-up state or use Groot's existing explicit,
wallet-credential-authenticated managed-access renewal. Do not silently replace
saved native credentials. Key rotation is an incident/operations decision,
not automatic expiry or a rollback shortcut.

Admission keeps the existing per-IP limit and adds durable global burst 32 with
one token per minute, plus IPv4 `/24` and IPv6 `/48` prefix burst 8 with one token
per hour. IPv4-mapped IPv6 uses its IPv4 prefix. Prefix state is capped at 4,096
and idle entries are reclaimed after 16 hours without expiring credentials.
The per-IP enrollment bucket map is also bounded. Counters and prefix admission
are serialized across processes; restart does not reset the budgets.

### Explicit revocation and rollback

Use the existing `--remove` command below for signed credentials too. The tool
records a permanent tombstone before removing a colliding legacy record. Every
public-format name requires readable issuer state, including a legacy record:
if the key is temporarily missing or corrupt, revocation fails and leaves that
record intact. Restore issuer state before retrying; otherwise a later restore
could revive the old signed credential. When `--clients` names a separate manual
store, also pass `--issuer-clients /var/lib/groot-core-gateway/clients.json` to
select the actual issuer. Non-public legacy names do not depend on issuer state.
Signed revocations are never evicted. Explicit owner-provisioned KDF credentials remain
a separate authority: deliberately provisioning a new independent KDF password
for the same name is a new operator grant; it does not restore the old signed
password. A bad KDF password never enables a signed fallback.

The revocation ledger is capped at 10,000 entries. At capacity, new enrollment
fails closed and a new revocation returns an error without dropping old
revocations. Non-revoked credentials keep working. Do not clear the ledger to
restore enrollment; capacity/key-epoch maintenance requires a separate reviewed
operations plan.

Rolling back to the old gateway preserves existing v1 clients but rejects newly
signed credentials, since the old server has no verifier rows for them. Keep the
issuer state and updated revocation tool for a forward recovery. This candidate
is not deployed by changing these source files. Sustained distributed Sybils can
still consume admission or RPC capacity; existing RPC authentication, source and
principal throttles, method allowlists and concurrency limits remain in force.
The change closes permanent passive principal-store exhaustion, not all denial
of service or proof of genuine-app identity.

Operators can also provision or rotate a credential manually. This command prompts
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

Revoke either a manually provisioned or enrolled principal from its owning file
without handling its password:

```sh
python3 /opt/groot-core-gateway/provision_client.py \
  --clients /var/lib/groot-core-gateway/clients.json \
  --username groot-client-id \
  --remove
```

Keep Core RPC bound to `127.0.0.1`. Once the gateway is verified, remove the
NGINX route to port 8332. Core's own `rpcwhitelistdefault=1`, strong `rpcauth`,
and exact Groot method whitelist remain defense in depth during rollback. The
whitelist includes read-only `scanblocks`, `getdescriptoractivity`, narrowly
scoped `help` probes for those two methods, and `getblockfilter` only for the
`basic` filter type. Remote sync sends bounded `raw(script)` scan objects so
Core performs the indexed match server-side; the service operator can associate
those public scripts and matching activity with the authenticated principal.
`getdescriptoractivity` returns only matching mempool transaction identifiers,
which Groot retrieves and verifies individually instead of downloading the
public mempool. Private keys, labels, wallet names, and signing material remain
prohibited. The remote node must run Bitcoin Core 29 or newer. Ordinary
upstream RPC remains bounded to ten seconds; only the synchronous indexed
`scanblocks` call receives a 120-second upstream bound so a valid scan is not
orphaned by the gateway's ordinary health-check timeout. The supplied NGINX
location keeps its outer read timeout at 125 seconds, above that gateway bound.
The gateway also admits only one `scanblocks` request at a time because Core's
indexed scanner is process-wide; a concurrent request receives a bounded busy
response before Core is contacted.

The managed Mainnet deployment additionally runs the pinned private service in
`services/fulcrum/`. Its TCP and admin listeners stay on loopback. The gateway
pipelines one `server.version`, one tip subscription, and the bounded history
lookups over a single connection, validates every response id and exact schema,
caps the aggregate at 10,000 entries and 4 MiB, and returns only transaction ids
and heights. It exposes no raw Electrum subscription, peer, fee, transaction,
broadcast, or administration method. Groot independently checks the returned tip
against Core and each claimed transaction against its full Core block.

Run the dependency-free tests directly with:

```sh
python3 -m unittest discover -s services/core-gateway/tests -v
```

They are also mandatory through `pnpm test:boundaries` and `pnpm validate`.
