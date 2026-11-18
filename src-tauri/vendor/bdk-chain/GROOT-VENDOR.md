# BDK Chain vendor record

Source is the crates.io release of `bdk_chain` 0.23.3, from upstream commit
`d9aa92b3511d95f6075616d30c146aa5df814495`. The published archive matches
the recorded Cargo checksum `c290eff038799a8ac0c5a82b6160a9ca456baa299a6f22b262c771342d2846c0`.

This copy retains the upstream source, README, tests and benchmarks. The
MIT and Apache license texts come from the root of that same upstream commit.
One upstream test line had trailing whitespace, which was removed.
The only upstream manifest changes pin bundled `rusqlite` to `0.41.1` and
enable `fallible_uint` to preserve checked unsigned integer conversions.
The locked build uses SQLite 3.54.1, which fixes CVE-2026-119375. Remove this
local patch when a compatible upstream BDK Chain release bundles fixed SQLite.
