# Phone and Miniscript human acceptance

Use this checklist with disposable Testnet4 bitcoin only. Record the desktop and iPhone commit shown in the build notes before starting. Never photograph recovery words or include wallet identifiers in a test report.

## What this test can approve

- A Groot phone can join and sign for a **Standard multisig** wallet.
- Partner and Family continuity can exchange PSBTs with an independently verified, compatible offline signer on Testnet4.

It cannot approve phone signers for Partner or Family continuity, direct USB signing for delayed policies, Mainnet continuity, or an entire hardware family. Miniscript candidates must still be certified by exact model, firmware and transport. Coldcard and Trezor are unsupported for delayed policies in this integration.

## 1. Pair a phone

Prepare one unlocked iPhone in Developer Mode and the matching desktop candidate. Select **Testnet4** on both.

1. On desktop, choose **Add wallet → Create multisig → Standard → 2 of 3**. Give the wallet a test name and continue to signers.
2. Choose **Add a Groot phone**. Desktop displays an invitation QR and a six-digit comparison code.
3. On iPhone, choose **Connect desktop app**, allow camera access, and scan the invitation.
4. Confirm the phone shows the expected wallet name, **Testnet4**, and **2 of 3**. Compare all six digits with desktop. Stop if anything differs.
5. Enter a phone name and a new local app PIN twice. Tap **Create phone key**.
6. Write down all 24 recovery words on paper. Do not save or photograph them. Complete the in-app backup check now, or verify that the app clearly marks the backup as still unverified.
7. Let desktop scan the encrypted QR displayed by the phone: choose **Scan phone QR code** on desktop and hold the phone steady.
8. Compare the six digits again. On desktop, tap **Six digits match — add signer**.
9. On iPhone, enter the local app PIN and tap **Desktop scanned this phone key**.
10. Add the other two independent signers on desktop. Review their fingerprints and the 2-of-3 policy.
11. Save and verify the public descriptor backup. Set the desktop wallet PIN and create the wallet.
12. Desktop displays the final wallet QR. Scan it on iPhone, review the threshold and first receive address, enter the phone PIN, and tap **Accept wallet policy**.
13. Confirm desktop and phone show the same first receive address. Lock and restart both apps; the same wallet must return on both.

## 2. Sign with the paired phone

1. Fund the wallet with a small amount of disposable Testnet4 bitcoin.
2. On desktop, prepare a small payment. Review the recipient, amount, fee, change, and proposal identity before displaying its unsigned PSBT QR.
3. On iPhone, choose **Sign desktop PSBT** and scan the desktop QR.
4. Review the recipient, amount, fee, change, network, wallet, and existing signatures on the phone. Stop if any value differs from desktop.
5. Enter a wrong PIN once. It must be rejected and the PIN field must clear. Then enter the correct PIN and tap **Sign this exact PSBT**.
6. On desktop, choose **Scan signed PSBT** and scan the phone response. Only the proposal just reviewed may change.
7. Add the remaining required signature, finalize, broadcast, confirm, restart desktop, and verify that the proposal and transaction history persist.
8. Repeat once while cancelling a QR scan, once after locking/backgrounding the phone, and once with an old or different proposal. Cancellation must be safe; stale or mismatched data must be rejected.
9. On a disposable replacement profile, choose **Restore Groot phone** on desktop. On iPhone choose the recovery flow, scan the desktop recovery QR, and enter the original 24 words only on the phone. Verify the fingerprint, policy, and first address match.

Completed-pair key revocation is not implemented. Removing a Groot profile does not erase a signing key retained by a lost phone. The wallet's threshold and the remaining signer backups are the recovery boundary.

## 3. Test Partner continuity

Use an external offline PSBT signer or tool that you have independently verified against the exact descriptor. Do not use a phone signer or Groot's direct USB flow.

1. On desktop, choose **Add wallet → Create multisig → Partner continuity**.
2. Confirm the screen says **Regtest and Testnet4 only**, **Offline PSBT only**, lists candidate signer families, and lists Coldcard, Trezor, and phone signers as unsupported.
3. Continue and verify the timeline exactly:
   - now: Owner, 2 of 3;
   - after 13,140 blocks: both partner keys;
   - after 39,420 blocks: either partner key;
   - after 52,560 blocks: 2 of 3 estate guardians.
4. Add every required public key in its named role by the offline/manual import flow. Review all fingerprints and roles.
5. Save the descriptor backup. Restore it into a clean disposable profile and independently verify the descriptor and first receive address before funding.
6. Fund with a small Testnet4 amount. Create a primary-path payment, export the PSBT, review and sign it offline, then import the signature. Groot must accept only the intended path, proposal revision, recipient, amount, fee, and change.
7. Create a primary-path renewal. Confirm it sends to a fresh owned address and restarts the delayed clock only after confirmation.

## 4. Test Family continuity

Repeat the previous section with **Family continuity** and verify this timeline:

- now: Parents, 2 of 2;
- after 13,140 blocks: one parent plus one child-assistance signer;
- after 52,560 blocks: 2 of 3 estate quorum.

Verify that a signature from the wrong role cannot satisfy a path and that Family assistance keeps requesting signatures until both required role groups have signed.

## 5. Test delayed paths on Regtest

The long delays cannot be approved in a normal Testnet4 session. Use the repository's deterministic Regtest/Core harness for Partner and Family:

1. Test every delayed path one block before, exactly at, and one block after maturity.
2. Test two inputs with different confirmation ages; the later input must control availability.
3. Sign partially, restart Groot, and finish signing. The selected path and existing signatures must persist.
4. Reorg an input below maturity; the delayed path must become unavailable. Reconfirm and mature it again before spending.
5. Test primary renewal before and after delayed maturity and verify the new confirmed output starts a new delay.
6. Restore the descriptor in a clean profile and verify the same paths, fingerprints, and first address.

## Stop immediately if

- the comparison code, descriptor, fingerprint, first address, network, amount, fee, recipient, change, or proposal identity differs;
- Partner or Family offers phone enrollment or direct USB signing;
- an unsupported signer is presented as compatible;
- an immature or wrong-role path can sign or spend;
- a stale PSBT updates another proposal;
- a restart loses accepted signatures or wallet state;
- recovery produces a different wallet.

Report pass or fail for each numbered section, plus iPhone/iOS version and exact hardware model/firmware. Do not include recovery words, PINs, descriptors, addresses, PSBTs, or pairing codes.
