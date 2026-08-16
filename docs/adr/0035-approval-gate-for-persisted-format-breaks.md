# ADR 0035: approval gate for persisted-format breaks

Status: accepted.

## Context

Two early disposable Regtest profiles retained valid wallet databases but predated the current hardware-wallet sidecars: public identity metadata and an encrypted local app-PIN verifier. The registry therefore listed the profiles while their kind-specific unlock paths failed with misleading missing-wallet or missing-verifier errors. Building an inferred migration would reset local authentication semantics and reconstruct identity presentation that the old format never persisted.

Persisted formats are security and recovery interfaces. Treating a format break as an ordinary refactor can silently strand data, introduce an unreviewed migration, or make a reset appear to authenticate an old credential.

## Decision

- Every change to a wallet database, registry, public metadata, encrypted verifier, backup, proposal, label, or certification-profile format must declare its backward-compatibility effect before implementation.
- Any breaking change requires an ADR plus explicit user approval choosing a bounded migration or deliberate discard. Test-only and Regtest status does not supply implicit approval.
- The two known pre-sidecar hardware/multisig Regtest profiles are deliberately unsupported as disposable test data. Groot detects them before PIN entry, states the incompatibility, offers explicit deletion/recreation or public-backup recovery, and does not modify their files automatically.
- Current profiles, including the Trezor Safe 3 certification profiles, remain supported and are not recreated or replaced.
- Public-network data may not be discarded under this decision; it must fail closed behind a separately reviewed migration or recovery flow.

## Consequences

The misleading PIN errors are replaced by a precise format-compatibility state without adding migration code or changing old profile files. Future storage changes carry an explicit review artifact, compatibility fixtures, recovery behavior, and approval record before implementation.
