# Security incident response

This runbook applies to suspected compromise of wallet logic, signing intent, release infrastructure, update keys, HWI artifacts, backends, or stored data. It does not authorize mainnet; ADR 0012 remains controlling.

## First response

1. Stop publishing and distributing builds. Preserve the exact commit, artifacts, manifests, signatures, SBOM, CI logs, and sanitized reproduction data.
2. Open a private security advisory. Do not paste mnemonics, credentials, xpubs, fingerprints, PSBTs, addresses, device paths, RPC secrets, or wallet databases into tickets or chat.
3. Classify whether signing authority, transaction intent, recovery, confidentiality, persistence, availability, or only release metadata may be affected.
4. Reproduce with disposable regtest data on an isolated machine. Assume all external files, devices, nodes, and update metadata are adversarial.
5. If signing or release integrity may be affected, tell users to stop transacting and independently verify receive addresses and pending transactions on trusted device displays. Never ask users to submit seeds.

## Containment and recovery

- Revoke affected release/update credentials through their provider; keep revoked private material out of the repository. Rotate only from a known-clean machine and require a new independently reviewed trust root.
- Remove affected artifacts from distribution without deleting the evidence archive. Publish hashes of withdrawn artifacts through the established authenticated channel.
- Fix the smallest trusted boundary, add a regression test that fails before the fix, and rerun the complete release gate from a clean checkout.
- Treat database ambiguity as unsafe: preserve originals, work on copies, and require descriptor-based recovery if authoritative state cannot be proven.
- For backend compromise, disable the endpoint. Do not silently fall back to another backend or fee source.
- For HWI compromise, quarantine the exact artifact hash and require a new source/artifact/license provenance manifest plus hardware regression pass.

## Disclosure and closure

Publish a concise advisory only after containment, with affected versions/hashes, impact, required action, and fixed version. Avoid operational detail that exposes users. Closure requires an evidence-linked root cause, tests, independent review proportionate to impact, signed replacement artifacts, and an explicit decision on whether key rotation or rollback is required.
