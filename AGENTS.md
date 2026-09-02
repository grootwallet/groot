# Groot agent guide

This file is the entry point for humans and coding agents. Read it before changing the repository.

## Mission

Groot is a deliberately small, non-custodial, onchain Bitcoin wallet for desktop, iOS, and Android. Product simplicity must not weaken key isolation, transaction review, address privacy, or recoverability.

## Repository boundary

- [`thibistaken/groot`](https://github.com/thibistaken/groot) is the wallet application: the Tauri desktop/mobile application and its browser-based wallet prototype.
- [`thibistaken/groot-site`](https://github.com/thibistaken/groot-site) is the only marketing website and the canonical source for public-site code, copy, screenshots, brand presentation, SEO, and deployment.
- Do not add marketing routes, marketing-site assets, public-site metadata, or marketing deployment configuration to this repository. Product facts originate here; public presentation belongs in `groot-site`.

## Start here

1. Read `docs/product-spec.md` for canonical behavior.
2. Read `docs/architecture.md` for boundaries and data flow.
3. Read `docs/implementation-status.md` before assuming a prototype surface is wired to Rust.
4. Read `docs/bip-support.md` before changing wallet standards, interoperability,
   descriptors, transactions, payment requests, recovery, sync, networks, signers,
   or protocol dependencies.
5. For UI work, read `docs/design-system.md` and `docs/flows.md`.
6. Read relevant records in `docs/adr/` before changing a settled decision.
7. Read `docs/engineering-standards.md`, including its supply-chain rules.
8. Read `docs/agent-harness.md` for the exact test, formatting, CI, GitHub,
   process-ownership, and hardware-certification workflow.
9. Run `pnpm validate` before handing off a change.

If code and documentation disagree, stop and resolve the mismatch in the same change. Do not silently choose one.

## Repository map

- `src/routes/` — presentation and route-level orchestration only.
- `src/lib/components/` — reusable, shadcn-svelte-style UI primitives.
- `src/lib/wallet/contracts.ts` — frontend wallet API and stable error/event types.
- `src/lib/wallet/policy.ts` — pure product/security invariants.
- `src/lib/wallet/dummy.ts` — deterministic UI adapter; never import it directly from routes.
- `src/lib/wallet/index.ts` — composition root. Swap the adapter here.
- `src-tauri/` — trusted Rust boundary; BDK, secrets, signing, persistence, sync, and broadcast belong here.
- `docs/adr/` — append-only architectural decisions.
- The marketing website is intentionally absent. Change it in `thibistaken/groot-site`, not under `src/routes/` or `static/` here.

## Non-negotiable invariants

- Mnemonic, seed, descriptors containing private keys, and decrypted signing material never cross into the webview.
- The generated mnemonic is 24 BIP39 words.
- The user credential is both the BIP39 passphrase and app unlock/signing PIN. Wrong entry must return `invalid_credential`; it must never appear to open a different wallet.
- The credential is not logged, persisted in plaintext, included in analytics, or retained by UI state after use.
- Every revealed receive address gets a non-empty permanent label in the same atomic operation.
- Permanent assignments and history cannot be edited or erased. Normalized label text may be
  reused intentionally to group related activity.
- Only an unused address currently awaiting payment can be discarded. Discard means retire from presentation, never stop monitoring.
- Transaction review data must be derived from the actual unsigned transaction/PSBT, not recomputed only in the UI.
- Amounts are integer satoshis; fee rates are positive sat/vB. Never use floating-point BTC for wallet accounting.
- Wallet state and notification markers persist atomically.
- Mainnet must not be enabled without a dedicated ADR, threat-model review, and end-to-end release checklist.

## Architecture rules

- New wallet operations depend on `WalletPort`, not Tauri APIs or dummy fixtures. Functional Tauri routes read through `walletService`; `src/lib/data.ts` is limited to formatting helpers and browser-prototype fixtures.
- Rust commands return serializable DTOs and stable error codes; do not expose BDK types to Svelte.
- Keep network endpoints configurable. Signet is the integration default, regtest is for deterministic automation, and Testnet4 is the public rehearsal network.
- Prefer pure functions for policy. Add or update a unit test when changing a rule.
- New feature UI must compose the repository's existing reusable components. Before creating a new reusable component, verify that no existing component can satisfy the requirement, explain the verified gap to the user, and obtain the user's explicit approval. Do not create the component before that approval.
- Keep components small and accessible. Important actions need an inline result and a toast; a toast alone is not durable state.
- Avoid speculative abstractions. Add one boundary when it protects secrets, platform differences, or a stable domain contract.

## Safe workflow

1. State the invariant or acceptance criterion being changed.
2. Before changing a persisted wallet, profile, backup, proposal, or registry format, identify whether existing data remains compatible. Any breaking format change requires an ADR, a clear migration-versus-discard plan, and the user's explicit approval before implementation. Never silently add a migration or strand existing profiles.
3. Make the smallest coherent change.
4. Add/update tests and canonical docs.
   Assess BIP impact and update `docs/bip-support.md` in the same change whenever
   support or evidence changes; record an explicit no-impact assessment otherwise.
5. Run `pnpm validate`.
6. For UI changes, inspect desktop (1180×780) and mobile (390×844), including keyboard-safe bottom spacing.
7. For Rust wallet changes, also run `cargo fmt --check`, `cargo clippy --locked --all-targets --all-features -- -D warnings`, and `cargo test --locked --all-features` from `src-tauri`.
8. Use the proportionate extended and CI harness in `docs/agent-harness.md`; `pnpm validate` is mandatory but does not include every CI job.

## Definition of done

- Product behavior matches `docs/product-spec.md`.
- No secret crosses the Rust/webview boundary.
- Error, loading, empty, offline, and retry states are handled.
- Desktop and mobile layouts are verified.
- Relevant tests pass; `pnpm validate` is green.
- New decisions are recorded as ADRs and superseded decisions are marked, not erased.
- User-facing copy says “bitcoin” for the asset and “Bitcoin” for the network/protocol.

## Avoid

- Do not add wallet logic to Svelte stores or route files.
- Do not call mempool.space directly from UI components.
- Do not invent a fallback fee silently when the API fails; surface staleness and allow a validated custom rate.
- Do not delete address/transaction history to create a privacy illusion.
- Do not log command payloads that may contain credentials, mnemonics, PSBTs, or addresses.
- Do not update dependencies opportunistically in an unrelated feature change.
