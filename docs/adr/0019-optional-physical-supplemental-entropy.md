# ADR 0019: Optional physical supplemental entropy

- Status: accepted
- Date: 2026-08-09

## Context

Satchel already creates software wallets from exactly 256 bits requested from the native operating-system CSPRNG. Some advanced users want an independently performed physical input. Cursor movement and phone motion are not measurable independent entropy and add sensor, permission, automation, and false-confidence risks. Physical coin flips and dice rolls have a simpler, inspectable alphabet, but their fairness and transcription still cannot be verified by the application.

## Decision

Keep the 32-byte OS CSPRNG request mandatory and unchanged for ordinary creation. Offer a collapsed advanced option accepting either 128–256 `H`/`T` coin outcomes or 50–100 `1`–`6` six-sided-die outcomes.

The renderer records the transcript and sends it once to Rust, so it is adversarial supplemental input rather than a trusted secret boundary. Rust validates source, alphabet, and bounds; hashes a framed source/count/transcript using SHA-256 domain `Satchel supplemental entropy transcript v1`; then hashes a framed 32-byte OS value plus that digest under `Satchel BIP39 entropy mix v1`. The result is the 256-bit BIP39 entropy. Any OS RNG failure aborts creation even when a transcript exists. No fallback, XOR, truncation, arithmetic mixing, persistence, logging, analytics, or supplemental-only generation is permitted.

All transcript UI references are cleared when generation starts and on teardown; JavaScript strings are not claimed to be securely overwritten. Rust moves the deserialized transcript and digest into zeroizing storage. The UI states that physical input cannot protect a compromised device and makes no claim about measured supplemental entropy.

## Consequences

A predictable, repeated, malicious, or renderer-selected transcript cannot remove the independently secret OS input under the SHA-256 assumption. Correct physical input can add uncertainty if it is fair, independent, accurately recorded, and not observed. It cannot rescue a compromised renderer/host, prove a broken OS RNG, or make private-key compromise impossible. The new parser and mixing construction require boundary tests, threat-model maintenance, and independent review before mainnet release.
