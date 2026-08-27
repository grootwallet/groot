import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(
  fileURLToPath(new URL('../../routes/mobile/pair/+page.svelte', import.meta.url)),
  'utf8'
);
const recoveryRouteSource = readFileSync(
  fileURLToPath(new URL('../../routes/mobile/recover/+page.svelte', import.meta.url)),
  'utf8'
);
const appStyles = readFileSync(fileURLToPath(new URL('../../app.css', import.meta.url)), 'utf8');
const appHtml = readFileSync(fileURLToPath(new URL('../../app.html', import.meta.url)), 'utf8');
const desktopRouteSource = readFileSync(
  fileURLToPath(new URL('../../routes/multisig/new/+page.svelte', import.meta.url)),
  'utf8'
);
const modalSource = readFileSync(
  fileURLToPath(new URL('../components/Modal.svelte', import.meta.url)),
  'utf8'
);
const scannerSource = readFileSync(
  fileURLToPath(new URL('../components/UrQrScanner.svelte', import.meta.url)),
  'utf8'
);
const overviewSource = readFileSync(
  fileURLToPath(new URL('../../routes/+page.svelte', import.meta.url)),
  'utf8'
);
const iosNativeSource = readFileSync(
  fileURLToPath(new URL('../../../src-tauri/src/native_backup/ios.mm', import.meta.url)),
  'utf8'
);
const appShellSource = readFileSync(
  fileURLToPath(new URL('../components/AppShell.svelte', import.meta.url)),
  'utf8'
);
const animatedQrSource = readFileSync(
  fileURLToPath(new URL('../components/AnimatedUrQr.svelte', import.meta.url)),
  'utf8'
);
const deviceDetailsSource = readFileSync(
  fileURLToPath(new URL('../components/DeviceDetailsModal.svelte', import.meta.url)),
  'utf8'
);
const multisigRouteSource = readFileSync(
  fileURLToPath(new URL('../../routes/multisig/+page.svelte', import.meta.url)),
  'utf8'
);
const coordinationCommandsSource = readFileSync(
  fileURLToPath(new URL('../../../src-tauri/src/wallet/coordination_commands.rs', import.meta.url)),
  'utf8'
);
const macosCameraEntitlements = readFileSync(
  fileURLToPath(new URL('../../../src-tauri/Entitlements.camera.plist', import.meta.url)),
  'utf8'
);
const macosRegtestConfig = readFileSync(
  fileURLToPath(new URL('../../../src-tauri/tauri.macos-regtest-dev.conf.json', import.meta.url)),
  'utf8'
);

