# Dependency audit triage — 2026-10-23

Refs #121. This record separates dependency risk from ownership refactoring. Application runtime dependency declarations, lockfiles and pinned toolchain were not upgraded by the maintenance implementation. The isolated fuzz workspace has its own reviewed tooling/lockfile.

`pnpm audit --prod --audit-level high` reported no known vulnerabilities. `cargo audit` exited successfully but emitted **12 allowed warnings**. Exit zero is not a clean dependency-health claim.

Prioritize a separate dependency change for the Tokio 1.52.4 unsoundness advisory [RUSTSEC-2026-0386](https://rustsec.org/advisories/RUSTSEC-2026-0386). The locally refreshed RustSec record identifies AsyncFd constructors and fixes in 1.51.6 (below 1.52) or 1.53.3 and later. A literal source search found no use of the named constructors in Groot or the inspected cached locked dependencies outside Tokio itself. That is limited static evidence, not proof of unreachability across aliases, conditional builds or downstream changes. Do not suppress the advisory or claim it cannot affect Groot. A separate update must review the resolver diff, all target features and network/runtime regression checks.

The other unsound warning is glib 0.18.5 [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429). Review it with the Linux/Tauri dependency path and supported-platform checks; a macOS-only test pass is insufficient.

Nine unmaintained warnings affect proc-macro-error, five unic crates, zbus_names, zvariant and zvariant_derive. clipboard-win 5.4.1 is yanked. These need dependency-owner and platform review, not a speculative bulk update mixed into a wallet refactor. Record current transitive paths, available upstream fixes, compatibility and the resulting SBOM before accepting changes.

The local RustSec database used for this evidence is commit `84d943a6deeb8cc6c6f632531aaf4f1c62275239`. This is advisory triage based on that refreshed lockfile audit and scoped source inspection. It is not an exhaustive supply-chain audit or a finding that wallet keys were exposed. No new audit allowance was added.
