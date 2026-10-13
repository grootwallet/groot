# ADR 0054: Approve Coldcard and Jade family identities for limited mainnet

- Status: accepted as a release-scope constraint; mainnet remains disabled
- Date: 2026-09-03
- Extends: ADR 0052 and ADR 0053

## Context

The first limited-mainnet target matrix names Coldcard Mk4 and Blockstream Jade
Classic. Their model-specific Regtest and Testnet4 evidence is retained in the
hardware-certification record. Bundled Bitcoin Core HWI 3.2.0 does not expose
those exact model identities: a non-EDGE Coldcard is reported as
`coldcard`/`coldcard`, and a serial Jade is reported as `jade`/`jade`.

Requiring exact-model identity would therefore exclude two extensively tested
targets unless Groot added and independently reviewed a second vendor-specific
model-query protocol. The release owner instead explicitly accepts the narrower
residual risk that another device recognized by HWI under one of these same
family records may pass the mainnet runtime family gate.

## Decision

The limited-mainnet trusted boundary may admit the exact HWI 3.2.0 family
records `coldcard`/`coldcard` and `jade`/`jade`. This is a deliberate family-level
runtime approval, not a claim that HWI authenticated an exact model.

All other hardware protections remain mandatory:

- the signer must be discovered through the reviewed bundled HWI on a live USB
  connection;
- mainnet wallet creation and recovery require a recent memory-only admission
  bound to device family, fingerprint, complete account xpub, and derivation
  path;
- saved, renderer-supplied, QR, file, or manual metadata cannot create that
  admission;
- address and transaction review remain bound to the selected live signer and
  the authoritative descriptor or PSBT; and
- unlisted HWI families and any Coldcard or Jade model string other than the two
  exact family records above remain rejected.

Physical certification remains model-, firmware-, transport-, package-, and
candidate-specific. Coldcard Mk4 evidence does not certify another Coldcard;
Jade Classic evidence does not certify Jade Plus. Release notes may name Mk4
and Jade Classic as the tested targets, but must disclose that runtime admission
is enforced at the HWI family level. Unsupported models receive no compatibility
or certification claim merely because HWI admits the family record.

## Alternatives considered

An exact-model query would reduce ambiguity but adds a second hardware identity
protocol and connection-binding surface that must be implemented and audited.
Excluding both families would discard substantial physical evidence and narrow
the intended first-release scope. The accepted family boundary is smaller and
more reviewable, with its residual risk stated directly.

## Consequences

Coldcard Mk4 and Jade Classic may remain in the limited-mainnet target matrix.
The source policy and independent security review must cover the family
allowlist. Any HWI upgrade, changed family/model strings, new transport, or claim
of support for another exact model requires a new scope review and separate
physical evidence.

This ADR does not enable mainnet, accept ADR 0053, close a certification row, or
authorize release. The pre-wallet exact-genesis Core admission, independent
review, reproducible builds, signed-package checks, candidate-specific physical
tests, and final release decision remain mandatory.