describe('mobile pairing lifecycle UI', () => {
  it('offers credential-gated resume and explicit cancellation for native staging', () => {
    expect(routeSource).toContain('walletService.pendingMobilePairings()');
    expect(routeSource).toContain(
      'walletService.resumePairingOnMobile(selectedPendingSession, resumePin)'
    );
    expect(routeSource).toContain('walletService.cancelPairing(selectedPendingSession)');
    expect(routeSource).toContain('pin = resumePin;');
    expect(routeSource).toContain("resumePin = '';");
    expect(routeSource).toContain("stage = response.awaitingFinalPolicy ? 'final' : 'response';");
    expect(routeSource).toContain('walletService.awaitFinalPairingPolicy(response.sessionId, pin)');
    expect(routeSource).toContain('role="status"');
    expect(routeSource).toContain('role="alert"');
  });

  it('shows one explicit pairing path with navigation and persistent step progress', () => {
    expect(routeSource).toContain(
      "import SetupProgress from '$lib/components/SetupProgress.svelte'"
    );
    expect(routeSource).toContain("translate($locale, 'Pairing progress')");
    expect(routeSource).toContain('href="/"');
    expect(routeSource).toContain("translate($locale, 'Back to wallet')");
    expect(routeSource).toContain(
      '{:else if pendingPairingsLoaded && pendingPairings.length === 0}'
    );
    expect(routeSource).toContain("translate($locale, 'Desktop scanned this phone key')");
  });

  it('shows the invitation-bound comparison code before creating the phone key', () => {
    expect(routeSource).toContain('comparisonCode = decoded.comparisonCode;');
    expect(routeSource.indexOf('Both devices must show')).toBeLessThan(
      routeSource.indexOf('Create phone key')
    );
  });

  it('keeps pairing warning icons and copy in separate grid columns', () => {
    expect(appStyles).toMatch(
      /\.mobile-pairing-flow > \.warning-box\s*\{[\s\S]*?grid-template-columns:\s*auto minmax\(0, 1fr\)/
    );
    expect(appStyles).toContain('.mobile-pairing-flow > .warning-box > svg');
  });

  it('blocks accidental pairing-modal dismissal and provides an intentional cancel action', () => {
    expect(desktopRouteSource).toMatch(/open=\{mobilePairOpen\}[\s\S]*?dismissible=\{false\}/);
    expect(desktopRouteSource).toContain("translate($locale, 'Cancel pairing')");
    expect(modalSource).toContain('if (dismissible)');
    expect(modalSource).toContain('showAttention();');
  });

  it('retries camera permission and centers non-zooming phone inputs in the visible viewport', () => {
    expect(scannerSource).toContain("name === 'NotAllowedError'");
    expect(scannerSource).toContain('navigator.mediaDevices.getUserMedia');
    expect(scannerSource).toContain("error ? 'Try camera again' : 'Allow camera'");
    expect(scannerSource).toContain('class="camera-frame"');
    expect(scannerSource).toContain('class:camera-inactive={!cameraActive}');
    expect(scannerSource).toContain('.camera-frame.camera-inactive');
    expect(scannerSource).toContain('class="scanner-retry full"');
    expect(scannerSource).toContain('class:camera-active={cameraActive}');
    expect(scannerSource).toContain('.scanner:not(.camera-active)');
    expect(scannerSource).toMatch(/\.camera-frame\s*\{[\s\S]*?position:\s*relative/);
    expect(appShellSource).toContain("document.addEventListener('focusin', centerMobileField)");
    expect(appShellSource).toContain("field.scrollIntoView({ block: 'center'");
    expect(appHtml).toContain('maximum-scale=1, user-scalable=no');
    expect(routeSource).toContain('font-size: 16px');
    expect(routeSource).toContain('class:keyboard-active={keyboardActive}');
    expect(routeSource).toContain('padding-bottom: max(45dvh');
  });

  it('keeps pairing focused by hiding wallet navigation and explaining the desktop handoff', () => {
    expect(appShellSource).toContain("page.url.pathname === '/mobile/pair'");
    expect(appShellSource).toContain('!mobileSetupRoute');
    expect(desktopRouteSource).toContain('desktop will show one final QR for the phone.');
    expect(routeSource).toContain('Finish wallet setup on desktop');
    expect(routeSource).toContain('It will show one final wallet QR next.');
    expect(routeSource).toContain('class="full pairing-exit" href="/"');
  });

  it('refreshes the shell after mobile profile creation and keeps new profiles in navigation', () => {
    expect(appShellSource).toContain("'/mobile/pair'");
    expect(appShellSource).toContain("'/mobile/watch'");
    expect(appShellSource).toContain("'/mobile/recover'");
    expect(appShellSource).toContain('const known = profiles.some');
    expect(appShellSource).toContain(': [...profiles, event.profile]');
    expect(appShellSource).toContain('selectedWalletId = event.profile.id;');
  });

  it('keeps signing keys before backup actions and limits live checks to desktop USB signers', () => {
    expect(appStyles).not.toMatch(/\.vault-backup-card\s*\{\s*order:\s*-1/);
    expect(multisigRouteSource).toContain("selectedSigner?.source === 'usb'");
    expect(multisigRouteSource).toContain("coordination?.role !== 'mobile_cosigner'");
  });

  it('limits V1 to one Groot phone and preserves a retry after wallet creation', () => {
    expect(desktopRouteSource).toContain("signer.deviceType === 'groot-mobile'");
    expect(desktopRouteSource).toContain('disabled={hasGrootPhoneSigner}');
    expect(desktopRouteSource).toContain('One Groot phone signer per wallet in V1');
    expect(desktopRouteSource).toContain(
      'createdWalletNeedsFinalPolicy = Boolean(mobileSessionId)'
    );
    expect(desktopRouteSource).toContain('Retry final phone QR');
    expect(desktopRouteSource).toContain('Do not create this wallet again.');
  });

  it('labels only the shared phone fingerprint instead of comparing unrelated xpub text', () => {
    expect(routeSource).toContain("translate($locale, 'Phone key fingerprint')");
    expect(desktopRouteSource).toContain("translate($locale, 'Phone key fingerprint')");
    expect(desktopRouteSource).not.toContain('mobileCandidate.xpub.slice(-8)');
  });

  it('does not leave an empty signer-detail grid cell', () => {
    expect(deviceDetailsSource).toContain('class="connection-detail"');
    expect(appStyles).toContain('.device-details .connection-detail');
    expect(appStyles).toMatch(
      /\.device-details \.connection-detail\s*\{[\s\S]*?grid-column:\s*1 \/ -1/
    );
  });

  it('shows bounded multipart QR scan progress on desktop and mobile', () => {
    expect(scannerSource).toContain('expectedParts');
    expect(scannerSource).toContain('Math.min(99');
    expect(scannerSource).toContain('scanComplete');
    expect(scannerSource).toContain('<progress max="100"');
    expect(scannerSource).toContain("translate($locale, 'QR scan progress')");
    expect(scannerSource).toContain("'{scanned} frames scanned · about {progress}%'");
    expect(scannerSource).toContain('expectedParts * 2');
    expect(scannerSource).toContain('pendingFrames.push(frame)');
    expect(scannerSource).toContain('await processPendingFrames()');
    expect(scannerSource).toMatch(/\.camera-frame\s*\{[\s\S]*?aspect-ratio:\s*1/);
    expect(scannerSource).toMatch(/\.scan-guide\s*\{[\s\S]*?inset:\s*12%/);
    expect(scannerSource).toMatch(/\.scanner\s*\{[\s\S]*?38rem/);
    expect(desktopRouteSource).toContain('wide={mobilePairScan && !mobileCandidate}');
    expect(desktopRouteSource).toContain('return true;');
    expect(routeSource).toContain('return true;');
  });

  it('uses lower-density expandable phone-response QR frames at a readable cadence', () => {
    expect(coordinationCommandsSource).toContain('MOBILE_RESPONSE_FRAGMENT_BYTES: usize = 160');
    expect(routeSource).toContain('intervalMs={1400}');
    expect(routeSource).toContain('expandable');
    expect(animatedQrSource).toContain('class="qr-overlay"');
    expect(animatedQrSource).toContain('overlay?.focus()');
  });

  it('gives only the isolated signed macOS camera harness native camera access', () => {
    expect(macosCameraEntitlements).toContain('com.apple.security.device.camera');
    expect(macosCameraEntitlements).not.toContain('audio-input');
    expect(macosCameraEntitlements).not.toContain('screen');
    expect(macosRegtestConfig).toContain('app.groot.wallet.regtest.desktop.dev');
    expect(macosRegtestConfig).toContain('Entitlements.camera.plist');
  });

  it('surfaces staged pairing on overview before the user returns to the pairing route', () => {
    expect(overviewSource).toContain('walletService.pendingMobilePairings()');
    expect(overviewSource).toContain("translate($locale, 'Wallet pairing in progress')");
    expect(overviewSource).toContain('href="/mobile/pair"');
  });

  it('keeps mobile recovery words native in a padded two-column non-scrolling grid', () => {
    expect(iosNativeSource).toContain('groot_present_ios_recovery_words');
    expect(iosNativeSource).toContain('makeColumn(0), makeColumn(12)');
    expect(iosNativeSource).toContain('UIStackViewDistributionFillEqually');
    expect(iosNativeSource).toContain('monospacedSystemFontOfSize:16.0');
    expect(iosNativeSource).toContain('Bitcoin recovery words');
    expect(iosNativeSource).not.toContain('UIScrollView');
  });

  it('restores a replacement phone only through native words and exact public-policy validation', () => {
    expect(multisigRouteSource).toContain('walletService.mobileRecoveryRecord()');
    expect(multisigRouteSource).toContain("translate($locale, 'Restore Groot phone')");
    expect(multisigRouteSource).toContain('<AnimatedUrQr');
    expect(recoveryRouteSource).toContain('walletService.inspectMobileRecoveryRecord(nextFrames)');
    expect(recoveryRouteSource).toContain('walletService.recoverMobileSigner(frames, pin)');
    expect(recoveryRouteSource).not.toMatch(/mnemonic|recoveryWords|seed/i);
    expect(iosNativeSource).toContain('groot_recover_ios_mnemonic');
    expect(iosNativeSource).toContain('Enter exactly 24 words.');
    expect(coordinationCommandsSource).toContain('validate_mobile_wallet_record');
    expect(coordinationCommandsSource).toContain('descriptor.first_address');
    expect(coordinationCommandsSource).toContain('derive_mobile_account(mnemonic)');
  });
});
