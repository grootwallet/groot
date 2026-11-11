# ADR 0110: Update bundled SQLite

- Status: accepted for the internal candidate
- Date: 2026-11-11

Groot bundles SQLite through BDK. The current BDK Chain release still selects
rusqlite 0.31, whose bundled SQLite is affected by
[RUSTSEC-2026-0459](https://rustsec.org/advisories/RUSTSEC-2026-0459.html).
The issue requires a database and its sibling write-ahead log that a less
trusted party can write.

Use the existing BDK Chain version with a vendored dependency adjustment to
rusqlite 0.41.1. The lockfile selects libsqlite3-sys 0.39.1, which bundles
SQLite 3.54.1 on every target. Keep the existing SQLite build mode. This avoids
depending on an operating system’s SQLite version and retains the existing
BDK persistence code. Remove the vendored copy when a compatible upstream
BDK Chain release selects patched bundled SQLite.

The native test suite checks the linked SQLite version. Normal wallet storage
and isolated Bitcoin Core integration tests exercise the upgrade. The change
requires no wallet migration and has no BIP impact. Final installer and
physical acceptance remain part of the release checklist.
