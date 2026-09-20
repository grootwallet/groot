# ADR 0071: Auto-enroll the managed Mainnet gateway

- Status: accepted for internal release-candidate testing; GA operations review pending
- Date: 2026-09-19
- Extends: ADR 0061, ADR 0064, ADR 0067, and ADR 0070

## Context

Requiring every user to paste one shared RPC username and password is both poor
onboarding and an invalid production secret boundary. A credential embedded in
the application, build environment, or downloadable configuration can be
recovered by every recipient and cannot provide client-specific revocation or
quotas. Environment variables are appropriate for operator preflight scripts,
not for distributing a secret to a signed desktop application.

BlueWallet avoids user-entered credentials by connecting to BlueWallet-operated
Electrum servers it treats as trusted. Sparrow can randomly select a public
Electrum server when none is configured and separately lets the user configure
private Electrum or Bitcoin Core. Those public Electrum routes trade setup for
operator-visible wallet queries. Groot already makes that trusted-operator
tradeoff explicit for its managed remote-Core mode, while retaining a narrower
Bitcoin Core RPC contract and independent local transaction interpretation.

Apple App Attest and DeviceCheck are unavailable to the macOS desktop process,
so the first macOS release cannot truthfully claim device-attested enrollment.
The public enrollment surface therefore needs an explicit residual anti-Sybil
boundary rather than a hidden shared application secret.

## Decision

The fixed public Groot gateway URL exposes a separately throttled `POST
/enroll` contract. It accepts only a small versioned JSON request and returns a
new random principal and one-time password. The server stores only a salted
scrypt verifier in an owner-only, atomically replaced file. Enrollment and RPC
traffic have separate source limits; authenticated RPC additionally retains
per-principal limits, the exact method-and-parameter allowlist, concurrency
bounds, response bounds, and individual revocation.

The response is consumed only by native Rust. It is size bounded, parsed with
unknown fields denied, required to match the closed username/password shape,
and obtained with platform-native TLS validation, redirects disabled, and a
bounded timeout. The password never enters the webview, logs, command-line
arguments, build environment, or repository. Groot immediately checks the
compiled chain, genesis, IBD state, and required indexed-scan capabilities,
then stores the existing protected node-auth envelope encrypted by the wallet
credential. No persisted format changes.

Automatic enrollment runs only for a Mainnet profile that has no saved node
configuration. It never replaces a local node, custom remote node, Tor route,
or existing managed principal. New profiles may still copy another unlocked
wallet's setup. If enrollment or preflight is unavailable, profile creation and
unlock remain offline as allowed by ADR 0064; the UI must show that network data
is unavailable. There is no alternate node, fee source, downgrade, or silent
fallback.

Settings presents the managed endpoint as its own mode beside **This Mac** and
**Custom remote**. It does not render the generated principal or password.
Returning from a custom node, or replacing revoked managed access, requires an
explicit wallet-credential-authenticated action. That action repeats enrollment
and the exact-node/capability preflight before atomically replacing the existing
protected node envelope. It is never attempted as an automatic fallback.

Wallet unlock performs the optional network operation on a blocking worker,
after exact wallet-credential authentication and before the unlocked session is
published. Global Settings and sanitized app logs remain available while the
wallet is locked; wallet-specific routes, node details, credentials, and live
checks do not.

## Consequences

Fresh Mainnet users receive a usable default node without seeing or pasting RPC
credentials, while operators can revoke or throttle one profile without
rotating every client. Existing manually configured profiles are unchanged.

The global foreground scheduler owns the explicit post-unlock wake-up rather
than Overview. It restores exact-node admission and starts the saved initial
history scan when required even if Settings is the visible route.

For a newly generated software wallet, the same verified node preflight supplies
the creation-tip birthday persisted in the existing recovery-settings table
before the profile is published. Automatic first sync therefore checks only
post-creation history and the mempool. Recovery/import profiles without an
explicit saved choice remain blocked from empty-credential automatic scanning,
except for a newly created external-hardware profile under ADR 0072. That profile
saves the explicit safest full-history choice before publication because its
signer cannot supply an authoritative birthday.

The macOS enrollment endpoint remains publicly reachable and is not a proof of
genuine-app identity. IP throttling, a bounded principal population, monitoring,
revocation, and the least-privilege RPC contract limit abuse but do not eliminate
Sybil enrollment. GA therefore requires an operations review covering capacity,
principal cleanup, rate limits, incident rotation, and denial-of-service tests.
Mobile releases may add platform attestation later without weakening the
desktop contract or introducing a shared secret.

This changes no Bitcoin descriptor, key derivation, PSBT, transaction, wallet,
backup, proposal, node-configuration, or credential-envelope format and has no
BIP support impact.
