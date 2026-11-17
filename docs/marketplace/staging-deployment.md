# Private marketplace deployment testing

This distribution runs **simulated money only**. It is a separate browser test site built with SvelteKit production assets, alongside the real durable sandbox service. It is not a Groot wallet release or a funded marketplace. Never enter wallet credentials, recovery words, real bank details or personal payment evidence.

## Build and verify

Use Node 24.19.0, the repository's locked dependencies and the separate backend checkout. Run `pnpm package:marketplace-sandbox`. The result under `outputs/marketplace-backend/package-*/` includes `sandbox.tar.gz`, its SHA-256, both complete source inventories and `bundle/manifest.json`. A failed package has a `FAILED` marker and must not be deployed. Extract into a fresh directory and run:

```sh
node bundle/operations/verify-bundle.mjs
```

Compare the archive and manifest digests with the trusted build report before transfer. The inventory detects extra, missing, changed and symbolic-link files. It does not authenticate its own manifest. Source dirtiness is recorded honestly; the current wallet's unrelated changes still need their own clean-release review.

## Configure the target

Use a dedicated Linux Docker host with the Compose plugin. Both application containers run as UID/GID 1000, with read-only source and private state; install external TLS files readable by that UID. Supply a valid hostname certificate as `cert.pem` and private key as `key.pem` in an external directory. Keep the key mode 0600 or 0400. Before checking or starting a deployment, the controller checks PEM parsing, the certificate/private-key match, the configured DNS or IP subject alternative name and current validity. This local check does not establish certificate-chain trust or container file readability; verify those through the deployed HTTPS endpoint. Do not use the automation's self-signed certificate on the remote host.

Create a strong separate invitation password with Caddy's `hash-password` command using stdin, rather than an argument or committed file. Share it privately with invited testers. Set these environment variables through the host's secret manager or a private untracked environment file:

| Variable                    | Purpose                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `GROOT_SANDBOX_ORIGIN`      | Exact public HTTPS origin, no trailing slash, path or credentials.                       |
| `GROOT_SANDBOX_TLS_DIR`     | Absolute external directory containing the TLS files.                                    |
| `GROOT_SANDBOX_ACCESS_HASH` | bcrypt hash, cost 10–16. Access username is `tester`.                                    |
| `GROOT_SANDBOX_BIND`        | Defaults to `127.0.0.1`; choose `0.0.0.0` only on the intended host with firewall rules. |
| `GROOT_SANDBOX_PORT`        | Defaults to 5298; use the port mapped by the firewall/load balancer.                     |
| `GROOT_SANDBOX_PROJECT`     | Dedicated stable Compose project name; keep it to reuse the state volume.                |

Do not print expanded Compose configuration because it contains the access hash. Configure edge/IP abuse limits, disk-space alerts, host patching, encrypted backup storage and access rotation before invitations. Application quotas are not a host storage quota. Changing the origin or certificate requires restarting the edge and backend together; switching a deployment name selects a different state volume.

```sh
node bundle/operations/control.mjs check
node bundle/operations/control.mjs up
node bundle/operations/control.mjs status
```

Open `/marketplace/backend`, enter the separate invitation credentials, then create a disposable marketplace account. A basic-auth challenge protects every HTTP route, including health checks and assets. TLS, a restrictive same-origin CSP, anti-framing/no-index headers, no payload/access logs and request deadlines apply. The service listens inside its own container on the dedicated internal network, with no published API port or outbound route. The TLS edge alone also joins an ingress network, which Docker needs to publish its port. The service cannot contact a provider; the edge has only fixed local proxy/static routes and automatic certificate acquisition is disabled. Only the HTTPS port is published. The UI serves the test routes and required assets; wallet and discovery routes are not hosted.

The edge is built locally from the pinned official Caddy image with its unnecessary low-port file capability removed. It listens on 8443 with all container capabilities dropped. The build runs without network access; install and review the pinned base images first. A successful `up` reports that containers were launched. Confirm valid HTTPS and the invitation challenge before sharing the URL; it is not a readiness or certificate-trust claim.

`node bundle/operations/control.mjs down` stops only this named deployment and retains its state volume. Neither this command nor the packaging command deletes a database. Keep the exact old package for rollback. Never start a different service format against the state volume without its compatibility review. Back up before upgrades and rehearse restore into a fresh volume. Follow the bundled backend backup/restore and staging tool documentation in the source repository; the tooling ships in `backend/scripts/`.

`down` and `status` need only the deployment name (`GROOT_SANDBOX_PROJECT`, with the usual default) and the selected Docker environment. They validate the scope and project labels on every matching container, network and state volume, then use the observed immutable container/network IDs directly. They do not read the bundle inventory, Compose file, access secret or TLS material: damaged assets, lost secrets and expired certificates cannot block incident shutdown. A foreign resource aborts the operation before any stop or removal. State volumes remain intact. Keep a trusted copy of the operations scripts available for incidents; status output contains only container IDs, names and states.

Access logs and HTTP error logs are discarded. Caddy's default HTTP error logger otherwise records URLs and custom headers, including the marketplace CSRF header, during proxy failures. Other runtime logs remain available for container and configuration diagnosis; do not enable request logging while investigating a tester's account.

## Acceptance and remaining gates

The automated deployment verifier exercises the packaged UI through the actual TLS proxy, Secure cookies and private access, plus both browser engines at desktop/mobile sizes and recovery after a service restart. It retains reports and screenshots. Self-signed local trust is test-only; no global TLS verification is disabled.

The owner's remaining UX review is one buy, one seller receipt confirmation and one saved-trade resume. Check understanding and feel, not repeated failure injection. Hosting access, real DNS/certificates, named operations/support owners and backup destination are needed for remote sandbox testing. Funded testing separately requires an approved provider/operating scope and independently verified native escrow/recovery; this package does not satisfy those gates.

Container sources: [official Node image](https://github.com/nodejs/docker-node), [official Caddy image](https://github.com/caddyserver/caddy-docker). The exact image index digests are in `compose.yaml`; no runtime image update or pull by moving tag is part of the application.

The backend's separate full-checkout staging preflight targets direct host deployments and requires a loopback bind. This container package instead binds inside an unpublished internal-only namespace; its verifier checks actual Docker network membership, port publication and outbound denial. Do not use that container bind on an exposed host. Docker 29 does not publish ports for internal-only containers, so attaching the TLS edge to both ingress and internal networks is deliberate.
