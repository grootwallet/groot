# Testing

[The maintainer harness](agent-harness.md) owns commands, runtime pins and release procedures. This page owns what each layer must prove.

| Layer               | Purpose                                                                                      | Location                                                              |
| ------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Frontend units      | Pure policy, formatting, state transitions and stable error handling                         | `src/lib/**/*.test.ts`                                                |
| Rust units          | Descriptor/key/credential validation, transaction invariants, bounds and deterministic state | `src-tauri/src/`                                                      |
| Native integration  | Atomic persistence, restart/corruption, isolation, PSBTs, sync and broadcast                 | `src-tauri/tests/`, native wallet tests                               |
| Real Core Regtest   | Funded transactions, replacement/reorg, multisig and recovery against Bitcoin Core           | `scripts/regtest/`                                                    |
| Browser acceptance  | User flow, keyboard/accessibility, failure/retry and responsive layouts                      | `e2e/`                                                                |
| Physical acceptance | Exact model/firmware, trusted display, USB/camera, native secret UI and platform lifecycle   | [Hardware certification](hardware-certification.md)                   |
| Release checks      | Clean source, provenance, SBOM, signatures, packaging and exact authorization                | `scripts/release/`, [Mainnet checklist](mainnet-release-checklist.md) |

## Required cases

- Create/recover/unlock/lock/delete: wrong credentials, backup requirements, interruption and other-wallet preservation.
- Receive: atomic permanent labels, unused-only discard, recovery gap, exact device identity and address proof.
- Send/acceleration: PSBT-derived review, canonical inputs, validated signatures, freeze/eligibility, confirmation races and resumable proposals. Compile Mainnet policy (`GROOT_BUILD_NETWORK=multi`) and verify payments around/above the former 1,000,000-sat boundary, final fee protection, Bitcoin supply bounds, invalid fee-child rejection and specific EN/FR/ES errors (ADR 0099).
- Sync: exact network/genesis, consent, bounded failures, no silent fallback, atomic results, cancellation, reorg and restart.
- UI: durable results plus toast, loading/empty/offline states, 1180×780 and 390×844, both themes, translated copy and keyboard-safe spacing.

Harness fixtures additionally test aggregate failures, missing/skipped results, mixed source-approval failures, coverage ordering, scenario inventory and owned cleanup. CI optimizations preserve assertions and thresholds; command stubs are supplemented by actual tool and integration runs.

Coverage gates protect deterministic policy and native module classification. A percentage is not a substitute for named adversarial assertions. Browser fixtures and virtual signers never establish physical or public-network readiness.

## Keep the suite maintainable

Use the lowest layer that proves the invariant. Share fixture builders, not mutable global test state. Add one named regression for a reproduced defect; expand only when an uncovered contract needs it. Keep test data disposable and isolated from certification profiles.

Delete obsolete tests with their unreachable implementation. Deduplicate only after proving equivalent coverage. Source-boundary tests remain where they protect secrets, reviewed dependencies or release controls; do not replace them with mocks that cannot observe the boundary.

Keep screenshots, SBOMs, coverage output and performance measurements as untracked artifacts. Record physical evidence against exact commit/model/firmware. Candidate-specific [test guides](testing/) are instructions for that candidate, not evergreen specifications.

## Mobile and Continuity

Internal iOS Testnet4 tests cover native capability guards, pairing, complete-prevout PSBT review, bounded QR responses, stale results and key-access ordering. The isolated archive proves compilation and linked-network identity only. Physical camera, background/lock, backup/recovery and returned-signature exchange follow [the human checklist](testing/post-5.3-phone-miniscript-human.md).

Real-Core scenarios cover funded phone-sign/desktop-merge/broadcast and fixed Continuity roles, maturity, reorg, restoration and renewal. They do not certify a signer model or transport. Phone enrollment stays Standard-only; delayed policies keep USB signing blocked.

The [maintenance record](testing/maintenance-2026-11-07.md) and [CI acceptance record](testing/ci-efficiency-proposal-2026-11-07.md) record their respective checks. Earlier candidate records retain their original scope and source identity. Never carry a passing result forward solely because a later build has the same version.

- Marketplace preview: integer quote rounding/expiry, immutable commitment, strict public-provider parsing, event replay/order guards, payment-claim/release separation, receipt acknowledgement, dispute freeze, pending refund/late-payment handling, empty/offline retry, both layouts/themes and unobstructed modal controls. This is synthetic UI evidence, not live escrow, bank, provider or wallet certification; see [verification](marketplace/verification.md).
- Marketplace public discovery: explicit consent, default-off browser-development gate, fixed-origin bounded relay, upstream rate-limit handling, strict LocalCoinSwap metadata/decimal parsing, local amount and newcomer filters, stale/cancelled-response rejection, confirmed external source navigation, and desktop/mobile layouts in both themes and French/Spanish. Network fixtures establish read-only implementation behavior; they do not prove production rights, executable liquidity or settlement. See [discovery verification](marketplace/discovery-verification.md).
- Marketplace safe rehearsal: six deterministic exercises, complete buy/sell paths with every off-origin request and research lookup forbidden, fresh payment/receipt acknowledgements, restart cancellation/replacement, one-action inline unavailable recovery, accessible selected states, accurate cancelled/refund/dispute progress and navigation/reload lifetime. Relay tests reject missing/wrong/duplicate request markers and cross-origin simple requests before any provider fetch. See the [testing guide](marketplace/testing-guide.md), [rehearsal verification](marketplace/rehearsal-verification.md) and [production-readiness gates](marketplace/production-readiness.md).

The persistent marketplace sandbox has a separate backend test suite using actual loopback HTTP, authentication and SQLite, repeated three times with coverage. `pnpm test:marketplace-backend` adds two consecutive Chromium/WebKit runs against the real service, desktop/mobile, with no API mocks, automatic retries, skipped cases or external traffic allowed. Browser cases cover exact grouped payment copy, missing human payment details and refund recovery, mobile chat focus, and clearing private data at the server-issued session deadline. Frozen-source reports and screenshots are retained under `outputs/marketplace-backend/`; these checks supplement `pnpm validate`. See the [backend testing and limits](marketplace/backend.md). Test evidence does not prove actual escrow, banking or native wallet behavior.

`pnpm test:marketplace-deployment` exercises the separately packaged SvelteKit production assets through an actual private Caddy TLS edge and durable service container. It verifies access enforcement, Secure cookies, restrictive headers/routes/client navigation, ownership collision refusal, restart/idempotency and denied outbound routing, then repeats the complete actual-service browser suite twice per engine/layout. Backend staging and backup tests additionally cover strict read-only preflight, verified TLS smoke, online WAL consistency, foreign/changed archives, no overwrite and fresh login after recovery. These checks target private simulated-money deployment, not funded or native release certification.
