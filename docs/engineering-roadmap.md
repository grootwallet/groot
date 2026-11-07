# Maintenance order

Track non-trivial work in [#121](https://github.com/grootwallet/groot/issues/121) or a focused follow-up. Preserve wallet formats, command contracts, native authorization and existing supported workflows.

| Order | Work                                                         | Acceptance                                                                                       |
| ----- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 1     | Reconcile current capability claims and freeze the candidate | One source identity; current docs agree; earlier evidence stays dated                            |
| 2     | Protect affected behavior                                    | Wrong credentials, late replies, cancellation, retry, restart and failed writes have named tests |
| 3     | Simplify Settings, then shared Send presentation             | Route-local lifetimes; existing components; no transaction authority moves to TypeScript         |
| 4     | Separate coherent adapter/native responsibilities            | Stable WalletPort and IPC; unchanged guard ordering and transaction boundaries                   |
| 5     | Measure real waits and optimize the largest cost             | Paired production measurements; no skipped checks or stale security decisions                    |
| 6     | Finish physical acceptance and exact-source review           | Phone and signer evidence names the candidate, OS, model, firmware and transport                 |
| 7     | Approve and release separately                               | Approved source, aggregate checks, package verification and explicit release authorization       |

CSS ownership, shared acceleration quotes, Settings snapshots, native profile/notification/recovery owners, full phone-prevout checks and prepared label queries already exist. Continue from them. Do not repeat completed extractions merely to reduce file sizes.

Keep mechanical moves separate from fixes. Remove code only after proving it is unreachable or redundant; retain compatibility readers and boundary/release tests. Reuse fixtures without introducing mutable global test state. A new reusable UI component requires the approval described in [the design system](design-system.md).

Hardware coordination and operation-lock changes come last. First measure contention and characterize unlock, reconnect, rejection and cancellation. Keep fresh full-account identity and final transaction checks. Profile repeated Continuity compilation before introducing reuse; live maturity must always be checked again.

Package attribution found no safe reduction for the earlier milestone. Retain supported hardware runtime resources. Further size or dependency changes need separate evidence and review.

Run [the maintainer harness](agent-harness.md), including mandatory `pnpm validate`, and record the actual result. A frozen source-policy mismatch blocks release; do not refresh hashes to make development checks green. The [current campaign](testing/maintenance-2026-11-07.md) separates automated results from physical and approval gates.
