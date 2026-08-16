import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const emptyState = readFileSync(
  new URL('./HardwareDeviceEmptyState.svelte', import.meta.url),
  'utf8'
);
const addressComparison = readFileSync(
  new URL('./HardwareAddressComparison.svelte', import.meta.url),
  'utf8'
);
const verificationFlow = readFileSync(
  new URL('./HardwareReceiveVerification.svelte', import.meta.url),
  'utf8'
);
const singleKeyReceive = readFileSync(
  new URL('../../routes/receive/+page.svelte', import.meta.url),
  'utf8'
);
const multisigReceive = readFileSync(
  new URL('../../routes/multisig/receive/+page.svelte', import.meta.url),
  'utf8'
);
const hardwareDeviceList = readFileSync(
  new URL('./HardwareDeviceList.svelte', import.meta.url),
  'utf8'
);
const signerSummary = readFileSync(new URL('./SignerSummary.svelte', import.meta.url), 'utf8');
const hardwareSetup = readFileSync(
  new URL('../../routes/hardware/new/+page.svelte', import.meta.url),
  'utf8'
);
const singleKeySend = readFileSync(
  new URL('../../routes/send/+page.svelte', import.meta.url),
  'utf8'
);
const multisigPolicy = readFileSync(
  new URL('../../routes/multisig/+page.svelte', import.meta.url),
  'utf8'
);
const multisigSetup = readFileSync(
  new URL('../../routes/multisig/new/+page.svelte', import.meta.url),
  'utf8'
);
const multisigSend = readFileSync(
  new URL('../../routes/multisig/send/+page.svelte', import.meta.url),
  'utf8'
);
const settings = readFileSync(
  new URL('../../routes/settings/+page.svelte', import.meta.url),
  'utf8'
);
const overview = readFileSync(new URL('../../routes/+page.svelte', import.meta.url), 'utf8');
const deviceDetails = readFileSync(new URL('./DeviceDetailsModal.svelte', import.meta.url), 'utf8');
const policyReview = readFileSync(new URL('./SignerPolicyReview.svelte', import.meta.url), 'utf8');
const coins = readFileSync(new URL('../../routes/coins/+page.svelte', import.meta.url), 'utf8');

