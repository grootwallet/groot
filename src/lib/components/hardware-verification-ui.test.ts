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
const verificationStatus = readFileSync(
  new URL('./HardwareVerificationStatus.svelte', import.meta.url),
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
const hardwareTransport = readFileSync(
  new URL('../../../src-tauri/src/hardware.rs', import.meta.url),
  'utf8'
);

describe('hardware receive verification UI', () => {
  it('localizes the hardware-verification tooltip as well as its accessible label', () => {
    expect(verificationStatus).toContain('<Tooltip text={translate($locale, explanation)}>');
    expect(verificationStatus).toContain('explanation: translate($locale, explanation)');
  });

  it('targets the saved signer for single-key hardware signing', () => {
    const scan = singleKeySend.slice(
      singleKeySend.indexOf('async function scanHardware()'),
      singleKeySend.indexOf('async function signHardware')
    );
    expect(scan).toContain('findSavedHardwareDevice(externalWallet.signer)');
    expect(scan).toContain('hardwareScanGeneration');
  });

  it('bounds, coordinates, and cancels native HWI work', () => {
    expect(hardwareTransport).toContain(
      'const DISCOVERY_TIMEOUT: Duration = Duration::from_secs(30)'
    );
    expect(hardwareTransport).toContain(
      'static HWI_COORDINATOR: OnceLock<HardwareCoordinator> = OnceLock::new()'
    );
    expect(hardwareTransport).toContain('HardwareError::Busy');
    expect(hardwareTransport).toContain('cancel_hardware_operations');
    expect(hardwareTransport).toContain('cancel_hardware_operations_and_wait');
    expect(hardwareTransport).toContain('const HWI_FIXED_ARGV: &[&str] = &["--stdin"]');
  });

  it('waits for native cleanup before reopening receive verification', () => {
    expect(verificationFlow).toContain('beginHardwareCancellation()');
    expect(verificationFlow).toContain('await waitForHardwareCancellation()');
    expect(verificationFlow).toContain('generation !== hardwareScanGeneration || !verifyOpen');
  });

  it('keeps one shared verification component in both receive flows', () => {
    for (const route of [singleKeyReceive, multisigReceive]) {
      expect(route).toContain('<HardwareReceiveVerification');
      expect(route).not.toContain('<TrezorPinModal');
    }
    expect(verificationFlow).toContain('<HardwareAddressComparison');
    expect(addressComparison).toMatch(
      /<summary>\s*<span>\{translate\(\$locale, 'Address details'\)\}<\/span>\s*<ChevronDown size=\{14\}\s*\/>\s*<\/summary>/
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

  it('redeems a detected unlock capability without starting another scan', () => {
    expect(verificationFlow).toContain("device.action === 'unlock'");
    expect(verificationFlow).toContain('verifyAddress(device, true)');
    expect(verificationFlow).toContain(
      "disabled={device.action === 'none' || device.action === 'retry'}"
    );
    expect(verificationFlow).toContain("'Unlock & continue'");
    expect(hardwareSetup).toContain("device.action !== 'unlock'");
    expect(multisigSetup).toContain("device.action === 'unlock'");
    expect(multisigSend).toContain("device.action === 'unlock'");
  });

  it('exposes the shared identity health check for external single-key signers', () => {
    expect(overview).toContain("<strong>{translate($locale, 'Health check')}</strong>");
    expect(overview).toContain('walletService.checkHardwareExternalSigner');
    expect(overview).toContain('<DeviceDetailsModal');
    expect(settings).toContain("{translate($locale, 'Hardware signer identity & health')}");
    expect(settings).toContain('walletService.checkHardwareExternalSigner');
    expect(settings).toMatch(/<LocalTimestamp\s+value=\{signerHealth\.checkedAt\}\s*\/>/);
    expect(settings).toContain("'Not checked'");
    expect(settings).toContain('<DeviceDetailsModal');
    expect(deviceDetails).toContain("title={translate($locale, 'Checking signer')}");
    expect(deviceDetails).toContain(
      "detail={translate($locale, 'Keep it connected and unlocked.')}"
    );
    expect(deviceDetails).toContain("'Signer matches this wallet.'");
  });

  it('uses a deliberate retry status instead of an unstyled empty-list paragraph', () => {
    expect(emptyState).toContain('class="hardware-device-empty" role="status"');
    expect(emptyState).toContain('onclick={onretry}');
    expect(emptyState).toContain('Scan again');
    expect(verificationFlow).toContain('<HardwareDeviceEmptyState');
    expect(verificationFlow).not.toMatch(/\{:else\}<p>No compatible/);
  });

  it('renders receive-verification failures with the shared hardware alert treatment', () => {
    expect(verificationFlow).toContain(
      'class="hardware-inline-error" role="alert" aria-live="polite"'
    );
    expect(verificationFlow).toContain("translate($locale, 'Device needs attention')");
    expect(verificationFlow).not.toContain('<p class="form-error" role="alert">{verifyError}</p>');
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
    expect(deviceDetails).toContain('Keep it connected and unlocked.');
  });

  it('reuses one bounded hardware device list for setup and signing', () => {
    expect(hardwareDeviceList).toContain('{#each devices as device (device.id)}');
    expect(hardwareDeviceList).toContain('onclick={onrescan}');
    for (const route of [hardwareSetup, singleKeySend]) {
      expect(route).toContain('<HardwareDeviceList');
    }
  });

  it('distinguishes discovery failures from account-key failures', () => {
    expect(hardwareSetup).toContain("errorTitle = $state('Could not scan hardware')");
    expect(hardwareSetup).toContain("errorTitle = 'Could not read the account key'");
    expect(hardwareSetup).toContain('{:else if devices.length || !error}<HardwareDeviceList');
    expect(hardwareSetup).toContain('<strong>{translate($locale, errorTitle)}</strong>');
    expect(hardwareSetup).not.toContain(
      '<strong>Could not read the account key</strong><small>{error}</small>'
    );
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

  it('reuses the matched setup device or resolves only the saved signer backend for policy review', () => {
    const start = multisigSetup.indexOf('async function openDraftPolicyVerification');
    const end = multisigSetup.indexOf('async function verifyDraftPolicy', start);
    const reviewSource = multisigSetup.slice(start, end);
    expect(reviewSource).toContain('hardware.find(');
    expect(reviewSource).toMatch(/if \(policyDevice\) \{[\s\S]*?return;/);
    expect(reviewSource.match(/findSavedHardwareDevice\(signer\)/g)).toHaveLength(1);
    expect(reviewSource).not.toContain('listHardwareDevicesForTypes');
    expect(reviewSource).not.toContain('listHardwareDevices()');
  });

  it('keeps saved-signer policy lookup cancellable and uses device-neutral copy', () => {
    expect(multisigSetup).toContain('policyLookupGeneration += 1');
    expect(multisigSetup).toContain('closeDraftPolicyVerification');
    expect(multisigSetup).toContain(
      'Keep the saved signer connected and unlocked while Groot checks its account key.'
    );
    expect(multisigSetup).not.toContain(
      'Keep the device connected, unlocked, and in its Bitcoin app while Groot matches the saved fingerprint.'
    );
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
      'Trezor does not show its master fingerprint during this export, so no fingerprint'
    );
    expect(normalizedSetup).toContain('comparison is required here. After setup');
    expect(normalizedSetup).toContain("isTrezor ? 'Use this Trezor wallet'");
  });

  it('does not require an unverifiable fingerprint attestation for Nova imports', () => {
    const normalizedSetup = hardwareSetup.replace(/\s+/g, ' ');
    expect(normalizedSetup).toContain(
      "signer?.deviceType?.toLowerCase().includes('bitbox') && signer.label.toLowerCase().includes('nova')"
    );
    expect(normalizedSetup).toContain(
      'Nova does not show its fingerprint during this import, so no fingerprint comparison'
    );
    expect(normalizedSetup).toContain('is required here. After setup');
    expect(normalizedSetup).toContain("isBitBoxNova ? 'Use this Nova wallet'");
    expect(normalizedSetup).toContain(
      "description={translate($locale, 'Quit other wallet apps so Groot can use USB.')}"
    );
    expect(normalizedSetup).toContain("'Keep the signer connected and unlocked.'");
  });

  it('reserves the signer summary while the send wallet identity loads', () => {
    expect(singleKeySend).toContain('loading={!signerSummaryReady}');
    expect(singleKeySend).not.toContain('step < 4 && signerSummaryReady');
    expect(signerSummary).toContain('aria-busy={loading}');
    expect(signerSummary).toContain('class="send-signer-placeholder"');
    expect(appCss).toContain('.send-signers.loading::after');
  });

  it('keeps the single-key transaction review visible while choosing a signing transport', () => {
    const review = singleKeySend.indexOf(
      "externalProposal?.canFinalize ? 'Signed transaction review'"
    );
    const cableAction = singleKeySend.indexOf('onclick={scanHardware}', review);
    expect(review).toBeGreaterThan(-1);
    expect(cableAction).toBeGreaterThan(review);
    expect(singleKeySend).toMatch(
      /<TransactionReviewDetails\s+\{proposal\}\s+onChangeAddress=\{\(\)\s*=>\s*\(?changeAddressOpen\s*=\s*true\)?\}\s*\/>/
    );
  });

  it('lets a single-key hardware wallet discard its local signature without canceling payment', () => {
    expect(singleKeySend).toContain('ondiscard={externalSigner');
    expect(singleKeySend).toContain('walletService.discardExternalSignerSignature(');
    expect(singleKeySend).toContain("title={translate($locale, 'Discard local signature?')}");
    expect(singleKeySend).toContain('This does not revoke the signature.');
    expect(singleKeySend).toContain('The transaction details are unchanged');
    expect(singleKeySend).toContain("{translate($locale, 'Keep signature')}</Button");
    expect(singleKeySend).toContain("{translate($locale, 'Discard local signature')}</Button");
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
