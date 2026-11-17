# ADR 0114: durable marketplace sandbox service

The frontend's development-only deployment restriction is partially superseded by [ADR 0115](0115-private-marketplace-sandbox-distribution.md), which permits only a separately built private simulated-money test site. Live/provider/native/escrow gates below remain in force.

Status: accepted for sandbox implementation; live funds and production wallet integration remain gated.

Date: 2026-11-07.

Partially supersedes ADR 0111's construction deferral for accounts and persistence only. Its live-provider, legal, escrow, native review and Mainnet gates remain intact. ADRs 0112–0113 still govern optional public research; public listings cannot become executable sandbox quotes.

## Decision

Implement independent accounts, sessions, offers, exact quotes, trades, messages, event history, disputes and simulated arbitration in the private [grootwallet/groot-marketplace](https://github.com/grootwallet/groot-marketplace) service repository. Use pinned Node 24.19.0 built-in SQLite/crypto and no third-party runtime packages. Keep SvelteKit presentation in Groot, composed from existing components. A dedicated opt-in loopback development launcher is the only connection path in this change. Native/production/preview builds cannot activate the proxy or trading screen.

The service is immutable sandbox mode. It accepts no wallet secrets, addresses, bank details or real funds and performs no provider/network request. Explicit simulator controls establish application state only. A buyer claim cannot authorize receipt; a human seller must freshly acknowledge it. Arbitration and final confirmation are separate simulated actions. Real provider/native signing/recovery contracts must be implemented and reviewed before any funded execution; an environment switch cannot enable them.

Use an independent marketplace password, async bounded scrypt, hashed cookie tokens and session-bound CSRF. Enforce role, actor ownership, expected revision, single active human obligation, quote consumption and canonical idempotency in one SQLite IMMEDIATE transaction with append-only evidence. Retrying one key returns its original committed response across restart. Money is integer cents/satoshis with BigInt intermediate arithmetic. EUR/SEPA Instant 50–250 is the sole corridor; no rate-feed/premium controls enter the taker UI.

## Data compatibility

This introduces a **new isolated marketplace database v1**, owned by the separate service, with no existing customer data to migrate. No wallet, profile, backup, proposal or registry format changes. Existing unknown service schemas and foreign databases are rejected without migration, deletion or recovery writes; tests cover foreign hot journals. Do not repurpose a wallet file for the service. Future incompatible changes require a separate explicit migration-versus-discard decision before implementation. Data and WAL/SHM files remain private and excluded from Git. Account recovery is not implemented; use disposable credentials for sandbox review.

## Evidence and consequences

Backend HTTP/SQLite tests cover adversarial actor/state matrices, exact arithmetic, revocation, concurrent writers, SIGKILL recovery and incompatible-file preservation. Repeated real browser integration covers both roles, receipt freshness, persistence and recovery. Reports identify frozen source and preserve failed runs. These tests supplement wallet `pnpm validate`; they certify neither real escrow nor hosted infrastructure. Deployment templates are reviewable sandbox templates, not an executed deployment. Legal classification, provider permission, liquidity and native/device proof remain release prerequisites.

BIP impact: **none**. No transaction construction, derivation, Bitcoin protocol dependency, key material, wallet allowlist or Mainnet authority changes.