describe('hardware receive verification UI', () => {
  it('keeps one shared verification component in both receive flows', () => {
    for (const route of [singleKeyReceive, multisigReceive]) {
      expect(route).toContain('<HardwareReceiveVerification');
      expect(route).not.toContain('<TrezorPinModal');
    }
    expect(verificationFlow).toContain('<HardwareAddressComparison');
    expect(addressComparison).toMatch(
      /<summary>\s*<span>Address details<\/span>\s*<ChevronDown size=\{14\}\s*\/>\s*<\/summary>/
    );
    expect(appCss).toMatch(
      /\.verification-details\[open\] summary svg\s*\{\s*transform:\s*rotate\(180deg\);\s*\}/
    );
  });

  it('centralizes the bounded PIN and retry presentation', () => {
    expect(verificationFlow).toContain('walletService.promptHardwarePin(device.id)');
    expect(verificationFlow).toContain('walletService.sendHardwarePin(pinChallenge, positions)');
    expect(verificationFlow).toContain('<TrezorPinModal');
    expect(verificationFlow).toContain('Scanning again so you can verify the unchanged address.');
    expect(multisigPolicy).toContain('lockedDeviceForHealthCheck');
    expect(multisigPolicy).toContain('<TrezorPinModal');
    expect(multisigPolicy).toContain('Resuming the signer health check.');
  });

  it('exposes the shared identity health check for external single-key signers', () => {
    expect(overview).toContain('<strong>Health check</strong>');
    expect(overview).toContain('walletService.checkHardwareExternalSigner');
    expect(overview).toContain('<DeviceDetailsModal');
    expect(settings).toContain('Hardware signer identity &amp; health');
    expect(settings).toContain('walletService.checkHardwareExternalSigner');
    expect(settings).toMatch(/<LocalTimestamp\s+value=\{signerHealth\.checkedAt\}\s*\/>/);
    expect(settings).toContain("'Not checked'");
    expect(settings).toContain('accountStandard="BIP84"');
    expect(settings).toContain('<DeviceDetailsModal');
    expect(deviceDetails).toContain("accountStandard = 'BIP48'");
    expect(deviceDetails).toContain('saved ${accountStandard} account key');
  });

  it('uses a deliberate retry status instead of an unstyled empty-list paragraph', () => {
    expect(emptyState).toContain('class="hardware-device-empty" role="status"');
    expect(emptyState).toContain('onclick={onretry}');
    expect(emptyState).toContain('Scan again');
    expect(verificationFlow).toContain('<HardwareDeviceEmptyState');
    expect(verificationFlow).not.toMatch(/\{:else\}<p>No compatible/);
  });

  it('uses signer terminology throughout the multisig receive flow', () => {
    expect(verificationFlow).toContain('No compatible signer found');
    expect(verificationFlow).toContain('Connect and unlock a signer saved in this wallet policy');
    expect(verificationFlow).not.toMatch(/cosigner/i);
  });

  it('limits receive verification discovery to signers saved in the wallet', () => {
    expect(verificationFlow).toContain(
      'walletService.listHardwareDevicesForTypes(eligibleDeviceTypes)'
    );
    expect(verificationFlow).toContain('eligibleFingerprints');
    expect(multisigReceive).toContain('{eligibleDeviceTypes}');
    expect(multisigReceive).toContain('{eligibleFingerprints}');
    expect(verificationFlow).toContain('ignores other connected device families');
    expect(deviceDetails).toContain('Other connected device families are ignored.');
  });

  it('reuses one bounded hardware device list for setup and signing', () => {
    expect(hardwareDeviceList).toContain('{#each devices as device (device.id)}');
    expect(hardwareDeviceList).toContain('onclick={onrescan}');
    for (const route of [hardwareSetup, singleKeySend]) {
      expect(route).toContain('<HardwareDeviceList');
    }
  });

  it('shows saved signer names only after matching scanned fingerprints', () => {
    expect(hardwareDeviceList).toContain('hardwareDeviceDisplayName(device, savedSigners)');
    expect(singleKeySend).toContain('savedSigners={externalWallet ? [externalWallet.signer] : []}');
    expect(multisigSend).toContain('hardwareDeviceDisplayName(device, wallet?.cosigners ?? [])');
    expect(singleKeyReceive).toContain('savedSigners={savedSignerFingerprint && savedSignerLabel');
    expect(multisigReceive).toContain('savedSigners={wallet?.cosigners ?? []}');
  });

  it('performs only one all-backend HWI scan per multisig setup request', () => {
    const start = multisigSetup.indexOf('async function scanHardware()');
    const end = multisigSetup.indexOf('function closeHardwareScan()', start);
    const scanSource = multisigSetup.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(scanSource.match(/listHardwareDevices\(\)/g)).toHaveLength(1);
    expect(scanSource).not.toContain('setTimeout');
    expect(scanSource).not.toContain('mergeHardwareDiscovery');
  });

  it('reuses the matched setup device instead of scanning every backend for policy review', () => {
    const start = multisigSetup.indexOf('async function openDraftPolicyVerification');
    const end = multisigSetup.indexOf('async function verifyDraftPolicy', start);
    const reviewSource = multisigSetup.slice(start, end);
    expect(reviewSource).toContain('hardware.find(');
    expect(reviewSource).toMatch(/if \(policyDevice\) \{[\s\S]*?return;/);
    expect(
      reviewSource.match(/listHardwareDevicesForTypes\(\[signer\.deviceType\]\)/g)
    ).toHaveLength(1);
    expect(reviewSource).not.toContain('listHardwareDevices()');
  });

  it('keeps BitBox policy guidance compact and device-local', () => {
    expect(policyReview).toContain('Use a new BitBox account name');
    expect(policyReview).toContain('It is separate from the Groot wallet name.');
    expect(policyReview).toContain('Begin on BitBox');
    expect(policyReview).not.toContain('Before you start on');
    expect(policyReview).not.toContain('Do not reuse the name of any existing');
  });

  it('does not present a policy-verification address as a payment request', () => {
    expect(policyReview).toContain(
      'Verification reference only. Do not fund this address directly'
    );
    expect(policyReview).toContain('use Receive to create a permanently labeled payment request');
  });

  it('offers a one-time label only for an unlabeled received multisig output', () => {
    expect(coins).toContain("utxo.provenance.context === 'received'");
    expect(coins).toContain("utxo.provenance.state === 'unknown'");
    expect(coins).toContain('!utxo.primaryLabel');
    expect(coins).toContain('walletService.claimObservedMultisigAddress');
    expect(coins).toContain('it cannot be changed or reused');
    expect(coins).toContain('<FieldCounter value={claimLabel} max={48} />');
    expect(coins).not.toContain('{[...claimLabel].length}/48');
  });

  it('does not draw an interactive focus outline around the modal container', () => {
    expect(appCss).toMatch(/\.modal:focus-visible\s*\{\s*outline:\s*none;\s*\}/);
  });

  it('refreshes the selected wallet before opening a newly created hardware wallet', () => {
    const created = hardwareSetup.indexOf('await walletService.createExternalSignerWallet');
    const refreshed = hardwareSetup.indexOf('await walletShell.refreshProfiles()', created);
    const opened = hardwareSetup.indexOf("await goto('/')", refreshed);
    expect(created).toBeGreaterThan(-1);
    expect(refreshed).toBeGreaterThan(created);
    expect(opened).toBeGreaterThan(refreshed);
  });

  it('does not require an unverifiable fingerprint attestation for Trezor imports', () => {
    const normalizedSetup = hardwareSetup.replace(/\s+/g, ' ');
    expect(normalizedSetup).toContain(
      "let isTrezor = $derived(Boolean(signer?.deviceType?.toLowerCase().includes('trezor')))"
    );
    expect(normalizedSetup).toContain(
      'Trezor does not show its master fingerprint during this export, so no fingerprint comparison is required here.'
    );
    expect(normalizedSetup).toContain("isTrezor ? 'Use this Trezor wallet'");
  });

  it('reserves the signer summary while the send wallet identity loads', () => {
    expect(singleKeySend).toContain('loading={!signerSummaryReady}');
    expect(singleKeySend).not.toContain('step < 4 && signerSummaryReady');
    expect(signerSummary).toContain('aria-busy={loading}');
    expect(signerSummary).toContain('class="send-signer-placeholder"');
    expect(appCss).toContain('.send-signers.loading::after');
  });

  it('keeps the single-key transaction review visible while choosing a signing transport', () => {
    const review = singleKeySend.search(
      /aria-label=\{externalProposal\?\.canFinalize\s*\?\s*'Signed transaction review'\s*:\s*'Transaction review'\}/
    );
    const cableAction = singleKeySend.indexOf('onclick={scanHardware}', review);
    expect(review).toBeGreaterThan(-1);
    expect(cableAction).toBeGreaterThan(review);
    expect(singleKeySend).toMatch(
      /<TransactionReviewDetails\s+\{proposal\}\s+onChangeAddress=\{\(\)\s*=>\s*\(?changeAddressOpen\s*=\s*true\)?\}\s*\/>/
    );
  });

  it('reveals the parent signing result after every terminal hardware response', () => {
    const closeHelper = multisigSend.slice(
      multisigSend.indexOf('function closeHardwareReviewOverlays()'),
      multisigSend.indexOf(
        'async function sign(',
        multisigSend.indexOf('function closeHardwareReviewOverlays()')
      )
    );
    const signing = multisigSend.slice(
      multisigSend.indexOf('async function sign('),
      multisigSend.indexOf(
        'function showTransactionDuringSigning()',
        multisigSend.indexOf('async function sign(')
      )
    );

    expect(closeHelper).toContain('hardwareAddressOpen = false');
    expect(closeHelper).toContain('hardwareChangeAddressOpen = false');
    expect(signing.match(/closeHardwareReviewOverlays\(\)/g)).toHaveLength(2);
    expect(signing).toMatch(
      /catch \(cause\) \{\s*closeHardwareReviewOverlays\(\);\s*policyReviewOpen = false;\s*deviceOpen = true;/
    );
  });
});
