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

  it('retries camera permission in place and centers focused phone inputs above the keyboard', () => {
    expect(scannerSource).toContain("name === 'NotAllowedError'");
    expect(scannerSource).toContain("translate($locale, 'Try camera again')");
    expect(routeSource).toContain("block: 'center'");
    expect(routeSource).toContain('class:keyboard-active={keyboardActive}');
    expect(routeSource).toContain('padding-bottom: max(45dvh');
  });
});
