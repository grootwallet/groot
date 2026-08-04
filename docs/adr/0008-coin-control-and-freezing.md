# ADR 0008: explicit coin control and persisted freezing

Status: accepted

## Decision

Automatic BDK coin selection remains the default. Users may select exact UTXOs in Coins or Send. Manual transactions use only those inputs. Frozen outpoints persist in the wallet SQLite database and are unavailable to both selection modes until explicitly unfrozen.

## Safety properties

- Rust validates outpoints against the current BDK unspent set.
- Automatic selection passes every frozen outpoint as unspendable.
- Manual selection rejects empty, malformed, unavailable, or frozen sets and uses `manually_selected_only`.
- Transaction review reports inputs from the actual PSBT.
- Freezing does not delete or hide history and never changes ownership.

## Consequences

The UI can offer privacy-oriented control without changing the default send flow. Future multi-wallet support must scope frozen outpoints to a wallet ID and migrate the current per-database table unchanged.
