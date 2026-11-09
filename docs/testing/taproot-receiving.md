# Taproot receiving verification

The feature branch starts from `eb715a678d692ecf74a879ea49626dd4106753ee`. This record separates isolated Bitcoin Core tests, native build checks and device rehearsal. Use disposable profiles, test bitcoin and a separate data root for each network. Keep backup words, passphrases, public descriptors, payment addresses, transaction IDs and RPC credentials out of shared evidence.

## Isolated Bitcoin Core Regtest

Run `pnpm test:integration:regtest` with `bitcoind` and `bitcoin-cli` on `PATH`. The harness allocates fresh loopback ports and data directories and cleans up its own nodes. The software Taproot case exercises two labelled receive addresses, a label-write rollback, an independently derived receive/change pair, descriptor-verified clean recovery, a spend of both recovered outputs and balance/history after reopening. It asserts that both input witnesses contain only a Schnorr signature, and Bitcoin Core must accept and confirm the transaction. The test invokes the native descriptor, receive, PSBT validation and signing-wallet functions. Native backup sheet interaction and Tauri IPC require separate UI evidence.

On 2026-11-08, `funded_taproot_software_reopens_recovers_and_spends_with_key_path` passed against a disposable Bitcoin Core 31.1.0 node on Apple silicon macOS. Core matched receive indexes 0 and 1 and change index 0. A clean rescan restored 350,000 sats across two payments. Core confirmed the two-input key-path spend, and the reopened wallet retained the confirmed spend and its change. Native review reported both BIP86 input paths and the BIP86 change path. This was a focused Rust library test using the Regtest build network and the same node startup/cleanup scripts as the full harness.

### Independent offline Core signer probe

On 2026-11-08, a separate Bitcoin Core 31.1.0 probe used a funded Regtest coordinator and a fresh network-disabled Regtest signer at height 0. Each one-input draft contained its full previous transaction, the selected Taproot leaf and control block, the eligible key origins, and the exact sequence for that path. The signer tried each disposable account independently.

| Policy  | Selected path | Sequence or delay | Expected signer set                        |
| ------- | ------------- | ----------------- | ------------------------------------------ |
| Partner | Owner         | `0xfffffffd`      | Any two of the three owner keys            |
| Partner | Together      | 13,140 blocks     | Both partner keys                          |
| Partner | Solo          | 39,420 blocks     | Either partner key                         |
| Partner | Estate        | 52,560 blocks     | Any two of the three estate keys           |
| Family  | Parents       | `0xfffffffd`      | Both parent keys                           |
| Family  | Assistance    | 13,140 blocks     | One parent and one child-assistance key    |
| Family  | Inheritance   | 52,560 blocks     | Any two of the two child keys and executor |

Core's `walletprocesspsbt` with the full descriptor and `finalize=false` added signatures for alternate leaves, even when the draft included one leaf and its exact sequence. This includes the Partner keys shared by Together and Solo, and the parent keys shared by Parents and Assistance. Groot requires only the selected leaf's signatures.

The stateless `descriptorprocesspsbt` RPC with one private `pk()` descriptor for the signer's specific derivation returned a single selected-leaf signature from each eligible signer and no signatures from other signers. Core combined those responses and finalized a witness containing the expected script for all seven paths. This is an offline software-signer probe. The funded Rust cases separately exercise coordinator import, path thresholds, maturity and broadcast.

To reproduce, derive each disposable account at `m/48'/1'/0'/3'` in independent offline software. Enrol only its root fingerprint, account tpub and origin in the native Regtest coordinator. On the offline signer, review the unsigned payment, the selected leaf, expected origins, sequence and the prevouts. Supply only the signer's concrete `pk([FINGERPRINT/48'/1'/0'/3']ACCOUNT_PRIVATE_KEY/BRANCH/INDEX)` descriptor for each applicable input index, with the checksum from Core `getdescriptorinfo`. The first receive input uses branch `0` and index `0`. Run `bitcoin-cli -regtest -datadir=OFFLINE_ROOT -rpcport=OFFLINE_RPC_PORT -stdin descriptorprocesspsbt`. Pass each positional argument on its own line from a protected local process.

1. The unsigned PSBT.
2. A JSON array of the concrete, checksummed `pk()` signer descriptors.
3. `DEFAULT` for the sighash.
4. `true` to retain key origins.
5. `false` to return the partial PSBT.

