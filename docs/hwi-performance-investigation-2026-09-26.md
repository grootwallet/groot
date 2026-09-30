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
   another client. The former type-only account request and fingerprint-selected
   display both invoked upstream aggregate discovery. Groot's exclusive lease
   prevented competing Groot calls but did not prevent HWI from opening an
   unselected backend inside one process.
3. The Sep 30 correction binds BitBox account proof, retries, policy display,
   receive display, and signing to the exact path selected from the latest
   capability. Empty, synthetic, type-only, and fingerprint-only action selectors
   fail before spawn. Full account proof, private stdin, cancellation, exact
   expected-address comparison, and final context revalidation remain mandatory.
   This removes hidden rediscovery; it is not a persistent-client optimization.
4. The follow-up macOS correction replaces picker enumeration with read-only
   native HID, USB-registry, and serial inventory. It does not launch HWI or
   open a vendor session. Only selection starts an exact-path HWI action. The
   HID manager is created once and remains on one dedicated process-lifetime
   thread; recreating it across async blocking workers caused repeat-scan process
   terminations inside macOS `IOHIDDeviceScheduleWithRunLoop`.
5. Three sequential baseline bundled HWI `--version` launches, with cleared
   environment and 15-second per-process deadline, took **4016, 3387, 3346 ms**.
   This measures startup/teardown without USB, not end-to-end device latency or
   statistical p95. Three `codesign --verify --deep --strict` app checks took
   **31, 28, 29 ms**. That is a CLI proxy, not the exact Rust Security.framework
   and digest check. Removing signature checks is neither justified nor acceptable.

## Sep 30 comparison

| Path                                                        | Before                                                                                                | After                                                                                     | Timing conclusion                                                                                                |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| One picker request for three or all five supported families | One aggregate HWI process                                                                             | One in-process passive macOS inventory; zero HWI processes                                | Removes the measured HWI-launch floor from the picker by construction; new packaged latency is not yet measured. |
| Two concurrent picker callers                               | One shared process, but each caller advanced the cache epoch so a valid peer result could be rejected | One shared native inventory and one shared epoch; both callers redeem the same capability | Removes duplicate cache churn and retry pressure; no physical wall-time claim.                                   |
| BitBox BIP84 account identity                               | One type-only HWI process containing hidden aggregate enumeration                                     | One exact-path HWI process                                                                | Same process count; unselected backends are no longer eligible to be opened by this action.                      |
| BitBox identity plus policy/address display                 | Two HWI processes; the second used fingerprint lookup and hidden aggregate enumeration                | Two exact-path HWI processes under one Groot lease                                        | Same startup count; narrower action scope, with persistent-client/startup optimization still open.               |
| Closed picker                                               | Renderer ignored a late result and native cancellation could leave a cache repopulation race          | Native operation is canceled and its epoch is invalidated before termination wait         | Avoids a stale retry; cancellation latency still needs packaged and physical measurement.                        |

The deterministic passive-scan regression sleeps 50 ms per inventory call.
Three-family and all-family requests each increment the call counter once; two
concurrent callers also increment it once and receive one generation/epoch.
Classifier fixtures cover the approved HID, WebUSB, and serial identities,
including Mainnet omission of the passively ambiguous Safe 3 revision-A/Model-T
record. The current-firmware Model One's exact WebUSB release tuple is classified
as `trezor_1`, and its selected path retains the complete USB port chain. An
ignored-test host probe with a connected Model One and Safe 3 found both without
launching HWI or producing an unlock prompt. After the worker-affinity correction,
the same connected-Model-One probe completed twenty consecutive inventories in
one process. This verifies passive host
classification, not p50/p95, reconnect, selected-action, or packaged timing; see
ADR 0075.

Sources: [HWI commands](https://github.com/bitcoin-core/HWI/blob/3.2.0/hwilib/commands.py),
[BitBox adapter](https://github.com/bitcoin-core/HWI/blob/3.2.0/hwilib/devices/bitbox02.py),
[CLI](https://github.com/bitcoin-core/HWI/blob/3.2.0/hwilib/_cli.py).
Groot owners: `hardware.rs`, `wallet/hardware_commands.rs`, ADRs 0041 and 0043.

## Proposed speed work, in order

- Add opt-in, bounded, identifier-free phase timing: admission, native
  enumeration, HWI authentication/startup, identity proof, display, cleanup.
  Separate device waiting from CPU/startup. Never log arguments, responses,
  USB paths, fingerprints, keys, PINs, addresses, or PSBTs.
- Benchmark a reproducibly built, signed **one-directory HWI bundle** from
  the same pinned source/dependencies. It may avoid repeated one-file runtime
  extraction; current measurements do not isolate extraction from other startup
  work. This changes provenance and needs an ADR, supply-chain/SBOM review,
  signature/tamper tests, and packaged physical retests. Do not unpack the current
  helper into a mutable runtime cache.
- If repeated selected-device startup remains material, prototype a bounded
  isolated action helper that holds only the selected client through full
  account proof and one approved action. This targets repeated BitBox
  secure-session handoffs. Stock HWI CLI does not provide that contract; a new
  reviewed helper protocol, cancellation tests, and exact-model certification
  are required before adoption.
- Do not parallelize vendor logins, silently retry approvals/signatures, lengthen
  timeouts, skip account proof, trust cached fingerprints, or kill companion apps.

The native picker does not change the reviewed HWI action artifact. The physical
reason replug cleared the owner's selected-action stall remains unproven:
teardown, firmware state, ownership, and pairing need controlled isolation. Do
not delete pairing state as a diagnostic shortcut.

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
