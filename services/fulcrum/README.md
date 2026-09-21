# Groot managed Fulcrum

Groot's managed Mainnet service uses Fulcrum as a private script-history index
beside the existing fully validating Bitcoin Core node. Fulcrum is not exposed
to the internet. The authenticated Groot Core gateway is the only process that
may query its loopback TCP listener.

## Pinned release

- Fulcrum `2.1.2`
- Linux x86-64 archive SHA-256:
  `be0ff249fd78b8d5e6f7db3a19931def3009d53e3459ebc53136057d46f58bb8`
- Signed checksum key fingerprint:
  `D465135F97D0047E18E99DC321810A542031C02C`

The archive checksum must be verified against the signed upstream checksum
manifest before installation. Do not replace the binary opportunistically.

## Runtime layout

- binary: `/opt/groot-fulcrum/Fulcrum`
- config: `/etc/groot-fulcrum/fulcrum.conf`
- database: `/var/lib/bitcoin/fulcrum`
- Electrum TCP: `127.0.0.1:50001`
- admin RPC: `127.0.0.1:8000`

The `fulcrum` service account is a member of the `bitcoin` group so it can read
Core's block files. Give it a separate random `rpcauth` principal restricted to
the documented Fulcrum method set, replace the non-secret placeholder in the
deployed configuration, and keep that runtime file owner-only. Never commit or
print the password. The data directory remains owned by `fulcrum`. Peer
discovery, announcement, UPnP, TLS, WebSocket, and public stats listeners are
disabled because this is an application-private index.

The first Mainnet index build is intentionally kept outside the live gateway
route. Only enable Groot history requests after Fulcrum reports the same chain
tip as Bitcoin Core and the bounded gateway integration tests pass.
