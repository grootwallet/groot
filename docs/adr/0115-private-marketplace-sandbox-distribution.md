# ADR 0115: private marketplace sandbox distribution

Status: accepted for simulated-money deployment testing only.

Date: 2026-11-07.

## Context

The owner requested continued implementation until the marketplace can be tested in a production setting, with minimal manual regression. ADR 0114's service is durable, but its frontend can run only under a development server. A development server is unsuitable for remote acceptance. A production asset build, TLS, private access and recovery tooling are needed to exercise deployment safely.

## Decision

Package a separately named, explicitly enabled `marketplace-sandbox` static SvelteKit build and the independent service. The build gate requires the exact mode, build command, dedicated opt-in and absence of a native platform. Normal wallet builds, preview flags and discovery remain disabled. This partially supersedes ADR 0114's development-only frontend restriction, without enabling funded trading or changing the wallet application release.

Distribute only built assets, selected service runtime/operations files and reviewed operations templates, with a complete checksum inventory. Record both source inventories, Git identities and whether either checkout is dirty. A checksum is integrity evidence; it is not a signature or a clean release claim. The current wallet checkout contains unrelated unfinished work and cannot become a wallet release artifact through this command.

Use immutable official Node and Caddy container digests. Node supplies the existing pinned runtime; Caddy supplies TLS, private access, bounded HTTP and static serving. No application runtime package or lockfile changes. Review these additional deployment images and their upstream provenance separately from the existing JavaScript dependency graph; update digests deliberately, never from moving tags during deployment. No image is published by this workflow.

The edge requires a supplied certificate and bcrypt access hash, connects to an unpublished service on a dedicated internal container network and strips proxy/authentication headers. Only the TLS edge is published. The API has exactly one internal network with no outbound routing; the edge also has an ingress network so Docker can publish its TLS port. Both long-running containers run without root, capabilities or writable source. A one-shot networkless initializer sets ownership of the dedicated state volume. The private entry password is separate from each disposable marketplace account. Certificates, hashes, account data and backups remain outside the package.

The exact image indexes were checked against the official registries and pinned source recipes: [Node recipe at fd1bf45](https://github.com/nodejs/docker-node/blob/fd1bf45c51970427bc899084b5381f6827722246/24/bookworm-slim/Dockerfile) and [Caddy recipe at fba2853](https://github.com/caddyserver/caddy-docker/blob/fba2853501d36e8a72f946ac8cb7ff64d07e48f2/2.11/alpine/Dockerfile). A networkless local Caddy derivative removes the upstream binary's low-port capability before running with an empty capability set on port 8443. This is registry/source provenance evidence, not independent signature verification or a vulnerability-free image claim. Sandbox builds discard inherited public environment variables, disable Vite environment-file loading and fix browser network configuration to Regtest.

Verify the actual production assets through TLS with Secure cookies, private-access enforcement, both browser engines/layouts, restart persistence, and operational backup/restore. Local self-signed test certificates and browser trust overrides are confined to the automation. A remote target needs valid TLS, correct DNS, private access, an assigned operator and tested backup storage before invitations.

## Compatibility and limits

No wallet/profile/backup/proposal/registry or service database schema change. Restoring a service backup requires fresh login so old session cookies cannot regain authority. No BIP impact: no key, derivation, transaction, escrow script, signing, recovery secret or wallet network operation changes. Provider rights, legal approval, executable liquidity, native protocol review, support ownership and funded-pilot authorization remain independent gates. This package cannot execute real trades.
