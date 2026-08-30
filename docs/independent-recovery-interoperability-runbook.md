# Independent recovery and interoperability runbook

Status: required first-mainnet evidence; use Testnet4 until the reviewed
mainnet candidate exists.

This runbook uses disposable public-network funds and public descriptor/PSBT
material. Public descriptors, addresses, transaction identifiers, PSBTs, and
device fingerprints are private financial metadata even though they cannot
spend by themselves. Never paste them into chat, issues, logs, screenshots, or
the repository. Mnemonics, wallet credentials, and hardware-wallet recovery
words must never enter another coordinator or an online computer.

## Fixed roles

- **Source:** the exact signed/notarized Groot candidate and one disposable
  standard BIP48 Testnet4 wallet with a small confirmed balance.
- **Recovery wallet:** a descriptor-aware wallet implementation not derived
  from Groot, on a genuinely clean machine or clean operating-system account.
- **Coordinator A and Coordinator B:** two independently maintained wallet or
  signer implementations that accept the standard public descriptor/BSMS and
  PSBT file formats needed for the exercised round. They must not be two skins
  over the same library or one copied application profile.
- **Signers:** only already-backed-up disposable hardware signers. Record exact
  model, firmware, vendor Bitcoin-app version where applicable, transport, HWI
  or coordinator version, host OS, date, and candidate commit. Do not record
  identifiers.

The release owner must approve the named Recovery wallet, Coordinator A, and
Coordinator B before the run. Record their independently downloaded package
hashes or signature-verification result locally.

## Phase 1 — freeze and protect the source

1. Confirm Groot's visible version and short commit match the candidate record.
2. Confirm Bitcoin Core is fully synchronized to Testnet4 and the source wallet
   is up to date.
3. Confirm the wallet has only a small disposable confirmed balance and no
   production key, seed, label, or transaction history.
4. In Groot, open the standard multisig wallet's backup flow. Export both the
   public BSMS record and the complete Groot public recovery JSON through the
   native save dialog to owner-controlled removable storage.
5. Run Groot's built-in recovery check against each export. Compare only inside
   the applications; do not copy values into the evidence note.
6. Quit Groot. Make a read-only safety copy of the exported files. Do not alter
   or delete the source profile.

Expected result: both exports validate, the source remains unchanged, and no
secret appears in either file. Stop if any export contains private key material
or if the derived first-address comparison fails.

## Phase 2 — independent watch-only recovery

1. On the clean recovery machine/account, install and verify the approved
   descriptor-aware wallet without copying any Groot profile or database.
2. Create a new **watch-only Testnet4** wallet by importing the public BSMS or
   receive/change descriptors. Never enter a mnemonic, PIN, app passphrase, or
   hardware recovery words.
3. Connect that wallet to an independently configured, fully synchronized
   Testnet4 backend.
4. Compare the first receive address and one later unused receive index with
   Groot's built-in recovery-check result. Compare locally and record only
   match/no-match.
5. Sync from a birthday before the known disposable funding transaction.
6. Verify the recovered confirmed balance and transaction count match Groot.
7. Quit and reopen the recovery wallet, resync, and verify the same public
   state persists.

Expected result: both descriptor branches derive identically, known history is
recovered, no signing capability exists in the recovery wallet, and restart
does not change the result. A mismatch is release-blocking.

## Phase 3 — Coordinator A PSBT round trip

1. Reopen Groot and prepare one small Testnet4 payment to a freshly controlled
   external recipient. Record only the amount and fee category in the sanitized
   worksheet, not the address or transaction identifier.
2. Review Groot's recipient, amount, fee, change, inputs, and locktime; export
   the exact unsigned PSBT through the native file dialog.
3. Import that file into Coordinator A. Confirm it identifies the same network,
   recipient, amount, fee, change, and policy. Stop on any mismatch.
4. Sign with exactly one approved disposable signer through Coordinator A, then
   export the partially signed PSBT. Do not finalize or broadcast it there.
5. Import the result into Groot. Groot must accept exactly one valid new
   signature while preserving every reviewed non-signature field.
6. Quit and reopen Groot. Verify the proposal and one-signature count persist.
7. Complete the threshold through Groot with a different approved signer,
   finalize, broadcast, confirm, restart, and verify accounting.

Expected result: one external signature is accepted once, the canonical
transaction is unchanged, and the completed payment reconciles after restart.

## Phase 4 — Coordinator B reverse-direction round trip

1. Using the recovered public descriptor in Coordinator B, construct a second
   small Testnet4 payment from a different confirmed disposable output.
2. Before signing, compare Coordinator B's recipient, amount, fee, change,
   inputs, locktime, network, and policy with the intended payment.
3. Export its unsigned PSBT and import it into Groot as an existing-wallet
   proposal. Groot must reject it if it is not attributable to the exact saved
   wallet or if any required metadata is missing.
4. If accepted, use Groot to add exactly one signer signature and export the
   partial PSBT.
5. Import that result into Coordinator B. It must show the same transaction and
   exactly one valid signature.
6. Complete the threshold with a different signer in Coordinator B, then return
   the fully signed PSBT to Groot for validation, finalization, and broadcast.
7. Confirm, restart both applications, and compare transaction state and wallet
   accounting locally.

Expected result: both directions preserve the same PSBT, each implementation
validates the other's signature, and neither silently rewrites transaction
fields. If a coordinator cannot preserve standard BIP48 origins or PSBT global
xpubs, record it as incompatible; do not work around it by weakening Groot.

## Phase 5 — negative and cleanup checks

1. Repeat one import with a PSBT from a different disposable wallet. Groot must
   reject it without changing the saved proposal or signature count.
2. Repeat one import with an unsigned copy older than the current proposal.
   Groot must add no signature and change no reviewed field.
3. Cancel any remaining disposable proposal through the normal confirmation
   flow.
4. Preserve the untouched Groot source and the minimum sanitized evidence.
   Securely remove disposable PSBT/address/descriptor working copies from the
   test machines and removable media according to the operator's normal
   deletion policy; do not claim forensic erasure.

## Sanitized evidence record

Record only:

- exact Groot version and full commit;
- operating systems and architectures;
- recovery wallet and coordinator names/versions plus package verification;
- exact hardware models, firmware, app versions, and transports;
- Testnet4, date, reviewer identities/independence, and pass/fail per phase;
- whether address, balance, history, policy, transaction review, signature
  count, confirmation, restart, and accounting matched; and
- limitations or incompatibilities.

Never retain values that identify the wallet, devices, node, or transactions.
This Testnet4 run supports the final decision but does not certify a later
mainnet binary or replace independent source and enablement-diff review.
