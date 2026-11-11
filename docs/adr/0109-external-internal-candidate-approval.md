# ADR 0109: External exact-commit approval for internal candidates

- Status: accepted
- Date: 2026-11-08

## Context

The internal candidate gate verifies a focused set of public-release policy
files and preserves the frozen public source-approval stop. That check is
useful regression evidence, but code inside a candidate cannot authorize the
same candidate. Executable workflow, Vite, Svelte, Tauri and release-builder
files outside the focused map can still determine package bytes. Pre-build and
post-build Git checks also cannot prove that an already accepted build hook did
not temporarily transform source while compiling it.

This distinction matters even for unsigned Testnet4 packages. A source
contributor and the owner who accepts an installable wallet candidate are
separate roles. The v5.3.0 public authorization and signing boundary must stay
unchanged.

## Decision

An internal package is accepted only when an authority outside the candidate
binds the build to one full Git commit:

- The Windows/Linux workflow uses the protected GitHub Environment
  `internal-candidate-approval`. Its required reviewer approves the exact run
  and commit before the job starts. The workflow checks out that commit
  detached and passes it to the builder.
- Internal builders require the full lowercase
  `GROOT_INTERNAL_CANDIDATE_COMMIT` and an explicit approval context. They do
  not infer approval from `HEAD`.
- Packaging requires a fresh detached, clean checkout. Every tracked blob is
  compared with the accepted commit, hidden index state and submodules are
  rejected, and the commit tree plus a complete tracked-source digest are
  recorded in package evidence. Strict Git object-graph verification rejects
  objects whose bytes do not match their IDs. Replacement refs, object
  alternates, tracked symlinks, repository-changing Git variables, untracked
  `.env*` files and inherited `PUBLIC_*`/`VITE_*` overrides fail closed.
- After package bytes are final, a commit-pinned GitHub attestation action
  signs their actual digests before upload. Acceptance verifies the exact
  workflow, source commit/ref and GitHub-hosted runner, then checks the signed
  Fulcio Deployment Environment and immutable token-subject extensions for
  `internal-candidate-approval`. Candidate-authored `BUILD-INFO` and checksum
  files remain useful evidence, but cannot substitute for this external proof.
- The focused internal policy snapshot remains a semantic and regression
  check. It is not described or accepted as complete source authorization.
- Owner-local macOS packages may use the `owner-local` context for the owner's
  own testing. They record the same source identity but are not independent
  approval or public release evidence.
- Direct Tauri, Signet and legacy portable Testnet4 commands remain development
  builds. Their name or bundle identity does not make them an accepted internal
  handoff.

Exact-commit approval includes executable build configuration and generators.
The clean-state rechecks detect persistent accidental drift; they do not claim
to sandbox an intentionally approved compiler or build hook. Review must
therefore include workflow, package-manager, Vite/Svelte/Tauri, native build
and release-control changes.

The public v5.3.0 authorization record, public policy pins, signed HWI inputs,
tag checks, notarization and public package process are unchanged.

## Consequences

A branch push may create a pending Windows/Linux workflow run, but no package
job starts or uploads an accepted artifact until the protected Environment is
approved. Changing any tracked source, workflow or builder creates a new commit
that requires a new approval. Package evidence names the accepted commit,
source tree, tracked-source digest, approval context, executable and HWI/runtime
digests. GitHub's public Sigstore service also records the artifact names,
digests, workflow and source identity in its transparency log. It does not
receive wallet data or the package bytes.

This control does not protect against an owner knowingly or mistakenly
approving malicious build code, an owner-account or GitHub compromise, or a
malicious trusted compiler. Those risks remain with independent review,
locked/pinned toolchains, isolated runners, SBOM/provenance and public signing
controls.

## Compatibility and standards

No wallet, registry, credential, descriptor, backup, proposal, label or
database format changes. No migration is required. BIP68/112/84/94/129/174,
fixed Miniscript paths, transaction authority and signer compatibility are
unchanged. This is release-governance hardening only.
