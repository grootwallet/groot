import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const emptyState = readFileSync(new URL('./HardwareDeviceEmptyState.svelte', import.meta.url), 'utf8');
const addressComparison = readFileSync(new URL('./HardwareAddressComparison.svelte', import.meta.url), 'utf8');
const singleKeyReceive = readFileSync(new URL('../../routes/receive/+page.svelte', import.meta.url), 'utf8');
const multisigReceive = readFileSync(new URL('../../routes/multisig/receive/+page.svelte', import.meta.url), 'utf8');

describe('hardware receive verification UI', () => {
  it('keeps an explicit disclosure chevron in both receive flows', () => {
    for (const route of [singleKeyReceive, multisigReceive]) {
      expect(route).toContain('<HardwareAddressComparison');
    }
    expect(addressComparison).toContain('<summary><span>Address details</span><ChevronDown size={14}/></summary>');
    expect(appCss).toContain('.verification-details[open] summary svg { transform: rotate(180deg); }');
  });

  it('routes a locked Trezor through the bounded PIN modal in both receive flows', () => {
    for (const route of [singleKeyReceive, multisigReceive]) {
      expect(route).toContain("device.action==='prompt_pin'");
      expect(route).toContain('walletService.promptHardwarePin(device.id)');
      expect(route).toContain('walletService.sendHardwarePin(pinChallenge,positions)');
      expect(route).toContain('<TrezorPinModal');
      expect(route).toContain("description:'Scanning again so you can verify the unchanged address.'");
    }
  });

  it('uses a deliberate retry status instead of an unstyled empty-list paragraph', () => {
    expect(emptyState).toContain('class="hardware-device-empty" role="status"');
    expect(emptyState).toContain('onclick={onretry}');
    expect(emptyState).toContain('Scan again');
    for (const route of [singleKeyReceive, multisigReceive]) {
      expect(route).toContain('<HardwareDeviceEmptyState');
      expect(route).not.toMatch(/\{:else\}<p>No compatible/);
    }
  });

  it('uses signer terminology throughout the multisig receive flow', () => {
    expect(multisigReceive).toContain('No compatible signer found');
    expect(multisigReceive).toContain('Connect and unlock a signer saved in this wallet policy');
    expect(multisigReceive).not.toMatch(/cosigner/i);
  });
});
