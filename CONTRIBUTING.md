# Contributing to Groot

Thank you for helping improve Groot. Read `AGENTS.md`, the canonical product and
architecture documents, the relevant ADRs, and the engineering/test harness
before changing the wallet.

## Track the work

Open or confirm a GitHub issue before starting a non-trivial bug fix, feature,
security hardening change, maintenance task, or release campaign. The issue owns
the scope and acceptance criteria.

- Reference the issue from commits with `Refs #N` or an equivalent trailer.
- Link it from the pull request. Use `Closes #N` only when the pull request
  completes the issue; partial work uses `Refs #N` and leaves it open.
- Close completed or explicitly rejected work with a concise reference to the
  merged PR, exact commit, release, or accepted ADR.
- Do not disclose an unpatched vulnerability in a public issue. Use a draft
  security advisory or another owner-approved private tracker.

A purely editorial typo may omit an issue only when it changes no behavior,
policy, release claim, dependency, or security statement.

## Contribution license

The base wallet application in this repository is licensed under Apache-2.0.
Unless you explicitly state otherwise, an intentional contribution submitted
for inclusion is provided under Apache-2.0, as described by section 5 of that
license. Contributors retain copyright in their contributions. This repository
does not currently require copyright assignment or a separate contributor
license agreement.

Do not submit code, assets, test vectors, documentation, or generated material
that you do not have the right to contribute. Preserve third-party notices and
identify any additional license or attribution requirement in the change.

Apache-2.0 does not grant rights to the Groot name, logo, or product identity
beyond customary attribution. Optional hosted, family, business, or enterprise
services are outside the base-wallet license boundary unless their own
repository and license explicitly say otherwise.

## Quality and security

Keep changes small, update canonical documentation and tests with behavior, and
run `pnpm validate`. Security-sensitive reports should be validated against the
current source before implementation; a report recommendation is not itself an
approved product change.
