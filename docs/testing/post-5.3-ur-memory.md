# Post-5.3 QR fuzz memory calibration

Date: 2026-10-24. This record concerns the isolated `ur_composition` fuzz target, not wallet runtime memory. There is no product, protocol, data-format or BIP support change.

## Decision and scope

The first 7,200-second campaign stopped after 4,948 seconds at the 512 MiB libFuzzer limit. The saved input passed 10,000 repeats under the original limit. A fresh read-only diagnostic showed that loading the full accumulated corpus alone crossed 512 MiB. An independent native reviewer approved **1024 MiB for the extended UR campaign only** after reviewing the attribution below. CI smoke remains at 512 MiB. AddressSanitizer, the two-second input timeout, maximum input length and application parser limits are unchanged. This calibration is not a fuzz pass or release approval.

## Reproducible evidence

- Frozen corpus: 2,768 files. The private diagnostic manifest records each filename, byte length and SHA-256. It must be retained with the final evidence bundle.
- Diagnostic executable SHA-256: `95f738e26fffc0b88f1614e9b4c83fd74b66ed3abe1d8c979c529df3daa86251`. Its cached Groot build output records source `6a95822aae4d7f11960ccb7bfef3af5806b8d9e8`. The original failed campaign did not record its executable digest, so byte identity with that campaign is unproven.
- Effective diagnostic `ASAN_OPTIONS`: `detect_odr_violation=0:allocator_may_return_null=0:print_stats=1:atexit=1`. The pinned `cargo-fuzz` version adds `detect_odr_violation=0`; the remaining flags supplied allocator statistics. The diagnostic used direct execution of the cached ASan executable.
- Under 512 MiB, saved-input replay passed 10,000 callbacks. Frozen-corpus loading stopped after 2,740 inputs with a 588 MiB reported peak; the failure snapshot showed 31.6 MB live heap and 250.8 MB in ASan quarantine. The mutation attempt also stopped during corpus loading. A prior diagnostic that invoked synchronous `vmmap` while the fuzzer ran was confounded by the two-second timeout and is excluded from the decision.
- Under the diagnostic 1024 MiB limit, saved-input replay passed 1,000 callbacks; frozen-corpus loading passed 2,769 executions with a 681 MiB libFuzzer peak. A 600-second mutation run passed 1,366,566 executions, adding 246 corpus units. Its peak was 687 MiB. Passive two-second `ps` samples were broadly 637–650 MiB after the initial phase and ended at 650 MiB. The run's allocator statistics report 77,190 MB allocated and 77,145 MB freed, with 85 MB of user bytes in quarantine at exit.

The corpus-loading peak before mutation, large quarantine, and later memory plateau support fuzzer/sanitizer overhead as the dominant reason the 512 MiB campaign stopped.

## Completed extended campaign

The required exact-source rerun completed on `ec940d22b06c5efe71c848801e8cefac1f4341d7` with exit code 0. LibFuzzer executed 10,775,143 cases over 7,201 fuzzing seconds and reported a 727 MiB peak. Passive telemetry recorded 3,533 nonzero samples: 556.5 MiB median, 726.9 MiB maximum and 557.9 MiB median during the final ten minutes (556.2–564.0 MiB). The run found no AddressSanitizer error, timeout, crash or invalid assertion. It ended with 3,705 corpus files.

The campaign wrapper recorded 7,586.927 seconds including build/setup, the same source commit at start and finish, a clean checkout at finish, the rebuilt executable SHA-256 `4b4fa108c1e19689fda372f024e11ad837a4423694f4b3c3377d7874b6d01888`, campaign-log SHA-256 `b524dc68a9eebf8ee0fa15bf9cff8743aa543c56500765e90bf80243e3e69f6c` and telemetry SHA-256 `0eb76c650b48cf0d5209d14dc4e54dfdf0ce662b99f3c3ee3daa163c2f48a84f`.

This closes the extended UR campaign required by the finishing plan. It is bounded fuzz evidence, not proof that every parser input is safe and not physical-camera certification.

## Review and acceptance

An independent native reviewer checked the executable digest, all frozen-corpus hashes, sanitizer flags, corpus-loading behavior and memory series before approving the campaign-specific allowance. A separate independent outcome review is recorded in [the independent review](post-5.3-independent-review.md). Neither review approves a product change, source hashes, physical hardware or release.
