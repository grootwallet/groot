# ADR 0017: independent wallet sessions

Status: accepted

## Context

Satchel can hold several UUID-isolated wallets. Revoking the current unlock session whenever the user selects another wallet prevents cross-wallet authorization, but it also forces needless credential entry when comparing or operating two wallets. A single process-global session cannot provide both isolation and usable switching. Periodic chain polling must not silently keep sensitive sessions alive forever.

## Decision

- The trusted Rust boundary stores unlock sessions in a map keyed by wallet UUID. Unlocking one wallet never authorizes another.
- Selecting a wallet does not create, transfer, or revoke a session. The frontend probes the selected wallet and opens it directly only when that exact wallet has an active session.
- Each wallet expires independently after the globally configured inactivity duration, measured with monotonic time. The persisted preference defaults to five minutes and is constrained to reviewed choices between one minute and one hour. User-initiated wallet commands refresh only that wallet's deadline; changing the preference does not merge session clocks.
- Foreground chain sync, notification reads, and notification acknowledgements validate the selected session without refreshing its deadline and prune every expired wallet session. This also erases expired per-wallet RPC credentials while another wallet remains active.
- Protected Bitcoin Core user/password credentials are held in a separate wallet-ID-keyed zeroizing map and are removed when that wallet expires, locks, resets, or is deleted.
- Explicit lock, reset, and deletion revoke only the affected wallet. Terminating Satchel clears every process-memory session.

## Consequences

Users can move between recently used wallets without repeated PIN or passphrase prompts, while every authorization remains bound to a single immutable wallet identity. An unattended selected wallet still reaches the lock screen even though foreground polling continues. More than one wallet's protected RPC password may exist in zeroizing process memory during the bounded session window; this is an explicit usability tradeoff and never crosses the Rust/webview boundary.

The timeout is enforced at the native boundary: the next trusted command removes every expired entry, and an expired selected wallet fails with `wallet_locked`. The selected wallet's ten-second scheduler supplies the normal cleanup heartbeat and prompt UI transition without adding a second timer authority. Process suspension can delay wall-clock presentation, but the first command after resume prunes the sessions before authorizing any operation.

## Clarification: global duration, independent clocks

The timeout duration is an application-wide security preference, not wallet metadata. This avoids wallets silently carrying different unattended-access policies. Session state remains keyed by wallet UUID: using wallet A does not keep wallet B alive, **Lock now** revokes only the selected wallet, and quitting the process revokes all wallets.

## Implementation clarification — 2026-08-14

The native profile-selection command performs the selected wallet's non-renewing session check and returns that boolean with the public profile. The renderer routes directly to Overview or unlock from this typed result; it must not mount a wallet-data route to discover lock state, because doing so exposes a transient intermediate screen during locked-wallet switching.
