import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const emptyState = readFileSync(new URL('./HardwareDeviceEmptyState.svelte', import.meta.url), 'utf8');
const addressComparison = readFileSync(new URL('./HardwareAddressComparison.svelte', import.meta.url), 'utf8');
const verificationFlow = readFileSync(new URL('./HardwareReceiveVerification.svelte', import.meta.url), 'utf8');
const singleKeyReceive = readFileSync(new URL('../../routes/receive/+page.svelte', import.meta.url), 'utf8');
const multisigReceive = readFileSync(new URL('../../routes/multisig/receive/+page.svelte', import.meta.url), 'utf8');

describe('hardware receive verification UI', () => {
  it('keeps one shared verification component in both receive flows', () => {
    for (const route of [singleKeyReceive, multisigReceive]) {
      expect(route).toContain('<HardwareReceiveVerification');
      expect(route).not.toContain('<TrezorPinModal');
    }
    expect(verificationFlow).toContain('<HardwareAddressComparison');
    expect(addressComparison).toContain('<summary><span>Address details</span><ChevronDown size={14}/></summary>');
    expect(appCss).toContain('.verification-details[open] summary svg { transform: rotate(180deg); }');
  });

  it('centralizes the bounded PIN and retry presentation', () => {
    expect(verificationFlow).toContain('walletService.promptHardwarePin(device.id)');
    expect(verificationFlow).toContain('walletService.sendHardwarePin(pinChallenge, positions)');
    expect(verificationFlow).toContain('<TrezorPinModal');
    expect(verificationFlow).toContain('Scanning again so you can verify the unchanged address.');
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
    expect(`${verificationFlow}\n${multisigReceive}`).not.toMatch(/cosigner/i);
  });
});