Use a network-disabled Core process in a separate data root. Keep private arguments out of shell history, process arguments, terminal transcripts and transfer files. Return the `psbt` value only and let Groot check each signature against its own reviewed transaction and exact leaf. This evidence covers disposable Regtest software keys. General-purpose and physical signers require separate acceptance.

## Browser fixtures

The focused Playwright run passed 16 cases across desktop Chromium at 1180×780 and mobile WebKit at 390×844. It covers the BIP84 default, explicit BIP86 setup and restore, descriptor copy and retry, labelled receive, the native phone and hardware limits, and legacy recovery and backup. The synthetic desktop-Regtest Continuity bridge exercises manual-only account entry, the first-address match, saving the native JSON without rewriting it, and advancing to the app PIN. These cases exercise presentation and orchestration. The isolated Core tests exercise spend and restore.

The optional-control follow-up checks the closed default, the shared tooltip, the Taproot-only requirements, the gap before the Continuity timeline and the correct Taproot type in Receive details. The UI change has no BIP or persisted-format impact.

## Testnet4 physical rehearsal

1. Record the exact candidate commit, executable digest, platform and OS, Bitcoin Core version and build identity. Use the fixed Testnet4 development configuration or an exact-commit approved internal package. Follow the candidate approval rules before accepting an installable handoff. Confirm the selected network, Testnet4 genesis, completed Core initial sync and retained history before connecting Groot. Use a dedicated RPC credential in the native form. [Candidate approval](../adr/0109-external-internal-candidate-approval.md), [Testnet4 Core setup](testnet4-local-mac.md).
2. In a disposable macOS app data root, open new-wallet setup and verify that **Address options** is closed. Open it, verify the Native SegWit default and check the address-type tooltip. Select Taproot, complete the native backup sheet and retain the 24 words, exact passphrase and public descriptor separately. Relaunch, unlock and verify the selected type. Check the create, restore and receive layouts at desktop and phone widths using the browser fixture as needed, including keyboard access to the label field and primary action. Record the macOS native sheet separately from the responsive layout.
3. Create two payment requests with different permanent labels. Confirm that blank and duplicate label drafts reveal no address and that the next valid request uses the next index. Compare the exact copied and scanned `tb1p` targets, receive/change branches and indexes with the exported multipath descriptor and Bitcoin Core. Check the exported descriptor with Core `getdescriptorinfo` and use `deriveaddresses` to compare the output scripts and indexes. Verify a wrong-network recipient or recovery descriptor fails before creating a proposal or profile. Testnet4 shares the `tb` prefix and test extended-key version with other networks, so establish chain identity from the configured backend and its genesis.
4. Fund both requests from a separate Testnet4 wallet. Confirm through Core, sync in Groot, and verify the confirmed total, received activity and retained permanent labels. Restart and repeat the checks. Save and inspect a public descriptor export without taking a screenshot of the backup sheet.
5. Recover the wallet into clean app storage using the recorded public descriptor, the native 24-word sheet and exact passphrase. First try a different passphrase and mismatched or invalid descriptor. Confirm the app stops without opening a different profile. Recover with the correct inputs, approve history discovery, scan from a birthday before the test payments, and compare both receive scripts, the public descriptor checksum and the confirmed history. Descriptor recovery restores wallet identity and chain history. Verify permanent labels separately using the supported label interchange when that evidence is needed.
6. Spend the recovered inputs to a separate Testnet4 address. Compare the reviewed recipient, integer-satoshi amounts, fee and `tb1p` change with Core. Check the key-path witness and confirmation. Relaunch and verify the final balance, input history and change ownership. Keep transaction identifiers out of the rehearsal record.
7. Try the hardware, phone pairing and existing Continuity setup flows. Confirm that Testnet4 exposes Taproot only for the macOS software wallet and that the native Taproot Continuity setup and restore gates reject Testnet4. Verify unsupported signer actions reject before reveal, policy approval or signing. Retain device model, firmware and observed rejection if a physical device is used. [Hardware certification](../hardware-certification.md).
8. Open an existing Native SegWit wallet with a verified backup in a separate disposable root. Check that existing address history, labels, change and backup identity survive an unlock, sync, and restart without rewriting its descriptor. Exercise the offline, wrong-chain node, cancelled native backup sheet and retry states while checking for unexpected persisted changes.

## Mainnet gate

Use descriptor and address vectors and native network checks for Mainnet correctness. Activation and distribution require a Taproot-specific Mainnet decision, threat-model review and completion of the release checklist against the exact candidate. [Mainnet threat model](../mainnet-threat-model.md), [Mainnet release checklist](../mainnet-release-checklist.md).
