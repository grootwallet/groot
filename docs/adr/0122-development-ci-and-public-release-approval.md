# ADR 0122: Development CI and public release approval

- Status: accepted
- Date: 2026-11-17
- Extends: [ADR 0109](0109-external-internal-candidate-approval.md)

## Context

The 0.5.4 development source intentionally differs from the historical v5.3.0 public snapshot. Strict public-source approval must reject those bytes until a separate release decision. Requiring that approval in every pull request confuses development regression evidence with permission to distribute a wallet. Five intentional mobile changes also need a scoped update to the focused internal regression snapshot; their [review record](../testing/0.5.4-mobile-source-review-2026-11-17.md) identifies the exact old and new bytes.

## Decision

CI selects its validation profile from checked GitHub event data and ref identity:

- A valid `pull_request` context runs the complete `pnpm validate:internal` profile. Its PR number must be a positive safe integer matching the exact `refs/pull/<number>/merge` ref.
- A `push` to `refs/heads/main` runs strict `pnpm validate:ci`.
- Missing, inconsistent or unsupported context fails before validation. A branch name or caller-selected profile cannot grant the pull-request path.

Both profiles retain the complete shared inventory and a single coverage-enabled frontend unit pass. Pull-request validation executes all 30 real release fixtures. It permits exactly the typed frozen public-source approval stop, then separately requires every focused source digest, source semantics and structural release guard to pass. Additional failures, missing cases, unexpected skips, snapshot drift and semantic or structural regressions remain failures. The only platform skip remains the named macOS inspection fixture on other platforms.

Internal digests may change only after a scoped source review records the exact changes, retained guards and expected bytes. The five-file mobile review permits only its named internal regression updates. Public digests remain unchanged. Hashes are not regenerated automatically to make validation pass.

A passing pull-request result reports public source approval as pending. It is candidate CI regression evidence, not acceptance of an installable package or public release. Strict local `pnpm validate`, strict `pnpm validate:ci`, the main-push profile and public packagers keep their approval requirements. Main, released tags and historical v5.3.0 authorization are not changed by this decision.

[ADR 0109](0109-external-internal-candidate-approval.md) still requires external acceptance of the full commit before an internal handoff, including executable build controls, a fresh detached checkout and commit-bound artifact evidence. Protected Environment approval, attestation, public version/tag authorization, signing and physical certification remain separate gates. Pull-request CI produces no accepted installable handoff.

## Compatibility and standards

No wallet behavior, WalletPort/API, credential, profile, backup, proposal, registry or database format changes. No migration or dependency changes. BIP impact: none; this decision changes CI profile selection and records a focused regression review, without extending network, signer or release support.
