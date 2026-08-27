import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { copyCatalog } from '$lib/i18n-catalog';

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
const modal = readFileSync(new URL('./Modal.svelte', import.meta.url), 'utf8');
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
const nativeWallet = readFileSync(
  new URL('../../../src-tauri/src/wallet.rs', import.meta.url),
  'utf8'
);

describe('hardware receive verification UI', () => {
  it('catalogs every native hardware device status message', () => {
    const start = nativeWallet.indexOf('fn hardware_device_dto(');
    const end = nativeWallet.indexOf('fn require_explicit_standard_wallet_selection(', start);
    const source = nativeWallet.slice(start, end);
    const messages = [...source.matchAll(/"([^"\n]+[.!?])"/g)].map((match) => match[1]);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(messages.length).toBeGreaterThanOrEqual(10);
    for (const message of messages) {
      expect(copyCatalog, `missing native hardware status translation: ${message}`).toHaveProperty(
        message
      );
    }
  });

  it('keeps the Trezor PIN matrix instruction short and position-focused', () => {
    const pinModal = readFileSync(new URL('./TrezorPinModal.svelte', import.meta.url), 'utf8');
    expect(pinModal).toContain('Match locations, not numbers');
    expect(pinModal).toContain(
      'For each PIN digit on Trezor, tap the blank cell in the same location.'
    );
    expect(pinModal).not.toContain('pin-grid-heading');
    expect(pinModal).not.toContain('recovery words or a hardware passphrase');
  });

  it('blocks every modal dismissal while a Trezor PIN challenge is active', () => {
    const pinModal = readFileSync(new URL('./TrezorPinModal.svelte', import.meta.url), 'utf8');
    expect(pinModal).toContain('if (challengeReady || busy)');
    expect(pinModal).toContain('attentionSignal += 1');
    expect(pinModal).toContain('Disconnect Trezor');
    expect(pinModal).toContain('I disconnected Trezor');
    expect(pinModal).toContain('Unplug Trezor to cancel the PIN request');
    expect(pinModal).toContain('await walletService.cancelHardwareOperations()');
    expect(pinModal).toContain('onclose={requestClose}');
  });

  it('acknowledges blocked modal dismissal with repeatable reduced-motion-safe feedback', () => {
    expect(verificationFlow).toContain('modalAttentionSignal += 1');
    expect(verificationFlow).toContain('attentionSignal={modalAttentionSignal}');
    expect(modal).toContain('class:modal-attention={attentionActive}');
    expect(appCss).toMatch(/@keyframes modal-attention/);
    expect(appCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.modal\.modal-attention\s*\{[\s\S]*?animation:\s*none !important;[\s\S]*?outline:/
    );
  });

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
      'const DISCOVERY_TIMEOUT: Duration = Duration::from_secs(90)'
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

  it('keeps an interactive review open until the device rejects it', () => {
    expect(verificationFlow).toContain('cancelRequested = true');
    expect(verificationFlow).toContain("verificationAction !== 'scan'");
    expect(verificationFlow).toContain('Cancel on your hardware device');
    expect(verificationFlow).toContain('finishVerificationClose(false)');
  });

  it('treats Coldcard address display as an automatic return without approval controls', () => {
    expect(verificationFlow).toContain('coldcardReturnsAddressAutomatically');
    expect(verificationFlow).toContain('Coldcard has no approval step');
    expect(verificationFlow).toContain('Waiting for Coldcard address display');
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

  it('keeps delayed Miniscript policies outside the pinned HWI USB boundary', () => {
    expect(multisigSetup).toContain(
      "{#if templateKind === 'standard'}<button onclick={scanHardware}"
    );
    expect(multisigReceive).toContain(
      '{#if !wallet?.recoveryTemplate}<HardwareReceiveVerification'
    );
    expect(multisigSend).toContain(
      '{#if !wallet?.recoveryTemplate}<Button variant="secondary" onclick={scan}'
    );
    expect(multisigSetup).toContain('use the offline PSBT workflow');
    expect(multisigSend).toContain('Use offline PSBT signing for this delayed policy.');
  });

  it('centralizes the bounded PIN and retry presentation', () => {
    expect(verificationFlow).toContain('walletService.promptHardwarePin(device.id)');
    expect(verificationFlow).toContain('walletService.sendHardwarePin(pinChallenge, positions)');
    expect(verificationFlow).toContain('<TrezorPinModal');
    expect(verificationFlow).toContain('await scanAfterPin();');
    expect(verificationFlow).toContain("trezors[0].action === 'confirm_empty_passphrase'");
    expect(verificationFlow).toContain("title={translate($locale, 'Use Trezor standard wallet?')}");
    expect(verificationFlow).toContain('onclick={confirmStandardWallet}');
    expect(verificationFlow).not.toContain(
      'Scanning again so you can verify the unchanged address.'
    );
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

  it('distinguishes phone-local and desktop-managed signers without inventing mobile certification', () => {
    expect(multisigPolicy).toContain("coordination?.role !== 'mobile_cosigner'");
    expect(multisigPolicy).toContain("'Available on this phone'");
    expect(multisigPolicy).toContain("'Managed on desktop'");
    expect(multisigPolicy).toContain('deviceContext={selectedSigner');
    expect(deviceDetails).toContain('deviceContext?: CoordinationSignerContext | null');
    expect(deviceDetails).toContain('{#if !deviceContext && oncheck}<section class="health-card"');
    expect(deviceDetails).toContain("translate($locale, 'Device type')");
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
    expect(verificationFlow).toContain('onclick={retryVerificationDevice}');
    expect(verificationFlow).toContain("translate($locale, 'Try this signer again')");
  });

  it('makes hardware policy review the verification step and uses the shared alert treatment', () => {
    expect(policyReview).toContain('class="hardware-inline-error" role="alert" aria-live="polite"');
    expect(policyReview).toContain("translate($locale, 'Device needs attention')");
    expect(policyReview).not.toContain('<p class="form-error" role="alert">{error}</p>');
    expect(policyReview).not.toContain('bind:checked={acknowledged}');
    expect(policyReview).toContain("translate($locale, 'Review on {device}'");
    expect(policyReview).toContain(
      '<ChevronRight class="policy-signer-details-chevron" size={15} aria-hidden="true" />'
    );
    expect(appCss).toContain('.policy-signer-details[open] .policy-signer-details-chevron');
    expect(appCss).toContain('transform: rotate(90deg);');
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
    expect(hardwareSetup).toContain('showRescan');
  });

  it('distinguishes discovery failures from account-key failures', () => {
    expect(hardwareSetup).toContain("errorTitle = $state('Could not scan hardware')");
    expect(hardwareSetup).toContain("errorTitle = 'Could not read the account key'");
    expect(hardwareSetup).toContain("errorTitle = 'Could not start hardware unlock'");
    expect(hardwareSetup).toContain('{:else if devices.length || !error}<HardwareDeviceList');
    expect(hardwareSetup).toContain('<strong>{translate($locale, errorTitle)}</strong>');
    expect(hardwareSetup).not.toContain(
      '<strong>Could not read the account key</strong><small>{error}</small>'
    );
    expect(hardwareSetup).toContain("? 'Try this signer again'");
    expect(hardwareSetup).toContain(
      'useDevice(lastAttemptedDevice, lastAttemptAllowedEmptyPassphrase)'
    );
    expect(hardwareSetup).toContain(
      "'BitBox may request its password again for this new secure connection. Enter it only on BitBox.'"
    );
    expect(hardwareDeviceList).toContain("if (device.status === 'detected') return 'Detected'");
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
    expect(policyReview).toContain('Review on BitBox');
    expect(policyReview).toContain('Enter a new device-local account name.');
    expect(policyReview).toContain('script type, account path, every account xpub');
    expect(policyReview).toContain('signer fingerprints remain a Groot reference');
    expect(policyReview).toContain("translate($locale, 'Review on {device}'");
    expect(policyReview).not.toContain('Before you start on');
    expect(policyReview).not.toContain('Do not reuse the name of any existing');
  });

  it('does not present a policy-verification address as a payment request', () => {
    expect(policyReview).toContain('Reference only. After setup, use Receive for payments.');
    expect(policyReview).not.toContain('Verification reference only. Do not fund');
  });

  it('offers a one-time label only for an unlabeled received multisig output', () => {
    expect(coins).toContain("utxo.provenance.context === 'received'");
    expect(coins).toContain("utxo.provenance.state === 'unknown'");
    expect(coins).toContain('!utxo.primaryLabel');
    expect(coins).toContain('walletService.claimObservedMultisigAddress');
    expect(coins).toContain('the assignment cannot be changed');
    expect(coins).toContain('<FieldCounter value={claimLabel} max={48} />');
    expect(coins).not.toContain('{[...claimLabel].length}/48');
  });

  it('does not draw an interactive focus outline around the modal container', () => {
    expect(appCss).toMatch(/\.modal:focus-visible\s*\{\s*outline:\s*none;\s*\}/);
  });

  it('refreshes the selected wallet before opening a newly created hardware-signer wallet', () => {
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

  it('gives Coldcard users an on-device fingerprint comparison guide', () => {
    const normalizedSetup = hardwareSetup.replace(/\s+/g, ' ');
    expect(normalizedSetup).toContain(
      "let isColdcard = $derived(Boolean(signer?.deviceType?.toLowerCase().includes('coldcard')))"
    );
    expect(normalizedSetup).toContain('See Coldcard fingerprint steps');
    expect(normalizedSetup).toContain(
      'On Coldcard, return to the main menu and select Advanced/Tools.'
    );
    expect(normalizedSetup).toContain('Select View Identity.');
    expect(normalizedSetup).toContain('8-character Master Key Fingerprint (XFP)');
    expect(normalizedSetup).toContain(
      "isFileImport ? 'Use this public backup' : 'Fingerprint matches'"
    );
    expect(appCss).toContain('.coldcard-fingerprint-guide ol');
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

  it('lets a single-key hardware-signer wallet discard its local signature without canceling payment', () => {
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
    expect(signing).toContain('deviceOpen = !hardwareCancelRequested');
    expect(signing).toContain('deviceError = hardwareCancelRequested');
  });

  it('keeps locked signer matching fail-closed while allowing one eligible device family', () => {
    expect(multisigSend).toContain('savedSignerCandidatesForDevice(');
    expect(multisigSend).toContain('candidates.length === 1 ? candidates[0] : null');
    expect(multisigSend).toContain(
      'More than one saved signer uses this device family. Unlock the intended device and rescan'
    );
    expect(multisigSend).toContain(
      'Unlock this device and rescan so Groot can bind it to an eligible saved signer.'
    );
  });

  it('turns hardware-signing close requests into visible on-device cancellation guidance', () => {
    for (const route of [multisigSend, singleKeySend]) {
      expect(route).toContain('hardwareCancelRequested = true');
      expect(route).toContain('hardwareAttentionSignal += 1');
      expect(route).toContain('attentionSignal={hardwareAttentionSignal}');
      expect(route).toContain('Cancel on your hardware device');
      expect(route).toContain('Waiting for hardware cancellation');
    }
    expect(multisigSend).toContain('onclose={closePolicyReview}');
    expect(multisigSend).toContain('View policy reference');
  });
});
