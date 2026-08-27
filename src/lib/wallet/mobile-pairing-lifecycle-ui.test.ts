import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(
  fileURLToPath(new URL('../../routes/mobile/pair/+page.svelte', import.meta.url)),
  'utf8'
);
const appStyles = readFileSync(fileURLToPath(new URL('../../app.css', import.meta.url)), 'utf8');
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
    expect(routeSource).toContain('role="status"');
    expect(routeSource).toContain('role="alert"');
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
    expect(scannerSource).toMatch(/\.camera-frame\s*\{[\s\S]*?position:\s*relative/);
    expect(routeSource).toContain('window.visualViewport');
    expect(routeSource).toContain('font-size: 16px');
    expect(routeSource).toContain('class:keyboard-active={keyboardActive}');
    expect(routeSource).toContain('padding-bottom: max(45dvh');
  });

  it('keeps pairing focused by hiding wallet navigation and explaining the desktop handoff', () => {
    expect(appShellSource).toContain("page.url.pathname === '/mobile/pair'");
    expect(appShellSource).toContain('!mobileSetupRoute');
    expect(desktopRouteSource).toContain('Continue adding the remaining signers on desktop.');
    expect(routeSource).toContain('Finish wallet setup on desktop');
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
});
