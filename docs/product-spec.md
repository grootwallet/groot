# Product behavior

Canonical behavior for the current rc02 source. [Current status](implementation-status.md) separates implementation from release certification. Public Mainnet approval remains bound to v0.5.1 commit `c731fa1c`; later candidates require their own authorization.

## Wallets and credentials

Groot is an onchain wallet for software keys, a single hardware signer, and standard multisig. Software wallets use BIP84 `wpkh`; multisig uses BIP48 `wsh(sortedmulti)`. Account 0 uses the active network's coin type. Standard setup defaults to 2 of 3; it must not infer a restored backup's threshold or keys from that default.

- Software: 24 BIP39 words plus the exact wallet passphrase. The passphrase also unlocks and signs in Groot. New creation requires at least 16 Unicode characters without composition rules; recovery accepts the historical non-empty passphrase. It cannot be changed or reset without selecting another Bitcoin wallet.
- Hardware/multisig: an independent app PIN protects local public-wallet access. It is not the device PIN, hardware passphrase or seed backup. Settings → Security can change it with current/new confirmation; success locks that wallet. Interrupted rotation preserves recovery with the old PIN.
- Wrong credentials return `invalid_credential`, never a different wallet. Clear credential fields after success, failure and teardown; never log them.

## Create and restore

Software creation requests exactly 32 bytes from the OS CSPRNG in Rust and fails if entropy is unavailable. Optional bounded coin-flip/die transcripts mix with, never replace, that source. Recovery words and signing secrets never enter the webview.

Native backup/recovery sheets require an explicit privacy gate. Users record the 24 words and reconstruct their exact order from a shuffled pool. **Verify later** leaves a durable reminder; merely viewing the words does not verify a backup. Later verification requires fresh passphrase authorization. Recovery supplies the complete mnemonic through native UI and counts as verification. Unsupported native platforms fail closed. Groot warns against digital capture but does not override user-initiated OS screenshots (ADR 0078).

After creation show the public master fingerprint, with copy, and an optional watch-only descriptor disclosure. Neither can restore a software wallet without its words and passphrase.

Hardware import accepts bounded public BIP84 descriptor/xpub material over device, file, text or supported QR. Reject private data, wrong networks and ambiguous origins. Prove the device's account identity before accepting it; a fingerprint alone is insufficient.

Standard multisig restoration accepts public BSMS, Groot JSON or narrowly supported descriptor text. Read the threshold, origins and signers from the backup. Verify the derived first address; users may reshare public keys from devices. PDF is a human-readable backup view, not an import format. Timelocked **Recovery** creation is disabled with **Coming soon**, as is Assisted recovery. Existing delayed-policy profiles remain compatible; their detailed semantics are recorded in ADRs 0042/0044 and are not a certified creation feature.

Creation offers no other-wallet network-copy option. Existing Settings reuse remains explicit and copies only independently protected connection settings, never history or scan state.

## Profiles, sessions and networks

Wallet UUIDs, databases and credentials are isolated. Exact canonical receive descriptors determine duplicate identity; checksums do not. A duplicate opens its authoritative existing profile. Local wallet/signer names are editable without changing identity or keys.

Each wallet has an independent inactivity session. Switching does not lock other wallets; background reads do not extend idle deadlines. Explicit lock cancels coordinated activity before exposing the locked route. One native process owns each app-data root.

The multi-network desktop app switches Regtest/Testnet4/Mainnet through global Settings and a confirmed restart. Each network owns separate wallet/node state. Global appearance, build identity and cached public network status remain available while locked; wallet operations and node credentials require unlock.

## History and connectivity

Before first history verification, do not present a numeric balance as verified. Ask for privacy approval: use Groot's network for simplicity and speed, or set up a private node. Approval saves genesis height 0 and starts a resumable scan. Declining opens the Bitcoin Core connection dialog directly. Partial observations do not block an explicitly targeted genesis retry (ADRs 0084/0085).

Settings owns authenticated birthday, recovery gap and full-rescan controls. A birthday must precede possible wallet activity and cannot exceed the verified tip. Gaps remain 20–1,000 and cannot be reduced below already revealed receive/change runs. A pruned node must retain required history; errors show the native retention facts and a retry. Progress reaches 100% only after pending transactions and the atomic result are reconciled. Lock/restart can reattach to saved progress; cancellation never presents discarded run progress as completed history.

- Core is the fee/broadcast/mempool authority. Local Core is loopback-only. Custom remote Core uses validated HTTPS or explicit Tor routing for a v3 onion; credentials never appear in URLs. Wrong chain/genesis, unavailable fees and missing permissions fail explicitly with no silent fallback.
- Managed Mainnet enrolls a per-wallet principal inside Rust, encrypts its password, and verifies Core/index agreement and matched full blocks. Its operator can associate public script history with the connection. Keys and labels are not sent. Returning to managed access is explicit, not a fallback.
- Compact filters are opt-in, confirmed-only test-network activity discovery; Core still owns fees/broadcast. Manual peers/Tor never fall back to public discovery. [Deferred work](compact-filter-deferred-work.md) limits recovery/cache/platform claims.

