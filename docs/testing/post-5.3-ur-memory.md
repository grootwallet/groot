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

The corpus-loading peak before mutation, large quarantine, and later memory plateau support fuzzer/sanitizer overhead as the dominant reason the 512 MiB campaign stopped. The 600-second result cannot exclude a slower or sequence-dependent parser leak. The 7,200-second ASan campaign with current-RSS telemetry and the full corpus is required to close this item.

## Review and acceptance

An independent native reviewer checked the executable digest, all frozen-corpus hashes, sanitizer flags, corpus-loading behavior and memory series. They approved the campaign-specific allowance and explicitly did not approve a product change, source hashes or release. The full campaign must report its exact source, command, elapsed time, execution count, corpus, current and peak memory, exit status and any sanitizer finding. If it fails, preserve and investigate the input before considering any further limit change.
