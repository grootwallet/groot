# HWI discovery and BitBox reconnect investigation

Status: source audit and no-device host measurements; not physical certification.
Baseline package: v0.4.95, `ade1a575`. No connected device was enumerated, unlocked,
prompted, signed with, reset, or re-paired during this investigation.

## Findings

1. HWI 3.2.0 aggregate enumeration visits its backends sequentially.
   `find_device(type, fingerprint)` also enumerates before filtering. Groot
   already coalesces concurrent scans; a CLI type filter does not make the
   upstream scan selective.
2. BitBox enumeration initializes and closes a client. Account proof opens
   another client. Fingerprint-selected display invokes upstream discovery and
   opens another client again. Groot's exclusive lease prevents competing Groot
   calls but is not a persistent vendor session. Unrelated backends can delay it.
3. Receive display already reopens by freshly proven fingerprint; draft/saved
   policy display still used the cached HID path. The patch aligns policy display
   with receive display. Full account proof, private stdin, cancellation, exact
   expected-address comparison, and final context revalidation remain mandatory.
   This is a reconnect candidate, not a discovery-speed improvement.
4. Three sequential baseline bundled HWI `--version` launches, with cleared
   environment and 15-second per-process deadline, took **4016, 3387, 3346 ms**.
   This measures startup/teardown without USB, not end-to-end device latency or
   statistical p95. Three `codesign --verify --deep --strict` app checks took
   **31, 28, 29 ms**. That is a CLI proxy, not the exact Rust Security.framework
   and digest check. Removing signature checks is neither justified nor acceptable.

Sources: [HWI commands](https://github.com/bitcoin-core/HWI/blob/3.2.0/hwilib/commands.py),
[BitBox adapter](https://github.com/bitcoin-core/HWI/blob/3.2.0/hwilib/devices/bitbox02.py),
[CLI](https://github.com/bitcoin-core/HWI/blob/3.2.0/hwilib/_cli.py).
Groot owners: `hardware.rs`, `wallet/hardware_commands.rs`, ADRs 0041 and 0043.

## Proposed speed work, in order

- Add opt-in, bounded, identifier-free phase timing: admission, helper
  authentication, startup, enumeration, identity proof, display, cleanup.
  Separate device waiting from CPU/startup. Never log arguments, responses,
  USB paths, fingerprints, keys, PINs, addresses, or PSBTs.
- Benchmark a reproducibly built, signed **one-directory HWI bundle** from
  the same pinned source/dependencies. It may avoid repeated one-file runtime
  extraction; current measurements do not isolate extraction from other startup
  work. This changes provenance and needs an ADR, supply-chain/SBOM review,
  signature/tamper tests, and packaged physical retests. Do not unpack the current
  helper into a mutable runtime cache.
- Prototype a bounded isolated helper operation that inventories transports
  without login, opens only the selected device, and holds one client through
  full account proof and one approved action. This targets repeated BitBox
  secure-session handoffs. Stock HWI CLI does not provide that contract; a new
  reviewed helper protocol, cancellation tests, and exact-model certification
  are required before adoption.
- Do not parallelize vendor logins, silently retry approvals/signatures, lengthen
  timeouts, skip account proof, trust cached fingerprints, or kill companion apps.

No new HWI artifact or transport rewrite is included in the policy patch. The
physical reason replug cleared the owner's stall remains unproven: teardown,
firmware state, ownership, and pairing need controlled isolation. Do not delete
pairing state as a diagnostic shortcut.

## Assisted hardware loop

The agent can run fixtures/emulators unattended, build candidates, compare
sanitized results, and drive host steps in an explicitly authorized physical
session. Trusted-display correctness still needs the operator. Use a separate
disposable Regtest/Testnet4 profile and test-only signers, not automatic approval
on funded Mainnet devices.

First agree on exact builds, devices, profile, maximum iterations, and operations.
The owner closes companion apps. Proceed one step at a time, requesting every
unlock, approve/reject, display comparison, and cable action. Pause on unexpected
prompts or ownership errors. Firmware updates, reset, seed/backup display,
pairing repair, signatures, and broadcast are not implicit diagnostic actions.
The agent cannot press physical buttons or read the trusted screen through USB;
HWI success is not proof that the operator saw matching values.

First matrix, separately for original BitBox02 and Nova:

1. Single device: locked discovery, unlocked discovery, policy proof/display.
2. Explicit rejection, then retry; cancellation must fully drain first.
3. Operator unplug/replug, then fresh discovery and same-identity proof.
4. Both BitBoxes connected: ambiguity and wrong-device refusal.
5. Add locked Trezor/Jade/Ledger individually to isolate unrelated delays/prompts.

Record exact firmware/build, stable outcomes, elapsed time, and operator reports.
No unattended real-device loop or recurring automation has been enabled.

## Compatibility and acceptance

No persisted wallet/profile/registry/proposal/backup format, dependency,
derivation, descriptor, PSBT, or BIP support changes; no migration. The regression
checks the BitBox selector and unchanged Jade path and proves wrong account
identity never reaches display. Original-BitBox02/Nova physical policy,
address, cancel, retry, and timing checks remain open.
