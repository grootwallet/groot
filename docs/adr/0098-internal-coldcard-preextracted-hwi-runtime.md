# ADR 0098: Internal Coldcard preextracted HWI runtime

- Status: accepted for the owner-requested RC9 Testnet4 experiment; physical acceptance pending
- Date: 2026-10-20
- Extends: ADRs 0039, 0041 and 0075

## Problem and evidence

RC8 uses the reviewed HWI 3.2.0 one-file executable for selected-device actions.
Twenty device-free version launches on Apple silicon macOS 26.6.2 took 6.482
seconds for the first sample, then a warm median of 3.953 seconds and empirical
p95 of 4.272 seconds across nineteen samples. This includes extraction, Python
startup and teardown, and does not isolate those phases or measure USB latency.
Fresh identity proof plus address display launches two processes; identification
followed by signing can launch three. Discovery is already passive native inventory.

A device-free experiment retained the unchanged, digest-pinned executable but
provided its extracted Python payload through the pinned bootloader's
`_MEIPASS2` entry point. The first launch took 5.595 seconds, followed by four
launches taking 70–88 ms. This is host evidence only, not a physical speed claim.

## Decision

Internal multi-network RC packaging may extract the binary/data/symlink entries
from the exact manifest-pinned HWI executable at build time. The parser is
bounded, rejects unsupported archive types/options and unsafe paths, and never
imports Python or executes vendor code. No package or dependency is downloaded,
updated or added. HWI itself, including its digest and vendor protocol code, is
unchanged. The extracted Python framework is ad-hoc re-sealed because the one-file
payload omits its framework resource seal. Its executable code is unchanged;
the generated manifest hashes the final signed bytes and complete payload.

The payload lives inside the app at `Contents/Resources/hwi-runtime`, covered by
the containing app seal. A deterministic manifest binds every regular file and
relative symlink to the original HWI digest; the manifest digest is compiled
into Groot. Before each eligible spawn, Rust retains the existing app signature,
nested-code signature and exact HWI digest checks, then verifies the complete
bounded payload inventory, hashes, sizes, path containment and write permissions.
Missing, changed or extra payload files fail closed before spawn. There is no
mutable extraction cache, external runtime search, or automatic fallback.

Only a bundled, internal `REHEARSAL_ONLY` multi-network build may compile this
manifest. Runtime use additionally requires the explicit Testnet4 chain and
selected Coldcard device type. Other signers and networks retain their previous
one-file execution. Production packaging has no activation path. The cleared
child environment gains only the verified payload path through `_MEIPASS2`,
which this pinned bootloader consumes and unsets. Caller-supplied Python and
PyInstaller environment values remain discarded.

This experiment removes repeated runtime extraction, not repeated device
connections. It does not introduce a persistent Python worker, cache live device
state, remove account proof, skip policy requirements, change trusted-display
approval, extend timeouts or retry signatures. Exact-path selection, bounded
private stdin, process groups, cancellation and final wallet/proposal checks
remain unchanged. macOS inventory retains its dedicated HID manager thread.

## Acceptance and rollback

Parser/tamper fixtures, Rust payload verification, existing HWI/process tests,
formatting, Clippy and the full Rust suite must pass. Run mandatory validation
and report the existing reviewed-source failure without updating source pins.
Verify the exact RC9 app seal, original HWI digest, extracted payload manifest,
source/version identity and device-free cold/warm launches in the final package.

The owner must compare Mk4 identification, health, BIP84/BIP48 receive display,
policy-missing behavior, rejection, reconnect/cancellation and signing against
RC8 on disposable Testnet4 data. Human review time is separate. No unattended
device interaction, signing, broadcast or firmware/pairing changes are authorized
by the host benchmark. Other models inherit no certification.

Rollback is the previous RC8 app or an internal build without the extracted
runtime option. No in-flight request is replayed. This changes no wallet,
profile, registry, credential, backup, policy-evidence or proposal format and
requires no migration. BIP support and encodings are unchanged. A production
rollout or extension to another signer/network requires separate review and
exact-package certification; RC9 grants no public release authorization.

ADR 0101 extends this internal experiment to Ledger/BitBox02 Testnet4 and one fresh client per operation; the original RC9 scope and acceptance record above remain historical.
