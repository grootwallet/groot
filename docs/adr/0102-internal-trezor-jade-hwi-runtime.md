# ADR 0102: Internal Testnet4 Trezor and Jade fast HWI path

- Status: accepted for owner-requested internal RC12 performance rehearsal; physical acceptance pending
- Date: 2026-10-21
- Extends: ADRs 0098 and 0101

## Context

Owner-operated RC11 trials found the remaining slow USB families. Jade Classic
1.0.41 took 8.20–8.62 seconds for health, 7.93–8.18 for identity, 20.44 for
address display, 15.84 for transaction review and 11.76 for single-key xpub
extraction. Trezor Model One took 6.40 seconds for health, 12.53 for address,
12.89 for transaction review, 6.38 to show its PIN keyboard and 8.09 after
PIN entry to unlock/extract the xpub. Safe 3 took 6.48 for health, 6.71 for
identity, 16.12 for address, 12.79 for transaction review and 6.58 after
unlock for xpub extraction. These are individual owner samples, not controlled
medians or evidence of general hardware certification. Model One intermittently
showed “Trezor unavailable” during identification/address verification and
worked after reconnecting. Its exact transport cause is unknown.

Original BitBox02 and Nova are already fast under ADR 0101. The pinned HWI
3.2.0 executable's PyInstaller startup and reopening a client for identity plus
an action explain a substantial host-controlled portion of the other waits.

## Decision

Extend the exact same app-sealed, digest-verified, isolated Testnet4 runtime to
Trezor and Jade in ad-hoc `REHEARSAL_ONLY` multi-network builds. Keep original
HWI device modules and executable unchanged. The native selector requires the
actual Testnet4 chain as well as the exact HWI command selector; Jade's stock
command must pass HWI's shared `test` selector because its adapter has no
`TESTNET4` entry. The operation worker maps only Jade's validated Testnet4
request to HWI `Chain.TEST`, while Trezor keeps `Chain.TESTNET4`. No other
network or production build enters this path.

Selected identity, address and signing actions use ADR 0101's one fresh client,
full fingerprint plus account-xpub proof and at most one policy-authorized
action. Public key material is reused only inside that operation. PIN prompt
and PIN submission remain separate, device-required steps through the original
HWI CLI, now with the sealed extracted runtime to avoid repeated extraction.
Never cache unlocked state or retain a client across requests. Native identity,
policy, actual address/PSBT, signature, lease, timeout, cancellation and helper
integrity checks remain authoritative. Map Jade's fixed network-mismatch error
to the existing safe wrong-network guidance without carrying vendor text.

## Acceptance and limits

Run worker protocol/no-action/cleanup tests, native tests and lint, extraction
and package integrity fixtures, version and release gates and the full
repository validation. Probe each exact packaged driver without opening USB,
then compare first and warm physical health, identity, address, signing prompt
and signature timings for both Trezors and Jade. Verify rejection, PIN retry,
disconnect/reconnect, wrong network and mismatched policy/address/PSBT behavior.
A 50% reduction in the slow host-dominated waits is a target, not a claim.
RC11 is the compatible rollback. The Model One intermittent transport fault is
unresolved until an exact failure code and physical retry evidence identify it.

No persisted wallet, backup, policy, credential, registry or proposal format
changes. No derivation, descriptor, PSBT, network or BIP-support change. No
migration or new dependency. Main and public builds remain outside this internal
rehearsal; exact-source independent review and physical device certification
are still required before release.