The selected unlocked wallet syncs on a 35-second post-attempt cadence. Slow work coalesces. Explicit scans and exclusive actions pause it. Failed refreshes retain committed data with a durable retry state. Terminated-app push is unavailable.

## Receive and labels

Every revealed receive address atomically gets one to five non-empty permanent labels. Tab commits a label token in both Receive and unknown-source labeling. Label text can be reused to group activity; assignments and history cannot be edited or erased. Unknown-source initial labeling is available only for an eligible unlabeled external received output.

Allow concurrent payment requests. Only an unused awaiting-payment address may be discarded: remove it from presentation while continuing to monitor it. Confirmation shows the exact target and labels. Never reveal beyond the recoverable gap.

Full address/xpub views group four characters with a short final block; copy returns the exact unspaced value. Descriptor view/copy/QR/export presents one public receive/change multipath descriptor.

Hardware address verification is address-specific. Discovery candidates use amber **Select to identify**; selected-device unlock instructions remain distinct. Fresh full-account identity proof precedes device display, policy registration and signing. Standard multisig must have policy/first-address verification on enough signers to intersect every signing quorum before receiving. Policy first-address detail uses the same comparison/derivation component as Receive for all devices.

BIP329 exports representable public labels/spendability deterministically. Import is bounded, additive and atomic: conflicts leave the wallet unchanged. Restored-wallet address ownership is derived in Rust across receive indexes 0–9,999 plus indexed ownership. Matching xpub records report matched signer keys and preserve current editable signer names. Labels are not a seed/descriptor backup or live synchronization protocol.

## Send, coins and activity

Use integer satoshis and positive validated sat/vB rates. Economy/Standard/Priority come from the exact configured Core backend; unavailable estimates stay unavailable. A validated custom rate remains possible. Regtest alone has a deterministic fee policy.

Coin selection offers automatic strategies or exact eligible inputs. Frozen coins never enter either path. Review explains amounts, fees, change and source linkage from the actual unsigned PSBT. Self-transfers show Rust-proven **Consolidating** totals and a fee-only wallet debit; labels do not prove ownership.

Proposals and collected signatures persist across restart. Leaving signing preserves the proposal; discarding requires confirmation. Each imported partial signature must cryptographically verify against the unchanged proposal. Final authorization rechecks wallet/session identity, canonical prevouts, outputs and policy before broadcast. A successful broadcast remains success if later sync fails; show the pending refresh separately.

RBF preserves the intended recipient amount; CPFP spends an eligible wallet output. Failed or stale quotes block signing. Before final submission verify the original is still in the configured mempool. A confirmed original leaves the saved proposal read-only with explicit discard; never erase the confirmed payment. Separate RPC checks and submission are not atomic.

Mainnet final-PSBT caps remain **100,000 sats fee** and **1,000,000 sats recipient plus fee**, including acceleration. Sparse estimates are capped, not extrapolated without bound.

Activity paginates committed history and retains it on failed later reads. Reuse counts canonical external outputs, including spent receipts; replaced/evicted transaction versions do not create phantom receipts. Preserve original history and labels. Receipt/first-confirmation notification markers persist atomically and are acknowledged idempotently for the current wallet/session.

## Delete and local utilities

Deletion requires the selected wallet credential, exact DELETE, and backup acknowledgement. Software additionally requires separately backed-up passphrase acknowledgement. An empty unverified software wallet may be deleted; a funded one requires a successful native backup test. Multisig retains its public-descriptor recovery test. Run deletion on a worker, preserve other profiles and provide durable errors. This is file removal, not secure flash erasure.

Appearance/language/discreet/zoom preferences stay local. EN/FR/ES translate product copy, never user/protocol data. Discreet mode hides wallet data and optional actions, not underlying history. Public build version/commit is visible and explicitly copyable.

App logs contain allowlisted lifecycle/outcome codes and safe scalar context, never credentials, keys, descriptors, PSBTs, full identifiers, endpoints, names, labels or amounts. Logs are optional diagnostics, not the wallet ledger. Copy/export and explorer opening are explicit; explorer access discloses the privacy tradeoff.

## Exclusions

No cloud backup, editable permanent labels, Lightning, address book, arbitrary policy editor, terminated-app push or Payjoin sessions. Public platform support and future policy/services require the [roadmap](roadmap.md) gates. The Apache-2.0 core must remain recoverable and usable without paid services.

## Retained mobile coordination track

Refs #6; Regtest/Testnet4 only. A phone creates an independent BIP48 signer using native 24-word backup/recovery and an empty BIP39 passphrase. Its app PIN protects the local signer envelope and does not select another seed. Desktop receives public key material through authenticated BIP129 setup, then sends the exact final policy for phone verification. Signing uses independently reviewed PSBTv0/crypto-PSBT; desktop accepts only signatures against its unchanged persisted proposal. No relay or secret synchronization is implemented.

Phone keys still use a portable PIN envelope, accurately marked testnet-only. Secure Enclave/Keychain wrapping and Android native secret UI remain release blockers. PIN changes for phone signers fail closed until all encrypted files can rotate atomically; existing hardware/coordinator PIN rotation remains available. QR cancellation, staging and replacement-word recovery preserve device-local custody.
