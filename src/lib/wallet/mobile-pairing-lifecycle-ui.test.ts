import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(
  fileURLToPath(new URL('../../routes/mobile/pair/+page.svelte', import.meta.url)),
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
});
