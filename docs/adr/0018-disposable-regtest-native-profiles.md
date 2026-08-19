# ADR 0018: disposable regtest native profiles

Status: accepted

The Keychain-record clause is superseded by ADR 0037. Disposable-profile isolation and cleanup requirements remain in force.

## Context

Native restart, automatic-lock, print, rescan, and crash-recovery acceptance tests must use real process and platform boundaries. Running a development build against the normal application-data directory can discover or mutate an existing Satchel registry, so those tests cannot safely proceed without storage isolation.

## Decision

- A native regtest build may read `SATCHEL_REGTEST_APP_DATA_DIR` as an explicit application-data override.
- The override is accepted only while the compiled wallet network is regtest, only as an absolute `satchel-regtest-*` directory directly beneath `/tmp` on Unix (canonically `/private/tmp` on macOS) or the canonical system temporary directory on other platforms, and never when the target is a symlink or non-directory.
- The normal platform application-data path remains the default. No UI setting or production-network fallback exposes this test boundary.
- Each acceptance run creates a fresh directory, uses only disposable wallets and regtest funds, records sanitized evidence, and removes the directory after the run. Apple Keychain records remain UUID-bound and contain no recovery words or credentials.

## Consequences

Native lifecycle tests can restart Satchel without touching the operator's ordinary wallet registry. The override is intentionally narrow and unsuitable for user-selected storage, persistent portable wallets, or mainnet. Physical-device and camera certification remain separate even when the native profile is isolated.
