# Satchel architecture

## Product boundary

Satchel is an onchain-only Bitcoin wallet and multisig coordinator for desktop, iOS, and Android. The first functional build targets local regtest. Signet is the next remote integration network and Testnet4 is the final public-network rehearsal. Browser-only development uses deterministic dummy data; the Tauri composition root uses the real Rust adapter.

## Stack

- **Shell:** Tauri v2, using the shared Rust library entry point required by desktop and mobile.
- **Frontend:** SvelteKit in SPA mode with `adapter-static`; Svelte 5 and local shadcn-svelte-style primitives.
- **Wallet core:** Rust with `bdk_wallet` and its pinned Miniscript dependency, 24-word BIP39 recovery, BIP84 single-key descriptors, BIP48 `wsh(sortedmulti(...))` multisig descriptors, PSBTs, and SQLite persistence.
- **Hardware boundary:** Bitcoin Core HWI is behind `HardwareTransport`. The CLI is resolved only from an absolute build-time or operating-system installation path; it never searches `PATH`. It uses fixed arguments, null stdin, bounded concurrent output reads, and a timeout. USB is desktop-only; bounded PSBT/descriptor files are the current cross-platform path.
- **Current chain source:** `bdk_bitcoind_rpc` against the isolated local Bitcoin Core node. The Core `satchel-dev` wallet is only a faucet/miner and never owns Satchel keys.
- **Network boundary:** `ChainBackend` distinguishes local Core, authenticated remote Core, and public Esplora. HTTPS is mandatory remotely, URL credentials are rejected, and presets match exact endpoints. Only local Core is wired to sync today.
- **Secrets:** a random AES-256-GCM data key encrypts the mnemonic. The data key is independently wrapped by the Argon2id-derived credential key and a device key, and both must authenticate to open the envelope. Apple targets keep the device key in Keychain; other targets use the private application sandbox with owner-only files pending platform certification. SQLite contains watch-only descriptors and public wallet state.

## Trust boundary

The webview may receive addresses, balances, transactions, UTXOs, public descriptors, public cosigner metadata, PSBT summaries, and status events. It must never receive a generated mnemonic, seed, extended private key, private descriptor, or decrypted signing material. Production onboarding displays generated words through a platform-native backup sheet attached to the Satchel window and the command returns no secret. Browser-only deterministic fixtures are the explicit test exception. Recovery entry remains user-provided input that Rust validates and clears after use.

## Rust command surface

The single-key regtest surface adds `wallet_profiles` and `wallet_select`. `wallet_generate_mnemonic` performs native presentation and returns unit; `wallet_create(name, credential)` consumes the Rust pending session. The remaining surface includes `wallet_exists`, `wallet_recover`, `wallet_unlock`, `wallet_lock`, credential-confirmed `wallet_delete`, `wallet_snapshot`, `wallet_sync`, `address_create(label)`, `address_discard(id)`, `coin_set_frozen(outpoint, frozen)`, `fees_estimate`, `tx_prepare(..., coin_selection)`, and `tx_sign_and_broadcast(passphrase)`.

The descriptor coordinator surface adds hardware enumerate/xpub/sign/address-display verification commands and `hardware_check_cosigner`; multisig preview/create/snapshot/sync/address commands; persisted proposal prepare/list/import/cancel/finalize/broadcast commands; and descriptor export/recovery-drill/recover/delete commands. USB health requires an exact enumerated fingerprint match. Offline sources return only a public-record validation result. The native boundary rejects browser-only virtual cosigners for preview, creation, recovery-policy compilation, and backup import. Preview and creation parse origin-aware tpubs and generate checksummed external/change descriptors in Rust. Multisig state always routes to its separate watch-only BDK database. Imported PSBTs converge on one bounded Rust validator that rejects changed transactions, unknown origins, non-ALL sighashes, and externally finalized inputs.

Guided setup uses `recovery_policy_analyze` and `multisig_recovery_create` to compile and persist canonical WSH descriptors and timed paths. Funding and immediate-path spending are available; coordinator-assisted delayed-path satisfaction remains blocked until the funded timelock gates in ADR 0006 pass. Decaying and expanding templates remain preview-only.

Commands return typed errors with stable codes. Svelte translates those into inline validation and toasts.

## Persistence model

- BDK changesets and chain state are persisted transactionally in SQLite.
- Address labels are written in the same transaction as address revelation and are immutable by schema/command design.
- Multiple external addresses may have `awaiting_payment = true` concurrently. Creating one does not mutate earlier requests. Discarding targets one address by derivation index and is allowed only when it has no observed transaction; it marks that address retired without making BDK forget or stop monitoring it.
- Frozen outpoints are stored separately from BDK chain state. Automatic builders mark all frozen outpoints unspendable. Manual builders accept only the exact validated outpoint set and reject frozen inputs.
- Authenticated decryption of the encrypted mnemonic is the independent credential verifier. The same credential remains the BIP39 passphrase and app unlock/signing PIN. A wrong value fails before private wallet reconstruction, so it cannot silently open the alternate BIP39 wallet.
- Unlock state is scoped to the selected wallet UUID, expires after five minutes of inactivity using a monotonic timer, and is cleared on wallet switching or explicit lock. Failed-authentication counters and retry deadlines are persisted per wallet, so restarting the app does not reset a cooldown.
- Every wallet has a registry profile and UUID-isolated directory. Selected-wallet routing applies to single-key and multisig commands. Legacy singleton directories migrate only if both descriptor identity and storage validate; interrupted migration rolls back.
- Single-key and multisig proposals persist before review is returned. Restart reloads the exact PSBT rather than reconstructing it from UI fields.
- Wallet deletion requires the selected wallet credential plus explicit confirmation, rejects symlink/non-directory targets, atomically retires the directory name, and removes local files. Multisig deletion additionally requires a successful recovery drill bound to the current descriptor and exact name/PIN confirmation.

## Sync and notifications

The UI requests foreground sync and consumes durable Rust markers for receipts, first confirmations, and broadcasts. Delivery is at-least-once across a crash boundary: rows remain pending until the webview explicitly acknowledges their stable IDs, uniqueness prevents duplicate rows, and the toast layer is idempotent within a session. Persistent transaction state remains authoritative. Background/resume scheduling remains before a public-network build.

## Transaction flow

Fee estimates are presented as economy, standard, and priority rates plus a validated custom sat/vB rate. Automatic selection excludes frozen coins; manual selection calls BDK `add_utxos` plus `manually_selected_only`. `tx_prepare` returns a summary derived from the unsigned PSBT, including its actual inputs and the integer fee rate actually applied by BDK. The UI reviews only that returned summary. `tx_sign_and_broadcast` reconstructs or validates the pending proposal, unlocks with the passphrase, signs in Rust, broadcasts idempotently by expected txid, and atomically commits broadcast state with its notification before returning the best available snapshot. A post-broadcast sync failure is disclosed as pending instead of reporting a false broadcast failure.

## Current milestone limits

Multiple isolated single-key and multisig profiles are supported. There is no arbitrary Miniscript editor, delayed-branch coordinator signing, Lightning, RBF/CPFP UI, address-label editing, fiat transaction support, or background push while the app is fully terminated. The staged removal of these limits is canonical in `docs/roadmap.md`.

Mainnet is a compile-time-disabled release gate, not a selectable prototype option. ADR 0012, the threat model, physical-device matrix, reproducible build evidence, and end-to-end recovery checklist must all pass before a dedicated mainnet change may be reviewed.
