# ADR 0123: Stateless managed gateway enrollment

- Status: proposed; isolated candidate for security and operations review
- Date: 2026-11-18
- Extends: ADRs 0071 and 0035; changes future public issuance only

## Context

A version-only anonymous enrollment request permanently appended a verifier to the finite enrolled-principal file. Distributed source addresses could fill it and stop later legitimate enrollment across restarts. Rate limiting alone only delays that exhaustion. Expiring verifier rows would instead strand infrequent clients: Rust preserves saved managed credentials and deliberately does not replace them automatically. Promoting a credential permanently after its first RPC leaves the same exhaustion path with one extra request.

## Candidate decision

Keep the version-1 client contract and every existing principal file byte-for-byte. For future public clients, issue a random `groot-` plus 24 lowercase-hex username and a 43-character base64url HMAC-SHA256 password. Its MAC binds a fixed domain and the exact username under a server-only 256-bit key. No public request creates a durable principal row. Native parsing, saved node credentials, wallet authentication and encrypted envelope formats do not change.

Existing explicit KDF records are a separate authority and retain precedence. A known username/password mismatch never falls through to MAC verification. Legacy authentication remains available when the issuer state is missing or corrupt. Signed credentials have no idle expiry, so a legitimately infrequent user needs neither a new password nor automatic replacement on unlock.

The POSIX service uses one separately versioned, owner-only issuer JSON and an advisory process-shared lock. The existing provisioning tool initializes the new file explicitly as the daemon user, refuses root initialization and never overwrites an existing key. Admission and revocation changes use atomic owner-preserving writes. Restoring only the issuer JSON is supported: lock creation/recreation derives the daemon UID/GID from validated issuer metadata. No current record or wallet data is migrated, inferred, discarded or revoked by this change.

Public admission retains the original per-IP throttle and adds persisted global burst 32/refill one per minute and normalized IPv4 `/24` or IPv6 `/48` prefix burst 8/refill one per hour. IPv4-mapped IPv6 is canonicalized to IPv4. Prefix state is capped at 4,096 entries and unused prefixes are reclaimed after 16 hours. The enrollment IP-bucket map is also bounded. Admission is atomic across threads/processes and survives restart.

Explicit signed revocations are permanent tombstones in the issuer state. The existing `--remove` operator action records the tombstone before deleting a colliding legacy record. A failed journal write therefore cannot expose a valid MAC fallback. Public-format removal also refuses missing/corrupt issuer state and preserves the legacy record until state is restored; a separate manual store selects its actual issuer with `--issuer-clients`. Non-public legacy removal and all legacy authentication remain independent of issuer availability. Deliberately provisioning an independent KDF password is a separate trusted grant, without restoring the old signed password. Revocations are never evicted; at 10,000 entries, enrollment stops and further new revocations fail explicitly while retaining existing tombstones. No untrusted enrollment grows that ledger.

## Custody, recovery and limits

The operator must back up the complete current issuer state, retain its daemon UID/GID and mode `0600`, and preserve all subsequent revocations when restoring. A stale backup can restore revoked authority, just as a stale credential-file backup can; no automatic rollback or ledger clearing is offered. Key loss/rotation invalidates signed clients. Recovery requires the exact issuer backup or the existing explicit wallet-credential-authenticated managed-access renewal, not silent native credential replacement.

Rollback to the old gateway preserves legacy KDF clients but cannot authenticate new signed credentials. Preserve issuer state and the updated revocation tool for forward recovery. Missing, malformed, unsafe-permission or symlinked issuer state fails closed for signed access/enrollment; it is never regenerated during ordinary requests.

The new key concentrates authority over future public credentials. Its compromise permits forging them until a reviewed rotation; this is a material custody responsibility requiring independent review before deployment. It is not a secret embedded in client applications. Sustained distributed Sybil traffic remains an availability risk under bounded admission, RPC throttles and concurrency. There is no claim of device attestation, complete denial-of-service resistance or unlimited operator revocations.

The gateway already targets POSIX service hosts and Linux systemd/NGINX deployment; its existing boundary test runner skips service tests on Windows for POSIX permissions. `fcntl` does not change Windows wallet support. No live service, host configuration, account or deployment is modified by the candidate.

## Compatibility and standards

Version-1 salted-verifier records and their current passwords remain unchanged and readable; the new state is additive service-owned data, not a migration of existing records. No WalletPort/API, response DTO, native credential, wallet/profile/backup/proposal/registry, descriptor, transaction or dependency changes. BIP impact: none. Existing release authorization and exact-candidate acceptance gates remain unchanged. This proposed decision requires source, key-custody and operations review before adoption or deployment.
